import os
import time
from collections import defaultdict
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

# Per-instance in-memory storage for sliding window timestamps: key -> list of float timestamps
_REQUEST_HISTORY: dict[str, list[float]] = defaultdict(list)


def get_client_ip(request: Request) -> str:
    """Extract client IP, inspecting X-Forwarded-For if present (first IP in chain)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "127.0.0.1"


def is_rate_limit_enabled() -> bool:
    """Check if rate limiting is enabled.
    Disabled in automated tests by default unless explicitly set to 'true'.
    Enabled in normal / production mode by default.
    """
    is_testing = bool(os.getenv("PYTEST_CURRENT_TEST")) or os.getenv("TESTING", "").lower() in ("true", "1")
    default_val = "false" if is_testing else "true"
    return os.getenv("RATE_LIMIT_ENABLED", default_val).lower() in ("true", "1", "yes")


def reset_rate_limits() -> None:
    """Helper for testing to reset in-memory sliding window history."""
    _REQUEST_HISTORY.clear()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Best-effort in-memory rate limiting middleware.
    Documented honestly: on serverless platforms (e.g. Vercel), this operates per-instance.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        if not is_rate_limit_enabled():
            return await call_next(request)

        path = request.url.path.rstrip("/")
        method = request.method.upper()

        limit = None
        group = None

        # 1. Login endpoints (10 per min per IP)
        if path.endswith("/auth/doctor/login") or path.endswith("/auth/admin/login"):
            group = "login"
            limit = int(os.getenv("RATE_LIMIT_LOGIN_PER_MIN", "10"))

        # 2. POST /cases (30 per min per IP)
        elif method == "POST" and (path.endswith("/cases") or path.endswith("/cases/")):
            group = "cases_post"
            limit = int(os.getenv("RATE_LIMIT_CASES_POST_PER_MIN", "30"))

        # 3. /speech/tts and /speech/stt (60 per min per IP)
        elif "/speech/tts" in path or "/speech/stt" in path:
            group = "speech"
            limit = int(os.getenv("RATE_LIMIT_SPEECH_PER_MIN", "60"))

        if group and limit and limit > 0:
            client_ip = get_client_ip(request)
            key = f"{group}:{client_ip}"
            now = time.time()
            cutoff = now - 60.0

            # Prune old timestamps outside the 60-second window
            timestamps = [ts for ts in _REQUEST_HISTORY[key] if ts > cutoff]
            if len(timestamps) >= limit:
                _REQUEST_HISTORY[key] = timestamps
                return JSONResponse(
                    status_code=429,
                    content={
                        "code": "rate_limit",
                        "detail": {
                            "code": "rate_limited",
                            "message": "Too many requests. Please wait a moment before trying again."
                        }
                    },
                    headers={"Retry-After": "60", "X-Error-Code": "rate_limit"}
                )

            timestamps.append(now)
            _REQUEST_HISTORY[key] = timestamps

        return await call_next(request)
