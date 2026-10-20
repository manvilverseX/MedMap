"""
Unit and integration tests for Server-Side Speech (TTS and STT).
Covers:
- POST /api/v1/speech/tts: success (kn, hi), Sarvam failure, missing key, oversize text (>500 chars), empty text
- POST /api/v1/speech/stt: Sarvam success, Sarvam failure -> Whisper fallback, missing Sarvam key -> Whisper fallback,
  oversize audio (>4MB), empty audio, unsupported language, both providers failing
- Auth protection for both endpoints
"""
import base64
import os
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.models.base import Base
from app.core.database import get_db
from app.core.security import create_access_token

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_speech.db"
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


@pytest.fixture()
def patient_token():
    return create_access_token({"role": "patient", "case_id": "case-test-123"})


@pytest.fixture()
def auth_headers(patient_token):
    return {"Authorization": f"Bearer {patient_token}"}


# ── TTS Tests ─────────────────────────────────────────────────────────────────

def test_tts_auth_required(client):
    """Calling TTS without Authorization header must return 401."""
    resp = client.post("/api/v1/speech/tts", json={"text": "Hello", "language": "kn"})
    assert resp.status_code == 401


@patch("httpx.AsyncClient.post")
def test_tts_kannada_success(mock_post, client, auth_headers):
    """Test Kannada TTS synthesis with Sarvam Bulbul v3."""
    fake_audio_bytes = b"RIFF....WAVEfmt....data...."
    fake_b64 = base64.b64encode(fake_audio_bytes).decode("ascii")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"audios": [fake_b64], "request_id": "req-123"}
    mock_post.return_value = mock_resp

    with patch.dict(os.environ, {"SARVAM_API_KEY": "dummy-sarvam-key"}):
        resp = client.post(
            "/api/v1/speech/tts",
            headers=auth_headers,
            json={"text": "ದಯವಿಟ್ಟು ನಿಮ್ಮ ರೋಗಲಕ್ಷಣಗಳನ್ನು ವಿವರಿಸಿ", "language": "kn"},
        )

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"
    assert "public, max-age=" in resp.headers.get("cache-control", "")
    assert resp.content == fake_audio_bytes

    # Verify request payload sent to Sarvam
    mock_post.assert_called_once()
    call_args = mock_post.call_args
    assert call_args[0][0] == "https://api.sarvam.ai/text-to-speech"
    assert call_args[1]["headers"]["api-subscription-key"] == "dummy-sarvam-key"
    payload = call_args[1]["json"]
    assert payload["model"] == "bulbul:v3"
    assert payload["language_code"] == "kn-IN"
    assert payload["speaker"] == "kavitha"


@patch("httpx.AsyncClient.post")
def test_tts_hindi_success(mock_post, client, auth_headers):
    """Test Hindi TTS synthesis with Sarvam Bulbul v3."""
    fake_audio_bytes = b"RIFF_HINDI_WAVE"
    fake_b64 = base64.b64encode(fake_audio_bytes).decode("ascii")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"audios": [fake_b64]}
    mock_post.return_value = mock_resp

    with patch.dict(os.environ, {"SARVAM_API_KEY": "dummy-sarvam-key"}):
        resp = client.post(
            "/api/v1/speech/tts",
            headers=auth_headers,
            json={"text": "कृपया अपने लक्षण बताएं", "language": "hi"},
        )

    assert resp.status_code == 200
    assert resp.content == fake_audio_bytes
    payload = mock_post.call_args[1]["json"]
    assert payload["language_code"] == "hi-IN"
    assert payload["speaker"] == "priya"


def test_tts_missing_key(client, auth_headers):
    """If SARVAM_API_KEY is not set, return 503 with tts_unavailable."""
    with patch.dict(os.environ, {"SARVAM_API_KEY": ""}):
        resp = client.post(
            "/api/v1/speech/tts",
            headers=auth_headers,
            json={"text": "ಯಾವುದೇ ಸಮಸ್ಯೆ", "language": "kn"},
        )
    assert resp.status_code == 503
    data = resp.json()
    assert data["detail"]["code"] == "tts_unavailable"


@patch("httpx.AsyncClient.post")
def test_tts_sarvam_failure(mock_post, client, auth_headers):
    """If Sarvam API returns an error status, return 503."""
    mock_resp = MagicMock()
    mock_resp.status_code = 500
    mock_resp.text = "Internal Server Error"
    mock_post.return_value = mock_resp

    with patch.dict(os.environ, {"SARVAM_API_KEY": "dummy-sarvam-key"}):
        resp = client.post(
            "/api/v1/speech/tts",
            headers=auth_headers,
            json={"text": "ನೋವು ಎಲ್ಲಿದೆ?", "language": "kn"},
        )
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "tts_unavailable"


def test_tts_oversize_text(client, auth_headers):
    """Text exceeding 500 characters must be rejected with 400 Bad Request."""
    long_text = "ಅ" * 501
    resp = client.post(
        "/api/v1/speech/tts",
        headers=auth_headers,
        json={"text": long_text, "language": "kn"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "text_too_long"


def test_tts_empty_text(client, auth_headers):
    """Empty or blank text must be rejected with 400."""
    resp = client.post(
        "/api/v1/speech/tts",
        headers=auth_headers,
        json={"text": "   ", "language": "kn"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "empty_text"


def test_tts_unsupported_language(client, auth_headers):
    """Non-Kannada/Hindi languages must be rejected with 400."""
    resp = client.post(
        "/api/v1/speech/tts",
        headers=auth_headers,
        json={"text": "Hello world", "language": "fr"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "unsupported_language"


# ── STT Tests ─────────────────────────────────────────────────────────────────

def test_stt_auth_required(client):
    """Calling STT without Authorization header must return 401."""
    resp = client.post(
        "/api/v1/speech/stt",
        files={"file": ("test.webm", b"fake audio", "audio/webm")},
        data={"language": "kn"},
    )
    assert resp.status_code == 401


@patch("httpx.AsyncClient.post")
def test_stt_sarvam_success(mock_post, client, auth_headers):
    """Successful transcription via Sarvam Saaras v3."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"transcript": "ಮೂರು ದಿನಗಳಿಂದ ಜ್ವರವಿದೆ", "language_code": "kn-IN"}
    mock_post.return_value = mock_resp

    with patch.dict(os.environ, {"SARVAM_API_KEY": "dummy-sarvam-key"}):
        resp = client.post(
            "/api/v1/speech/stt",
            headers=auth_headers,
            files={"file": ("recording.webm", b"dummy audio content", "audio/webm")},
            data={"language": "kn"},
        )

    assert resp.status_code == 200
    assert resp.json() == {"transcript": "ಮೂರು ದಿನಗಳಿಂದ ಜ್ವರವಿದೆ"}
    mock_post.assert_called_once()
    assert mock_post.call_args[0][0] == "https://api.sarvam.ai/speech-to-text"
    assert mock_post.call_args[1]["headers"]["api-subscription-key"] == "dummy-sarvam-key"


@patch("httpx.AsyncClient.post")
@patch("app.api.v1.speech.Groq")
def test_stt_sarvam_failure_falls_back_to_whisper(mock_groq_cls, mock_sarvam_post, client, auth_headers):
    """When Sarvam STT fails, cleanly fall back to Groq Whisper."""
    # Sarvam fails
    mock_sarvam_resp = MagicMock()
    mock_sarvam_resp.status_code = 502
    mock_sarvam_resp.text = "Bad Gateway"
    mock_sarvam_post.return_value = mock_sarvam_resp

    # Groq Whisper succeeds
    mock_whisper_res = MagicMock()
    mock_whisper_res.text = "मुझे दो दिन से खांसी है"
    mock_groq_cls.return_value.audio.transcriptions.create.return_value = mock_whisper_res

    with patch.dict(os.environ, {"SARVAM_API_KEY": "dummy-sarvam-key", "GROQ_API_KEY": "dummy-groq-key"}):
        resp = client.post(
            "/api/v1/speech/stt",
            headers=auth_headers,
            files={"file": ("voice.webm", b"audio-bytes-data", "audio/webm")},
            data={"language": "hi"},
        )

    assert resp.status_code == 200
    assert resp.json() == {"transcript": "मुझे दो दिन से खांसी है"}
    mock_groq_cls.return_value.audio.transcriptions.create.assert_called_once()
    whisper_call = mock_groq_cls.return_value.audio.transcriptions.create.call_args
    assert whisper_call[1]["model"] == "whisper-large-v3"
    assert whisper_call[1]["language"] == "hi"


@patch("app.api.v1.speech.Groq")
def test_stt_missing_sarvam_key_falls_back_to_whisper(mock_groq_cls, client, auth_headers):
    """When SARVAM_API_KEY is not configured, fall back to Groq Whisper directly."""
    mock_whisper_res = MagicMock()
    mock_whisper_res.text = "Severe headache on left side"
    mock_groq_cls.return_value.audio.transcriptions.create.return_value = mock_whisper_res

    with patch.dict(os.environ, {"SARVAM_API_KEY": "", "GROQ_API_KEY": "dummy-groq-key"}):
        resp = client.post(
            "/api/v1/speech/stt",
            headers=auth_headers,
            files={"file": ("voice.webm", b"audio-bytes-data", "audio/webm")},
            data={"language": "en"},
        )

    assert resp.status_code == 200
    assert resp.json() == {"transcript": "Severe headache on left side"}


def test_stt_oversize_audio(client, auth_headers):
    """Audio exceeding 4 MB must be rejected with 400."""
    oversize_bytes = b"0" * (4 * 1024 * 1024 + 10)
    resp = client.post(
        "/api/v1/speech/stt",
        headers=auth_headers,
        files={"file": ("large.wav", oversize_bytes, "audio/wav")},
        data={"language": "kn"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "audio_too_large"


def test_stt_empty_audio(client, auth_headers):
    """Empty audio payload must be rejected with 400."""
    resp = client.post(
        "/api/v1/speech/stt",
        headers=auth_headers,
        files={"file": ("empty.webm", b"", "audio/webm")},
        data={"language": "kn"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "empty_audio"


def test_stt_unsupported_language(client, auth_headers):
    """Languages other than kn, hi, en must be rejected with 400."""
    resp = client.post(
        "/api/v1/speech/stt",
        headers=auth_headers,
        files={"file": ("audio.webm", b"sound bytes", "audio/webm")},
        data={"language": "es"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "unsupported_language"


def test_stt_both_providers_fail(client, auth_headers):
    """When neither Sarvam nor Groq is configured, return 503."""
    with patch.dict(os.environ, {"SARVAM_API_KEY": "", "GROQ_API_KEY": ""}):
        resp = client.post(
            "/api/v1/speech/stt",
            headers=auth_headers,
            files={"file": ("audio.webm", b"sound bytes", "audio/webm")},
            data={"language": "kn"},
        )
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "stt_unavailable"
