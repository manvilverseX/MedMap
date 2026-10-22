import json
import pytest
from unittest.mock import MagicMock, patch
from groq import APITimeoutError

from app.services.translation_service import (
    translate_texts,
    translate_to_english,
    _call_groq_translate,
    _lru_cache,
)
from app.schemas.case import CaseCreate, CaseUpdate
from app.services import case_service


from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.base import Base
import app.models.case  # noqa: F401
import app.models.event  # noqa: F401
import app.models.document  # noqa: F401


def _mock_groq_response(content: str):
    mock_resp = MagicMock()
    mock_resp.choices[0].message.content = content
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_resp
    return mock_client


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@patch("app.services.translation_service.Groq")
def test_chunked_translation_split_on_truncated_json(mock_groq_cls, monkeypatch):
    """When a chunk receives truncated JSON, it splits in half and retries each half."""
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    _lru_cache.clear()

    call_count = 0

    def side_effect(**kwargs):
        nonlocal call_count
        call_count += 1
        prompt = kwargs["messages"][0]["content"]
        mock_resp = MagicMock()
        # On first call with 2 items, simulate truncated JSON
        if call_count == 1:
            mock_resp.choices[0].message.content = '["First item", "Unfinished sec'
        elif "item 1" in prompt.lower():
            mock_resp.choices[0].message.content = '["ಮೊದಲ ಐಟಂ"]'
        else:
            mock_resp.choices[0].message.content = '["ಎರಡನೇ ಐಟಂ"]'
        return mock_resp

    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = side_effect
    mock_groq_cls.return_value = mock_client

    texts = ["Item 1", "Item 2"]
    results, ok = translate_texts(texts, "kn")
    assert ok is True
    assert len(results) == 2
    assert results[0] == "ಮೊದಲ ಐಟಂ"
    assert results[1] == "ಎರಡನೇ ಐಟಂ"
    assert call_count == 3  # Initial failed + 2 split calls


@patch("app.services.translation_service.Groq")
def test_retry_logic_on_timeout(mock_groq_cls, monkeypatch):
    """Temporary timeout recovers on retry."""
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    _lru_cache.clear()

    call_count = 0

    def side_effect(**kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise APITimeoutError(request=MagicMock())
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = '["ಯಶಸ್ಸು"]'
        return mock_resp

    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = side_effect
    mock_groq_cls.return_value = mock_client

    results, ok = translate_texts(["Success"], "kn")
    assert ok is True
    assert results == ["ಯಶಸ್ಸು"]
    assert call_count == 2


@patch("app.services.translation_service.Groq")
def test_pending_translation_flag_on_failure(mock_groq_cls, monkeypatch, db_session):
    """When translation fails, answer is saved with translationPending=True and translationFailed=True."""
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    _lru_cache.clear()

    # Groq consistently fails
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = APITimeoutError(request=MagicMock())
    mock_groq_cls.return_value = mock_client

    from app.api.v1.cases import update_case
    from app.schemas.case import CaseCreate

    # Create test case
    case = case_service.create_case(
        db_session,
        CaseCreate(patientId="p-test-pend", language="kn", consentGranted=True)
    )

    update_in = CaseUpdate(intakeAnswers={"chief_complaint": "ಜ್ವರ ಇದೆ"})
    user = {"role": "patient", "case_id": case.caseId}

    updated = update_case(case.caseId, update_in, db=db_session, current_user=user)
    ans_record = updated.intakeAnswers["chief_complaint"]
    assert isinstance(ans_record, dict)
    assert ans_record["original"] == "ಜ್ವರ ಇದೆ"
    assert ans_record["translationPending"] is True
    assert ans_record["translationFailed"] is True
    assert ans_record["translated"] is False


def test_idempotent_put_preserves_valid_answer(db_session):
    """Submitting the identical valid answer twice preserves the record without re-processing."""
    from app.api.v1.cases import update_case
    case = case_service.create_case(
        db_session,
        CaseCreate(patientId="p-test-idem", language="en", consentGranted=True)
    )

    # First submission
    user = {"role": "patient", "case_id": case.caseId}
    update1 = CaseUpdate(intakeAnswers={"chief_complaint": "I have had a severe migraine for 2 days"})
    res1 = update_case(case.caseId, update1, db=db_session, current_user=user)
    rec1 = res1.intakeAnswers["chief_complaint"]

    # Second submission with identical answer
    update2 = CaseUpdate(intakeAnswers={"chief_complaint": "I have had a severe migraine for 2 days"})
    res2 = update_case(case.caseId, update2, db=db_session, current_user=user)
    rec2 = res2.intakeAnswers["chief_complaint"]

    assert rec1 == rec2
