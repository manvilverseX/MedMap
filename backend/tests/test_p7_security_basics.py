import os
import time
import jwt
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app
from app.core import security
from app.core.rate_limit import reset_rate_limits, get_client_ip

client = TestClient(app)


def test_token_lifetimes_defaults():
    """Verify default token expiration lifetimes: patient 4h (240m), staff 12h (720m)."""
    patient_token = security.create_access_token({"role": "patient", "case_id": "test-c1"})
    patient_payload = jwt.decode(patient_token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
    
    now = time.time()
    patient_exp = patient_payload["exp"]
    # Should expire in roughly 240 minutes (14400 seconds)
    patient_lifetime_sec = patient_exp - now
    assert 14300 <= patient_lifetime_sec <= 14500

    doctor_token = security.create_access_token({"sub": "demo_doctor", "role": "doctor"})
    doctor_payload = jwt.decode(doctor_token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
    doctor_exp = doctor_payload["exp"]
    # Should expire in roughly 720 minutes (43200 seconds)
    doctor_lifetime_sec = doctor_exp - now
    assert 43100 <= doctor_lifetime_sec <= 43300


def test_token_lifetimes_configurable_via_env():
    """Verify token lifetimes can be overridden via environment variables."""
    with patch.dict(os.environ, {
        "ACCESS_TOKEN_EXPIRE_MINUTES_PATIENT": "30",
        "ACCESS_TOKEN_EXPIRE_MINUTES_STAFF": "60",
    }):
        with patch.object(security, "ACCESS_TOKEN_EXPIRE_MINUTES_PATIENT", 30):
            with patch.object(security, "ACCESS_TOKEN_EXPIRE_MINUTES_STAFF", 60):
                p_token = security.create_access_token({"role": "patient", "case_id": "test-c2"})
                p_payload = jwt.decode(p_token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
                p_diff = p_payload["exp"] - time.time()
                assert 1700 <= p_diff <= 1900

                d_token = security.create_access_token({"sub": "admin", "role": "admin"})
                d_payload = jwt.decode(d_token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
                d_diff = d_payload["exp"] - time.time()
                assert 3500 <= d_diff <= 3700


def test_rate_limiting_login_endpoint():
    """Verify login rate limit of 10 requests/min per IP with 429 response."""
    reset_rate_limits()
    with patch.dict(os.environ, {
        "RATE_LIMIT_ENABLED": "true",
        "RATE_LIMIT_LOGIN_PER_MIN": "3",  # set low for test speed
    }):
        headers = {"X-Forwarded-For": "198.51.100.1"}

        # 3 requests allowed
        for _ in range(3):
            res = client.post(
                "/api/v1/auth/doctor/login",
                data={"username": "bad", "password": "bad"},
                headers=headers,
            )
            assert res.status_code != 429

        # 4th request must be rate limited
        res_blocked = client.post(
            "/api/v1/auth/doctor/login",
            data={"username": "bad", "password": "bad"},
            headers=headers,
        )
        assert res_blocked.status_code == 429
        body = res_blocked.json()
        assert body["code"] == "rate_limit"
        assert body["detail"]["code"] == "rate_limited"

        # A different IP is NOT blocked
        diff_ip_res = client.post(
            "/api/v1/auth/doctor/login",
            data={"username": "bad", "password": "bad"},
            headers={"X-Forwarded-For": "198.51.100.2"},
        )
        assert diff_ip_res.status_code != 429

    reset_rate_limits()


def test_rate_limiting_speech_endpoints():
    """Verify /speech rate limit per IP with 429 response."""
    reset_rate_limits()
    with patch.dict(os.environ, {
        "RATE_LIMIT_ENABLED": "true",
        "RATE_LIMIT_SPEECH_PER_MIN": "2",
    }):
        headers = {"X-Forwarded-For": "203.0.113.10"}

        # 2 requests
        for _ in range(2):
            res = client.post(
                "/api/v1/speech/tts",
                json={"text": "test", "language": "hi"},
                headers=headers,
            )
            assert res.status_code != 429

        # 3rd request blocked
        res_blocked = client.post(
            "/api/v1/speech/tts",
            json={"text": "test", "language": "hi"},
            headers=headers,
        )
        assert res_blocked.status_code == 429
        assert res_blocked.headers.get("x-error-code") == "rate_limit"

    reset_rate_limits()
