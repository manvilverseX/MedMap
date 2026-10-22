"""
POST /api/v1/translate/ui
Batch-translates a dictionary of UI string keys for the frontend.
Results are cached via translation_service (LRU + DB).
"""
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.translation_service import (
    AI_TRANSLATION_TAG,
    FALLBACK_NOTICE,
    normalise_lang,
    translate_texts,
)

router = APIRouter()


class UITranslationRequest(BaseModel):
    lang: Optional[str] = None  # "hi" or "kn" (or "Hindi" / "Kannada")
    targetLang: Optional[str] = None  # Frontend alias
    strings: Dict[str, str]  # key -> English text


class UITranslationResponse(BaseModel):
    lang: str
    strings: Dict[str, str]  # key -> translated text
    translations: Optional[Dict[str, str]] = None  # Frontend alias
    translated: bool
    fallbackNotice: Optional[str] = None
    aiTranslationTag: Optional[str] = None


@router.post("", response_model=UITranslationResponse)
@router.post("/", response_model=UITranslationResponse)
def translate_ui_strings(
    payload: UITranslationRequest,
    db: Session = Depends(get_db),
):
    import time
    t_start = time.perf_counter()
    raw_lang = payload.lang or payload.targetLang
    lang = normalise_lang(raw_lang)
    if lang == "en":
        return UITranslationResponse(
            lang=lang,
            strings=payload.strings,
            translations=payload.strings,
            translated=True,
        )

    if not payload.strings:
        return UITranslationResponse(
            lang=lang,
            strings={},
            translations={},
            translated=True,
        )

    keys = list(payload.strings.keys())
    texts = [payload.strings[k] for k in keys]

    translated_list, was_translated = translate_texts(texts, lang, db=db)

    result_dict: dict[str, str] = {}
    for k, orig, t in zip(keys, texts, translated_list):
        result_dict[k] = t if (t and t.strip()) else orig

    t_elapsed = time.perf_counter() - t_start
    import logging
    logging.getLogger(__name__).info(
        "[TIMING] POST /translate/ui (%s) translated %d strings in %.3fs (was_translated=%s)",
        lang,
        len(keys),
        t_elapsed,
        was_translated,
    )

    return UITranslationResponse(
        lang=lang,
        strings=result_dict,
        translations=result_dict,
        translated=was_translated,
        fallbackNotice=None if was_translated else FALLBACK_NOTICE.get(lang),
        aiTranslationTag=AI_TRANSLATION_TAG.get(lang) if was_translated else None,
    )

