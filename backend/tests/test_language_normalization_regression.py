import json
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from passlib.context import CryptContext
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import get_db
from app.models.base import Base
from app.core.languages import normalize_language, LANG_NAME
from app.core.security import create_access_token
from app.main import app
from app.models.case import ClinicalCase
from app.models.user import User

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_lang_regression.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _patient_token(case_id: str) -> str:
    return create_access_token({"role": "patient", "case_id": case_id})


def _doctor_token(username: str = "doc1") -> str:
    return create_access_token({"sub": username, "role": "doctor"})


def _create_case(db, language: str) -> ClinicalCase:
    case = ClinicalCase(
        caseId=f"case-lang-{uuid.uuid4().hex[:8]}",
        patientId=f"P-{uuid.uuid4().hex[:4]}",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
        language=language,
        status="intake",
        consentGranted=True,
        intakeAnswers={},
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


# ── 1. Unit Tests for normalize_language ───────────────────────────────────────

def test_normalize_language_comprehensive():
    # Kannada variations
    kannada_inputs = ["Kannada", "kannada", "kn", "kn-IN", "kn_IN", "ಕನ್ನಡ", "ka", "ka-IN", "kannada (kn)"]
    for val in kannada_inputs:
        assert normalize_language(val) == "kn", f"Failed for {val}"

    # Hindi variations
    hindi_inputs = ["Hindi", "hindi", "hi", "hi-IN", "hi_IN", "हिंदी", "हिन्दी", "hindi (hi)"]
    for val in hindi_inputs:
        assert normalize_language(val) == "hi", f"Failed for {val}"

    # English & fallback variations
    english_inputs = ["English", "english", "en", "en-IN", "en_IN", "en-US", None, "", "   ", "unknown", "de"]
    for val in english_inputs:
        assert normalize_language(val) == "en", f"Failed for {val}"


def test_normalize_database_existing_values():
    """Verify all 9 unique values found in actual DB normalize correctly."""
    db_values = {None, 'Kannada', 'en-IN', 'kn', 'Hindi', 'hi', 'de', 'en', 'English'}
    expected = {
        None: 'en',
        'Kannada': 'kn',
        'en-IN': 'en',
        'kn': 'kn',
        'Hindi': 'hi',
        'hi': 'hi',
        'de': 'en',
        'en': 'en',
        'English': 'en',
    }
    for val in db_values:
        assert normalize_language(val) == expected[val]


# ── 2. Real Stored Dropdown Value: Kannada Translation & Red-Flag Screening ───

@patch("app.services.translation_service.Groq")
def test_kannada_dropdown_value_translation_and_red_flag(mock_groq_cls, client, db):
    """Real stored language='Kannada' must translate chest pain (ಎದೆ ನೋವು) to English and trigger red flag."""
    mock_groq_cls.return_value.chat.completions.create.return_value.choices[
        0
    ].message.content = json.dumps(["severe chest pain radiating to left arm and breathlessness"])

    case = _create_case(db, language="Kannada")
    token = _patient_token(case.caseId)

    kannada_answer = "ತೀವ್ರ ಎದೆ ನೋವು ಮತ್ತು ಎಡತೋಳಿಗೆ ಹರಡುತ್ತಿದೆ"
    resp = client.put(
        f"/api/v1/cases/{case.caseId}",
        json={"intakeAnswers": {"chief_complaint": kannada_answer}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text

    db.refresh(case)
    stored = case.intakeAnswers.get("chief_complaint")
    assert isinstance(stored, dict)
    assert stored["lang"] == "kn"
    assert stored["original"] == kannada_answer
    assert "chest pain" in stored["value"].lower()

    # Verify red flag safety escalation fired on English text
    derived = case.derivedClinicalData or {}
    safety = derived.get("safetyEscalation")
    assert safety is not None
    assert safety.get("isEscalated") is True
    red_flags = safety.get("redFlags", [])
    assert any("chest pain" in rf.lower() or "cardiovascular" in rf.lower() or "critical" in rf.lower() for rf in red_flags)


# ── 3. Real Stored Dropdown Value: Hindi Translation & Red-Flag Screening ───────

@patch("app.services.translation_service.Groq")
def test_hindi_dropdown_value_translation_and_red_flag(mock_groq_cls, client, db):
    """Real stored language='Hindi' must translate chest pain (सीने में दर्द) to English and trigger red flag."""
    mock_groq_cls.return_value.chat.completions.create.return_value.choices[
        0
    ].message.content = json.dumps(["severe chest pain and shortness of breath"])

    case = _create_case(db, language="Hindi")
    token = _patient_token(case.caseId)

    hindi_answer = "सीने में तेज दर्द और सांस लेने में तकलीफ"
    resp = client.put(
        f"/api/v1/cases/{case.caseId}",
        json={"intakeAnswers": {"chief_complaint": hindi_answer}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text

    db.refresh(case)
    stored = case.intakeAnswers.get("chief_complaint")
    assert isinstance(stored, dict)
    assert stored["lang"] == "hi"
    assert stored["original"] == hindi_answer
    assert "chest pain" in stored["value"].lower()

    # Verify red flag safety escalation fired on English text
    derived = case.derivedClinicalData or {}
    safety = derived.get("safetyEscalation")
    assert safety is not None
    assert safety.get("isEscalated") is True
    red_flags = safety.get("redFlags", [])
    assert any("chest pain" in rf.lower() or "cardiovascular" in rf.lower() or "critical" in rf.lower() for rf in red_flags)


# ── 4. Groq Forced to Fail: Sets translationFailed & Manual-Review Banner ──────

@patch("app.services.translation_service.Groq")
def test_kannada_groq_forced_fail_sets_manual_review(mock_groq_cls, client, db):
    """When Groq fails on language='Kannada', translationFailed is set and manual review is flagged."""
    mock_groq_cls.side_effect = RuntimeError("Groq API rate limit or outage")

    case = _create_case(db, language="Kannada")
    token = _patient_token(case.caseId)

    kannada_answer = "ಎದೆ ನೋವು"
    resp = client.put(
        f"/api/v1/cases/{case.caseId}",
        json={"intakeAnswers": {"chief_complaint": kannada_answer}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text

    db.refresh(case)
    stored = case.intakeAnswers.get("chief_complaint")
    assert isinstance(stored, dict)
    assert stored.get("translationFailed") is True
    assert stored.get("translated") is False
    assert stored.get("original") == kannada_answer

    derived = case.derivedClinicalData or {}
    assert derived.get("translationScreeningIncomplete") is True
    failed_answers = derived.get("translationFailedAnswers", [])
    assert len(failed_answers) > 0
    assert failed_answers[0]["questionId"] == "chief_complaint"

    safety = derived.get("safetyEscalation")
    assert safety is not None
    assert safety.get("translationScreeningIncomplete") is True
    assert any("Manual review needed" in rf for rf in safety.get("redFlags", []))


# ── 5. Question Localization, Translate UI, TTS & STT with Full Names ──────────

@patch("app.services.translation_service.translate_texts")
def test_adaptive_intake_question_localization_kannada(mock_translate_texts, client, db):
    """GET /cases/{id}/adaptive-intake localizes current question for language='Kannada'."""
    def fake_translate(texts, lang, db=None):
        return [f"{t} [kn]" for t in texts], True
    mock_translate_texts.side_effect = fake_translate

    case = _create_case(db, language="Kannada")
    doc_token = _doctor_token()

    resp = client.get(
        f"/api/v1/cases/{case.caseId}/adaptive-intake",
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    q = data.get("currentQuestion")
    assert q is not None
    assert q.get("promptLocalized") is not None
    assert "[kn]" in q.get("promptLocalized")


def test_translate_ui_endpoint_with_full_name_and_target_lang(client):
    """POST /translate/ui accepts full name 'Kannada' and 'targetLang' alias."""
    with patch("app.api.v1.translate.translate_texts") as mock_trans:
        mock_trans.return_value = (["ಮುಖ್ಯ ದೂರು"], True)
        resp = client.post(
            "/api/v1/translate/ui",
            json={"targetLang": "Kannada", "strings": {"chief": "Chief Complaint"}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["lang"] == "kn"
        assert data["strings"]["chief"] == "ಮುಖ್ಯ ದೂರು"
        assert data["translations"]["chief"] == "ಮುಖ್ಯ ದೂರು"


@patch("httpx.AsyncClient.post")
def test_tts_with_full_name_kannada(mock_post, client, monkeypatch):
    """POST /speech/tts accepts language='Kannada' and normalizes to 'kn-IN' for Sarvam."""
    monkeypatch.setenv("SARVAM_API_KEY", "test-sarvam-key")
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"audios": ["UklGRgAAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="]}
    mock_post.return_value = mock_resp

    doc_token = _doctor_token()
    resp = client.post(
        "/api/v1/speech/tts",
        json={"text": "ನಮಸ್ಕಾರ", "language": "Kannada"},
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"

    # Verify target_language_code passed to Sarvam is kn-IN
    call_args = mock_post.call_args
    assert call_args is not None
    sarvam_payload = call_args[1].get("json") or (call_args[0][1] if len(call_args[0]) > 1 else call_args[1].get("json"))
    if sarvam_payload:
        assert sarvam_payload["target_language_code"] == "kn-IN"


@patch("httpx.AsyncClient.post")
def test_stt_with_full_name_hindi(mock_post, client, monkeypatch):
    """POST /speech/stt accepts language='Hindi' and normalizes to 'hi-IN' for Sarvam."""
    monkeypatch.setenv("SARVAM_API_KEY", "test-sarvam-key")
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"transcript": "मुझे सिरदर्द है"}
    mock_post.return_value = mock_resp

    doc_token = _doctor_token()
    resp = client.post(
        "/api/v1/speech/stt",
        data={"language": "Hindi"},
        files={"file": ("test.wav", b"RIFF....WAVE", "audio/wav")},
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["transcript"] == "मुझे सिरदर्द है"

    # Verify language_code passed to Sarvam is hi-IN
    call_args = mock_post.call_args
    assert call_args is not None
    data_payload = call_args[1].get("data")
    assert data_payload["language_code"] == "hi-IN"


# ── 6. Full 8-Question Flow for Both "Kannada" and "Hindi" (Success & Forced Fail) ─

EIGHT_QUESTIONS = [
    ("chief_complaint", "ಮೂರು ದಿನಗಳಿಂದ ತೀವ್ರ ಜ್ವರ ಮತ್ತು ತಲೆನೋವು ಇದೆ", "Fever and headache for three days"),
    ("present_illness", "ಜ್ವರ ಸಂಜೆಯ ವೇಳೆ ಹೆಚ್ಚಾಗುತ್ತದೆ", "Fever gets worse in the evening"),
    ("past_medical", "ಯಾವುದೇ ಹಿಂದಿನ ಕಾಯಿಲೆಗಳಿಲ್ಲ", "No prior medical conditions"),
    ("past_surgical", "ಯಾವುದೇ ಶಸ್ತ್ರಚಿಕಿತ್ಸೆ ಆಗಿಲ್ಲ", "No previous surgeries"),
    ("medications", "ಪ್ಯಾರಸಿಟಮಾಲ್ ಮಾತ್ರೆ ತೆಗೆದುಕೊಂಡಿದ್ದೇನೆ", "Taking paracetamol tablet"),
    ("allergies", "No known allergies", "No known allergies"),
    ("family_history", "ಕುಟುಂಬದಲ್ಲಿ ಯಾವುದೇ ಗಂಭೀರ ಕಾಯಿಲೆಗಳಿಲ್ಲ", "No significant family history"),
    ("review_of_systems", "ಸ್ವಲ್ಪ ಆಯಾಸ ಮತ್ತು ಮೈಕೈ ನೋವು ಇದೆ", "Mild fatigue and body ache"),
]

EIGHT_QUESTIONS_HINDI = [
    ("chief_complaint", "तीन दिनों से तेज बुखार और सिरदर्द है", "Fever and headache for three days"),
    ("present_illness", "बुखार शाम के समय बढ़ जाता है", "Fever gets worse in the evening"),
    ("past_medical", "कोई पुरानी बीमारी नहीं है", "No prior medical conditions"),
    ("past_surgical", "कोई सर्जरी नहीं हुई है", "No previous surgeries"),
    ("medications", "पैरासिटामोल ली है", "Taking paracetamol tablet"),
    ("allergies", "No known allergies", "No known allergies"),
    ("family_history", "परिवार में कोई गंभीर बीमारी नहीं है", "No significant family history"),
    ("review_of_systems", "कमजोरी और थकान महसूस हो रही है", "Mild fatigue and body ache"),
]


@patch("app.services.translation_service.translate_texts")
@patch("app.services.translation_service.translate_to_english")
def test_8_question_flow_kannada_successful_translation(mock_translate_en, mock_translate_ui, client, db):
    """Run full 8-question flow with language='Kannada' with successful translations."""
    mock_translate_ui.side_effect = lambda texts, lang, db=None: ([f"{t} [kn]" for t in texts], True)

    case = _create_case(db, language="Kannada")
    token = _patient_token(case.caseId)
    answers = {}

    for q_id, kn_text, en_trans in EIGHT_QUESTIONS:
        mock_translate_en.return_value = (en_trans, True)
        answers[q_id] = kn_text
        resp = client.put(
            f"/api/v1/cases/{case.caseId}",
            json={"intakeAnswers": answers},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    db.refresh(case)
    # Check that each answer was stored bilingual with lang='kn' and translated=True
    for q_id, kn_text, en_trans in EIGHT_QUESTIONS:
        ans = case.intakeAnswers.get(q_id)
        if q_id == "allergies":
            continue
        assert isinstance(ans, dict)
        assert ans.get("lang") == "kn"
        assert ans.get("original") == kn_text
        assert ans.get("translated") is True
        assert ans.get("translationFailed") is False


@patch("app.services.translation_service.translate_texts")
@patch("app.services.translation_service.Groq")
def test_8_question_flow_kannada_groq_forced_fail(mock_groq, mock_translate_ui, client, db):
    """Run 8-question flow with language='Kannada' when Groq fails (simulated outage)."""
    mock_translate_ui.side_effect = lambda texts, lang, db=None: (texts, False)
    mock_groq.side_effect = RuntimeError("Groq translation service down")

    case = _create_case(db, language="Kannada")
    token = _patient_token(case.caseId)
    answers = {}

    for q_id, kn_text, _ in EIGHT_QUESTIONS:
        answers[q_id] = kn_text
        resp = client.put(
            f"/api/v1/cases/{case.caseId}",
            json={"intakeAnswers": answers},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    db.refresh(case)
    # Verify translationFailed is True and manual review banner is flagged
    derived = case.derivedClinicalData or {}
    assert derived.get("translationScreeningIncomplete") is True
    failed = derived.get("translationFailedAnswers", [])
    assert len(failed) > 0
    safety = derived.get("safetyEscalation")
    assert safety is not None
    assert any("Manual review needed" in rf for rf in safety.get("redFlags", []))


@patch("app.services.translation_service.translate_texts")
@patch("app.services.translation_service.translate_to_english")
def test_8_question_flow_hindi_successful_translation(mock_translate_en, mock_translate_ui, client, db):
    """Run full 8-question flow with language='Hindi' with successful translations."""
    mock_translate_ui.side_effect = lambda texts, lang, db=None: ([f"{t} [hi]" for t in texts], True)

    case = _create_case(db, language="Hindi")
    token = _patient_token(case.caseId)
    answers = {}

    for q_id, hi_text, en_trans in EIGHT_QUESTIONS_HINDI:
        mock_translate_en.return_value = (en_trans, True)
        answers[q_id] = hi_text
        resp = client.put(
            f"/api/v1/cases/{case.caseId}",
            json={"intakeAnswers": answers},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    db.refresh(case)
    # Check that each answer was stored bilingual with lang='hi' and translated=True
    for q_id, hi_text, en_trans in EIGHT_QUESTIONS_HINDI:
        ans = case.intakeAnswers.get(q_id)
        if q_id == "allergies":
            continue
        assert isinstance(ans, dict)
        assert ans.get("lang") == "hi"
        assert ans.get("original") == hi_text
        assert ans.get("translated") is True
        assert ans.get("translationFailed") is False


@patch("app.services.translation_service.translate_texts")
@patch("app.services.translation_service.Groq")
def test_8_question_flow_hindi_groq_forced_fail(mock_groq, mock_translate_ui, client, db):
    """Run 8-question flow with language='Hindi' when Groq fails (simulated outage)."""
    mock_translate_ui.side_effect = lambda texts, lang, db=None: (texts, False)
    mock_groq.side_effect = RuntimeError("Groq translation service down")

    case = _create_case(db, language="Hindi")
    token = _patient_token(case.caseId)
    answers = {}

    for q_id, hi_text, _ in EIGHT_QUESTIONS_HINDI:
        answers[q_id] = hi_text
        resp = client.put(
            f"/api/v1/cases/{case.caseId}",
            json={"intakeAnswers": answers},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    db.refresh(case)
    # Verify translationFailed is True and manual review banner is flagged
    derived = case.derivedClinicalData or {}
    assert derived.get("translationScreeningIncomplete") is True
    failed = derived.get("translationFailedAnswers", [])
    assert len(failed) > 0
    safety = derived.get("safetyEscalation")
    assert safety is not None
    assert any("Manual review needed" in rf for rf in safety.get("redFlags", []))
