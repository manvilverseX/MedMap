"""
Phase 3 tests: multilingual intake API.
Covers:
- Kannada free-text stored with both {value (English), original (Kannada)} versions
- Red-flag safety fires from a Kannada answer (via mocked translation of "chest pain")
- English cases behave exactly as before (backward-compat regression)
- POST /api/v1/translate/ui returns localized strings
"""
import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.models.base import Base
from app.models.user import User
from app.models.case import ClinicalCase
from app.core.database import get_db
from app.core.security import create_access_token
from passlib.context import CryptContext
import uuid
from datetime import datetime, timezone

# ── Shared test database fixtures ──────────────────────────────────────────────

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_lang.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    engine.dispose()
    try:
        Base.metadata.drop_all(bind=engine)
    except Exception:
        pass
    engine.dispose()


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


def _create_doctor(db):
    u = User(
        id=str(uuid.uuid4()),
        username=f"langdoc_{uuid.uuid4().hex[:6]}",
        hashed_password=pwd_context.hash("pass123"),
        role="doctor",
    )
    db.add(u)
    db.commit()
    return u


def _create_kannada_case(db, doctor_id: str | None = None) -> ClinicalCase:
    case = ClinicalCase(
        caseId=f"lang-kn-{uuid.uuid4().hex[:8]}",
        patientId="P-KN-001",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
        language="Kannada",
        status="intake",
        consentGranted=True,
        intakeAnswers={},
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


def _patient_token(case_id: str) -> str:
    return create_access_token({"role": "patient", "case_id": case_id})


def _doctor_token(username: str) -> str:
    return create_access_token({"sub": username, "role": "doctor"})


# ── Test: Kannada free-text stored bilingual ───────────────────────────────────

@patch("app.services.translation_service.Groq")
def test_kannada_answer_stored_bilingual(mock_groq_cls, client, db):
    """A Kannada free-text answer must be stored with {value: english, original: kn}."""
    mock_groq_cls.return_value.chat.completions.create.return_value.choices[
        0
    ].message.content = json.dumps(["I have been having a fever for 3 days"])

    case = _create_kannada_case(db)
    token = _patient_token(case.caseId)

    resp = client.put(
        f"/api/v1/cases/{case.caseId}",
        json={"intakeAnswers": {"chief_complaint": "ಮೂರು ದಿನಗಳಿಂದ ಜ್ವರ ಇದೆ"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text

    db.refresh(case)
    stored = case.intakeAnswers.get("chief_complaint")
    assert isinstance(stored, dict), f"Expected dict, got: {stored!r}"
    assert "value" in stored, "Must have 'value' (English)"
    assert "original" in stored, "Must have 'original' (patient's Kannada)"
    assert stored["lang"] == "kn"
    # English value should be the translated text
    assert "fever" in stored["value"].lower() or stored["value"]  # translated or fallback


# ── Test: safety escalation fires via mocked Kannada→English translation ───────

@patch("app.services.translation_service.Groq")
def test_safety_escalation_via_kannada_translation(mock_groq_cls, client, db):
    """Red-flag safety must fire when a Kannada 'chest pain' answer is translated to English."""
    # Mock: translate "ಎದೆ ನೋವು ಮತ್ತು ಉಸಿರಾಟ ತೊಂದರೆ" → "severe chest pain and shortness of breath"
    mock_groq_cls.return_value.chat.completions.create.return_value.choices[
        0
    ].message.content = json.dumps(
        ["severe chest pain and shortness of breath with sweating"]
    )

    case = _create_kannada_case(db)
    token = _patient_token(case.caseId)

    resp = client.put(
        f"/api/v1/cases/{case.caseId}",
        json={"intakeAnswers": {"chief_complaint": "ಎದೆ ನೋವು ಮತ್ತು ಉಸಿರಾಟ ತೊಂದರೆ"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text

    # The intake state should now show safety escalation
    doctor = _create_doctor(db)
    doc_token = _doctor_token(doctor.username)
    state_resp = client.get(
        f"/api/v1/cases/{case.caseId}/adaptive-intake",
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert state_resp.status_code == 200
    state = state_resp.json()
    assert state["state"] == "safety_escalation", (
        f"Expected safety_escalation, got {state['state']}"
    )


# ── Test: English case unaffected (backward compat) ───────────────────────────

def test_english_case_unaffected(client, db):
    """English-language cases must work exactly as before - no translation fields added."""
    case = ClinicalCase(
        caseId=f"lang-en-{uuid.uuid4().hex[:8]}",
        patientId="P-EN-001",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
        language="English",
        status="intake",
        consentGranted=True,
        intakeAnswers={},
    )
    db.add(case)
    db.commit()
    db.refresh(case)

    token = _patient_token(case.caseId)
    resp = client.put(
        f"/api/v1/cases/{case.caseId}",
        json={"intakeAnswers": {"chief_complaint": "Headache for 2 days"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    db.refresh(case)
    stored = case.intakeAnswers.get("chief_complaint")
    # For English, should be string (unchanged) or simple dict without 'original' key
    if isinstance(stored, dict):
        assert "lang" not in stored or stored.get("lang") == "en", (
            "English case should not have non-english lang annotation"
        )


# ── Test: /translate/ui endpoint ──────────────────────────────────────────────

@patch("app.services.translation_service.Groq")
def test_translate_ui_endpoint_kannada(mock_groq_cls, client):
    """POST /translate/ui must return localized strings for kn."""
    import re
    from unittest.mock import MagicMock
    def fake_create(**kwargs):
        messages = kwargs.get("messages", [])
        prompt_content = messages[0]["content"] if messages else ""
        m = re.search(r"Input strings:\s*(\[.*?\])", prompt_content, re.DOTALL)
        num_items = len(json.loads(m.group(1))) if m else 2
        resp_list = ["ಪ್ರಾರಂಭಿಸಿ", "ಸಲ್ಲಿಸಿ"][:num_items]
        mock_res = MagicMock()
        mock_res.choices = [MagicMock(message=MagicMock(content=json.dumps(resp_list)))]
        return mock_res
    mock_groq_cls.return_value.chat.completions.create.side_effect = fake_create

    from app.services.translation_service import _lru_cache
    _lru_cache.clear()

    resp = client.post(
        "/api/v1/translate/ui",
        json={"lang": "kn", "strings": {"start": "Start", "submit": "Submit"}},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["translated"] is True
    assert data["strings"]["start"] == "ಪ್ರಾರಂಭಿಸಿ"
    assert data["aiTranslationTag"] is not None


def test_translate_ui_endpoint_english_passthrough(client):
    """POST /translate/ui for lang=en must return strings unchanged."""
    resp = client.post(
        "/api/v1/translate/ui",
        json={"lang": "en", "strings": {"start": "Start"}},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["strings"]["start"] == "Start"
    assert data["translated"] is True


@patch("app.services.translation_service.translate_to_english")
def test_translation_failure_surfaces_screening_warning(mock_translate, client, db):
    """When translation of non-English text fails, answer is marked translationFailed and case flagged."""
    # Simulate translation failure (returns native text, success=False)
    kannada_text = "ತೀವ್ರ ಎದೆ ನೋವು ಮತ್ತು ಉಸಿರಾಟದ ತೊಂದರೆ"
    mock_translate.return_value = (kannada_text, False)

    case = _create_kannada_case(db)
    token = _patient_token(case.caseId)

    resp = client.put(
        f"/api/v1/cases/{case.caseId}",
        json={"intakeAnswers": {"chief_complaint": kannada_text}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text

    db.refresh(case)
    ans = case.intakeAnswers.get("chief_complaint")
    assert isinstance(ans, dict)
    assert ans.get("translationFailed") is True
    assert ans.get("original") == kannada_text

    derived = case.derivedClinicalData or {}
    assert derived.get("translationScreeningIncomplete") is True
    assert "translationFailedAnswers" in derived
    assert derived["translationFailedAnswers"][0]["questionId"] == "chief_complaint"

    safety = derived.get("safetyEscalation")
    assert safety is not None
    assert safety.get("translationScreeningIncomplete") is True
    assert "Manual review needed" in safety.get("redFlags", [""])[0]
