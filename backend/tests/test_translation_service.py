"""
Tests for backend/app/services/translation_service.py
Covers: success, bad JSON, length mismatch, timeout, no API key, cache hit.
All Groq calls are mocked; no real network requests.
"""
import json
import pytest
from unittest.mock import MagicMock, patch

from app.services.translation_service import (
    translate_texts,
    translate_to_english,
    normalise_lang,
    _lru_cache,
    _text_hash,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _mock_groq_response(content: str):
    """Return a mock Groq client whose .create() returns the given content string."""
    mock_resp = MagicMock()
    mock_resp.choices[0].message.content = content
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_resp
    return mock_client


# ── normalise_lang ─────────────────────────────────────────────────────────────

def test_normalise_lang_english():
    assert normalise_lang("English") == "en"


def test_normalise_lang_hindi():
    assert normalise_lang("Hindi") == "hi"
    assert normalise_lang("hi") == "hi"


def test_normalise_lang_kannada():
    assert normalise_lang("Kannada") == "kn"
    assert normalise_lang("kn") == "kn"


def test_normalise_lang_fallback():
    assert normalise_lang(None) == "en"
    assert normalise_lang("unknown") == "en"


# ── translate_texts: success ───────────────────────────────────────────────────

@patch("app.services.translation_service.Groq")
def test_translate_texts_success(mock_groq_cls, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    translated = ["ನಿಮ್ಮ ಹೆಸರೇನು?", "ನಿಮ್ಮ ಲಕ್ಷಣಗಳೇನು?"]
    mock_groq_cls.return_value = _mock_groq_response(json.dumps(translated))

    # Clear LRU for test isolation
    _lru_cache.clear()

    results, was_translated = translate_texts(
        ["What is your name?", "What are your symptoms?"],
        "kn",
        db=None,
    )
    assert was_translated is True
    assert len(results) == 2
    assert results[0] == "ನಿಮ್ಮ ಹೆಸರೇನು?"


# ── translate_texts: English passthrough ──────────────────────────────────────

def test_translate_texts_english_passthrough(monkeypatch):
    texts = ["What is your name?"]
    results, was_translated = translate_texts(texts, "en")
    assert results == texts
    assert was_translated is True


# ── translate_texts: bad JSON ─────────────────────────────────────────────────

@patch("app.services.translation_service.Groq")
def test_translate_texts_bad_json(mock_groq_cls, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    mock_groq_cls.return_value = _mock_groq_response("NOT_VALID_JSON{{")
    _lru_cache.clear()

    results, was_translated = translate_texts(["Hello"], "hi", db=None)
    assert was_translated is False
    assert results == ["Hello"]


# ── translate_texts: length mismatch ──────────────────────────────────────────

@patch("app.services.translation_service.Groq")
def test_translate_texts_length_mismatch(mock_groq_cls, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    # Returns only 1 item for a 2-item input
    mock_groq_cls.return_value = _mock_groq_response(json.dumps(["नमस्ते"]))
    _lru_cache.clear()

    results, was_translated = translate_texts(["Hello", "Goodbye"], "hi", db=None)
    assert was_translated is False
    assert results == ["Hello", "Goodbye"]


# ── translate_texts: timeout / exception ──────────────────────────────────────

@patch("app.services.translation_service.Groq")
def test_translate_texts_timeout(mock_groq_cls, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = TimeoutError("timeout")
    mock_groq_cls.return_value = mock_client
    _lru_cache.clear()

    results, was_translated = translate_texts(["Hello"], "kn", db=None)
    assert was_translated is False
    assert results == ["Hello"]


# ── translate_texts: no API key ───────────────────────────────────────────────

def test_translate_texts_no_api_key(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    _lru_cache.clear()

    results, was_translated = translate_texts(["Hello"], "hi", db=None)
    assert was_translated is False
    assert results == ["Hello"]


# ── translate_texts: in-memory cache hit (no Groq call) ──────────────────────

@patch("app.services.translation_service.Groq")
def test_translate_texts_cache_hit(mock_groq_cls, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    _lru_cache.clear()

    # Seed the LRU manually
    from app.services.translation_service import _lru_set
    text = "What is your name?"
    _lru_set((_text_hash(text), "kn"), "ನಿಮ್ಮ ಹೆಸರೇನು?")

    results, was_translated = translate_texts([text], "kn", db=None)
    assert was_translated is True
    assert results[0] == "ನಿಮ್ಮ ಹೆಸರೇನು?"
    # Groq must NOT have been called
    mock_groq_cls.assert_not_called()


# ── translate_to_english ───────────────────────────────────────────────────────

@patch("app.services.translation_service.Groq")
def test_translate_to_english_success(mock_groq_cls, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    mock_groq_cls.return_value = _mock_groq_response(json.dumps(["chest pain"]))
    _lru_cache.clear()

    english, was_translated = translate_to_english("ಎದೆ ನೋವು", "kn", db=None)
    assert was_translated is True
    assert english == "chest pain"


@patch("app.services.translation_service.Groq")
def test_translate_to_english_failure_returns_original(mock_groq_cls, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = RuntimeError("Groq down")
    mock_groq_cls.return_value = mock_client
    _lru_cache.clear()

    original_kn = "ಎದೆ ನೋವು"
    english, was_translated = translate_to_english(original_kn, "kn", db=None)
    assert was_translated is False
    assert english == original_kn


def test_translate_to_english_passthrough_for_english():
    text = "chest pain"
    result, was_translated = translate_to_english(text, "en")
    assert result == text
    assert was_translated is True


# ── Retry on 429 and timeouts + reasoning_effort ──────────────────────────────

@patch("app.services.translation_service.Groq")
@patch("app.services.translation_service.time.sleep")
def test_translate_texts_retry_on_429_success(mock_sleep, mock_groq_cls, monkeypatch):
    from groq import RateLimitError
    import httpx

    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    _lru_cache.clear()

    # First call: 429 RateLimitError with retry-after header
    req = httpx.Request("POST", "https://api.groq.com")
    resp_429 = httpx.Response(429, headers={"retry-after": "0.2"}, request=req)
    err_429 = RateLimitError("Rate limit reached. Try again in 200ms", response=resp_429, body=None)

    # Second call: succeeds
    mock_resp = MagicMock()
    mock_resp.choices[0].message.content = json.dumps(["सिरदर्द"])

    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = [err_429, mock_resp]
    mock_groq_cls.return_value = mock_client

    results, was_translated = translate_texts(["Headache"], "hi", db=None)
    assert was_translated is True
    assert results == ["सिरदर्द"]
    assert mock_client.chat.completions.create.call_count == 2
    mock_sleep.assert_called_once()
    assert 0.1 <= mock_sleep.call_args[0][0] <= 3.0


@patch("app.services.translation_service.Groq")
@patch("app.services.translation_service.time.sleep")
def test_translate_texts_retry_on_timeout_success(mock_sleep, mock_groq_cls, monkeypatch):
    from groq import APITimeoutError
    import httpx

    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    _lru_cache.clear()

    req = httpx.Request("POST", "https://api.groq.com")
    err_timeout = APITimeoutError(request=req)

    mock_resp = MagicMock()
    mock_resp.choices[0].message.content = json.dumps(["ಜ್ವರ"])

    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = [err_timeout, mock_resp]
    mock_groq_cls.return_value = mock_client

    results, was_translated = translate_texts(["Fever"], "kn", db=None)
    assert was_translated is True
    assert results == ["ಜ್ವರ"]
    assert mock_client.chat.completions.create.call_count == 2
    mock_sleep.assert_called_once()


@patch("app.services.translation_service.Groq")
def test_translate_texts_sends_low_reasoning_effort(mock_groq_cls, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("GROQ_MODEL", "openai/gpt-oss-120b")
    _lru_cache.clear()

    mock_resp = MagicMock()
    mock_resp.choices[0].message.content = json.dumps(["ಕೆಮ್ಮು"])

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_resp
    mock_groq_cls.return_value = mock_client

    results, was_translated = translate_texts(["Cough"], "kn", db=None)
    assert was_translated is True
    assert results == ["ಕೆಮ್ಮು"]

    call_kwargs = mock_client.chat.completions.create.call_args[1]
    assert call_kwargs.get("reasoning_effort") == "low"
    assert call_kwargs.get("model") == "openai/gpt-oss-120b"
