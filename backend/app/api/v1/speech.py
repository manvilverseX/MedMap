"""
Speech router for Server-Side Text-To-Speech (TTS) and Speech-To-Text (STT).
Supports Kannada (kn), Hindi (hi), and English (en).

Primary provider: Sarvam AI
- TTS model: bulbul:v3 (target_language_code kn-IN / hi-IN)
- STT model: saaras:v3 (language_code kn-IN / hi-IN / en-IN)

STT Fallback: Groq whisper-large-v3
"""
import base64
import logging
import os
import asyncio
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response, status
from pydantic import BaseModel, Field
import httpx
from groq import Groq

from app.core.security import require_patient_or_doctor

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_TTS_TEXT_LENGTH = 500
MAX_AUDIO_SIZE_BYTES = 4 * 1024 * 1024  # 4 MB
SARVAM_BASE_URL = "https://api.sarvam.ai"

# Recommended female speaker personas for bulbul:v3
VOICE_MAP = {
    "kn": "kavitha", # Sarvam's tested clear female voice for kn-IN in bulbul:v3
    "hi": "priya",   # Sarvam's recommended female voice for hi-IN in bulbul:v3
}




class TTSRequest(BaseModel):
    text: str = Field(..., description="Text to synthesize into spoken audio (max 500 characters)")
    language: str = Field(..., description="Language code ('kn' or 'hi')")


def normalise_speech_lang(lang: str) -> str:
    l = (lang or "").strip().lower()
    if l.startswith("kn") or l == "kannada":
        return "kn"
    elif l.startswith("hi") or l == "hindi":
        return "hi"
    elif l.startswith("en") or l == "english":
        return "en"
    return l


@router.post("/tts")
async def text_to_speech(
    payload: TTSRequest,
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor),
):
    """
    Generate speech audio for Kannada or Hindi text using Sarvam AI Bulbul v3.
    Returns audio/wav bytes with cache control headers.
    """
    raw_text = (payload.text or "").strip()
    if not raw_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "empty_text", "message": "Text must not be empty"},
        )

    if len(raw_text) > MAX_TTS_TEXT_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "text_too_long",
                "message": f"Text exceeds maximum limit of {MAX_TTS_TEXT_LENGTH} characters",
            },
        )

    norm_lang = normalise_speech_lang(payload.language)
    if norm_lang not in ["kn", "hi"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "unsupported_language",
                "message": "Only 'kn' (Kannada) and 'hi' (Hindi) are supported for TTS",
            },
        )

    sarvam_api_key = os.getenv("SARVAM_API_KEY")
    if not sarvam_api_key:
        logger.warning("SARVAM_API_KEY is not configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "tts_unavailable", "message": "Text-to-speech service is currently unavailable"},
        )

    target_lang_code = f"{norm_lang}-IN"
    sarvam_payload = {
        "text": raw_text,
        "language_code": target_lang_code,
        "target_language_code": target_lang_code,
        "model": "bulbul:v3",
        "speaker": VOICE_MAP.get(norm_lang, "roopa"),
        "output_audio_codec": "wav",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{SARVAM_BASE_URL}/text-to-speech",
                headers={
                    "api-subscription-key": sarvam_api_key,
                    "Content-Type": "application/json",
                },
                json=sarvam_payload,
            )

        if resp.status_code != 200:
            error_reason = resp.text.strip()
            logger.error("Sarvam TTS returned HTTP status %s: %s", resp.status_code, error_reason)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "tts_unavailable", "message": "Text-to-speech provider failed", "reason": error_reason[:200]},
            )


        data = resp.json()
        audios = data.get("audios")
        if not audios or not isinstance(audios, list) or not audios[0]:
            logger.error("Sarvam TTS returned empty audios array")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "tts_unavailable", "message": "No audio returned from speech provider"},
            )

        audio_bytes = base64.b64decode(audios[0])
        return Response(
            content=audio_bytes,
            media_type="audio/wav",
            headers={
                "Cache-Control": "public, max-age=86400",
                "Content-Disposition": 'inline; filename="speech.wav"',
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Unexpected error during TTS generation: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "tts_unavailable", "message": "Text-to-speech service error"},
        ) from exc


@router.post("/stt")
async def speech_to_text(
    file: UploadFile = File(...),
    language: str = Form(...),
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor),
):
    """
    Transcribe spoken audio in Kannada, Hindi, or English.
    Uses Sarvam AI Saaras v3 as primary model for Indian languages.
    Falls back to Groq whisper-large-v3 if Sarvam is unavailable or fails.
    """
    norm_lang = normalise_speech_lang(language)
    if norm_lang not in ["kn", "hi", "en"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "unsupported_language",
                "message": "Only 'kn', 'hi', and 'en' are supported for speech-to-text",
            },
        )

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "empty_audio", "message": "Audio file is empty"},
        )

    if len(audio_bytes) > MAX_AUDIO_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "audio_too_large",
                "message": f"Audio file exceeds maximum size of {MAX_AUDIO_SIZE_BYTES // (1024 * 1024)} MB",
            },
        )

    filename = file.filename or "recording.webm"
    content_type = (file.content_type or "audio/webm").split(";")[0].strip()
    sarvam_api_key = os.getenv("SARVAM_API_KEY")

    transcript: str | None = None

    # 1. Attempt Sarvam STT if key configured
    if sarvam_api_key:
        try:
            target_lang_code = f"{norm_lang}-IN"
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    f"{SARVAM_BASE_URL}/speech-to-text",
                    headers={"api-subscription-key": sarvam_api_key},
                    files={"file": (filename, audio_bytes, content_type)},
                    data={
                        "model": "saaras:v4",
                        "language_code": target_lang_code,
                        "mode": "transcribe",
                    },
                )
            if resp.status_code == 200:
                res_data = resp.json()
                transcript = res_data.get("transcript", "").strip()
            else:
                logger.warning(
                    "Sarvam STT returned status %s: %s; falling back to Groq Whisper",
                    resp.status_code,
                    resp.text,
                )
        except Exception as exc:
            logger.warning("Sarvam STT failed with %s; falling back to Groq Whisper", type(exc).__name__)

    # 2. Fallback to Groq whisper-large-v3 if Sarvam key missing or call failed
    if transcript is None:
        groq_api_key = os.getenv("GROQ_API_KEY")
        if not groq_api_key:
            logger.error("Neither SARVAM_API_KEY nor GROQ_API_KEY is available for speech-to-text")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "stt_unavailable", "message": "Speech-to-text service is currently unavailable"},
            )

        try:
            client = Groq(api_key=groq_api_key)
            loop = asyncio.get_event_loop()

            def _call_whisper():
                return client.audio.transcriptions.create(
                    file=(filename, audio_bytes),
                    model="whisper-large-v3",
                    language=norm_lang,
                )

            whisper_res = await loop.run_in_executor(None, _call_whisper)
            transcript = (getattr(whisper_res, "text", "") or "").strip()
        except Exception as exc:
            logger.error("Groq Whisper transcription failed: %s", type(exc).__name__)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "stt_unavailable", "message": "Speech-to-text transcription failed"},
            ) from exc

    return {"transcript": transcript}
