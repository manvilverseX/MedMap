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
    lang: str  # "hi" or "kn" (or "Hindi" / "Kannada")
    strings: Dict[str, str]  # key -> English text


class UITranslationResponse(BaseModel):
    lang: str
    strings: Dict[str, str]  # key -> translated text
    translated: bool
    fallbackNotice: Optional[str] = None
    aiTranslationTag: Optional[str] = None


@router.post("", response_model=UITranslationResponse)
@router.post("/", response_model=UITranslationResponse)
def translate_ui_strings(
    payload: UITranslationRequest,
    db: Session = Depends(get_db),
):
    lang = normalise_lang(payload.lang)
    if lang == "en":
        return UITranslationResponse(
            lang=lang,
            strings=payload.strings,
            translated=True,
        )

    if not payload.strings:
        return UITranslationResponse(lang=lang, strings={}, translated=True)

    keys = list(payload.strings.keys())
    texts = [payload.strings[k] for k in keys]

    translated_list, was_translated = translate_texts(texts, lang, db=db)

    result_dict = {k: t for k, t in zip(keys, translated_list)}

    return UITranslationResponse(
        lang=lang,
        strings=result_dict,
        translated=was_translated,
        fallbackNotice=None if was_translated else FALLBACK_NOTICE.get(lang),
        aiTranslationTag=AI_TRANSLATION_TAG.get(lang) if was_translated else None,
    )
