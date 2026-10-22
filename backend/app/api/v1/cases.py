from typing import List, Optional, Dict, Any
import os
import time
import logging

logger = logging.getLogger(__name__)
from fastapi import APIRouter, HTTPException, Depends, Query, Header, UploadFile, File, Form
from fastapi.responses import FileResponse, RedirectResponse, Response, StreamingResponse
from sqlalchemy.orm import Session
from app.schemas.case import CaseCreate, CaseUpdate, CaseResponse, CaseStatus
from app.schemas.intake import IntakeRequestMode, IntakeSessionState
from app.services import case_service
from pydantic import BaseModel
from app.core.database import get_db
from app.schemas.document import DocumentResponse
from app.services import document_service
from app.models.document import PatientDocument
from app.core.security import require_doctor, require_patient_or_doctor, require_doctor_or_admin, create_access_token
from app.services.audit_service import log_clinical_event, get_case_audit_trail, record_evidence_decision

router = APIRouter()

@router.post("", status_code=201)
@router.post("/", status_code=201)
def create_case(case_in: CaseCreate, db: Session = Depends(get_db)):
    if case_in.consentGranted is not True:
        raise HTTPException(status_code=400, detail="Explicit consent is required to create a case")
    case_response = case_service.create_case(db, case_in)
    access_token = create_access_token(data={"role": "patient", "case_id": case_response.caseId})

    # Record case creation & consent audit events
    log_clinical_event(db, case_response.caseId, "case_created", {"patientId": case_in.patientId, "consentGranted": True, "actor": "patient"})
    log_clinical_event(db, case_response.caseId, "consent_granted", {"consentGranted": True, "actor": "patient"})

    return {"case": case_response, "token": access_token}

@router.get("", response_model=List[CaseResponse])
@router.get("/", response_model=List[CaseResponse])
def get_cases(status: Optional[CaseStatus] = Query(None), db: Session = Depends(get_db), current_user: Dict[str, Any] = Depends(require_doctor)):
    status_val = status.value if status else None
    return case_service.get_cases(db, status=status_val)

@router.get("/{case_id}", response_model=CaseResponse)
def get_case(case_id: str, db: Session = Depends(get_db), current_user: Dict[str, Any] = Depends(require_patient_or_doctor)):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")
    case = case_service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.get("/{case_id}/adaptive-intake", response_model=IntakeSessionState)
def get_adaptive_intake_state(
    case_id: str,
    mode: Optional[IntakeRequestMode] = Query(None),
    question_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor),
):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")

    import time
    t_start = time.perf_counter()

    case = case_service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    from app.services.adaptive_intake import select_intake_state
    from app.services.translation_service import (
        normalise_lang, translate_texts, FALLBACK_NOTICE, AI_TRANSLATION_TAG
    )

    try:
        session_state = select_intake_state(
            case.intakeAnswers,
            mode=mode,
            question_id=question_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # ── Localise the current question for non-English cases ──────────────
    lang = normalise_lang(getattr(case, 'language', None))
    if lang != "en":
        # Collect all English strings that need translating in one batch call
        texts_to_translate: list[str] = []
        field_index: dict[str, int] = {}

        def _enqueue(key: str, text: Optional[str]) -> None:
            if text:
                field_index[key] = len(texts_to_translate)
                texts_to_translate.append(text)

        if session_state.currentQuestion is not None:
            q = session_state.currentQuestion
            _enqueue("category", q.category)
            _enqueue("prompt", q.prompt)
            _enqueue("helperText", q.helperText)
            option_start = len(texts_to_translate)
            for opt in (q.options or []):
                texts_to_translate.append(opt)
            option_end = len(texts_to_translate)
            clarif_start = len(texts_to_translate)
            for opt in (q.clarificationOptions or []):
                texts_to_translate.append(opt)
            clarif_end = len(texts_to_translate)
        else:
            option_start = option_end = clarif_start = clarif_end = 0

        # Translate issue text if present
        issue_start = len(texts_to_translate)
        if session_state.issue:
            texts_to_translate.append(session_state.issue)
        issue_end = len(texts_to_translate)

        # Translate safetyEscalation if present
        if session_state.safetyEscalation is not None:
            esc = session_state.safetyEscalation
            _enqueue("esc_title", esc.title)
            _enqueue("esc_message", esc.message)
            _enqueue("esc_instructions", esc.instructions)
            rf_start = len(texts_to_translate)
            for rf in (esc.redFlags or []):
                texts_to_translate.append(rf)
            rf_end = len(texts_to_translate)
        else:
            rf_start = rf_end = 0

        # Translate clinicalProgress if present
        if session_state.clinicalProgress is not None:
            cp = session_state.clinicalProgress
            _enqueue("cp_activeDomain", cp.activeDomain)
            dom_start = len(texts_to_translate)
            for dom in (cp.domainsExplored or []):
                texts_to_translate.append(dom)
            dom_end = len(texts_to_translate)
        else:
            dom_start = dom_end = 0

        translated_list, was_translated = translate_texts(
            texts_to_translate, lang, db=db
        )

        fallback_notice = None if was_translated else FALLBACK_NOTICE.get(lang)
        ai_tag = AI_TRANSLATION_TAG.get(lang) if was_translated else None

        def _get(key: str, default: Optional[str] = None) -> Optional[str]:
            idx = field_index.get(key)
            if idx is None:
                return default
            return translated_list[idx] if was_translated else default

        updates: dict[str, Any] = {
            "translated": was_translated,
            "translationLang": lang,
            "translationFallbackNotice": fallback_notice,
            "aiTranslationTag": ai_tag,
        }

        if session_state.currentQuestion is not None:
            localized_options = (
                tuple(translated_list[option_start:option_end])
                if was_translated and option_end > option_start
                else None
            )
            localized_clarif = (
                tuple(translated_list[clarif_start:clarif_end])
                if was_translated and clarif_end > clarif_start
                else None
            )
            localized_q = session_state.currentQuestion.model_copy(update={
                "categoryLocalized": _get("category"),
                "promptLocalized": _get("prompt"),
                "helperTextLocalized": _get("helperText"),
                "optionsLocalized": localized_options,
                "clarificationOptionsLocalized": localized_clarif,
            })
            updates["currentQuestion"] = localized_q

        if issue_end > issue_start:
            updates["issueLocalized"] = translated_list[issue_start] if was_translated else None

        if session_state.safetyEscalation is not None:
            esc = session_state.safetyEscalation
            localized_rfs = (
                list(translated_list[rf_start:rf_end])
                if was_translated and rf_end > rf_start
                else None
            )
            title_loc = _get("esc_title")
            msg_loc = _get("esc_message")
            inst_loc = _get("esc_instructions")
            localized_esc = esc.model_copy(update={
                "titleLocalized": title_loc,
                "messageLocalized": msg_loc,
                "instructionsLocalized": inst_loc,
                "redFlagsLocalized": localized_rfs,
                "headlineLocalized": title_loc,
                "reasonLocalized": msg_loc,
                "guidanceLocalized": inst_loc,
                "headline": esc.title,
                "reason": esc.message,
                "guidance": esc.instructions,
                "redFlagsDetected": esc.redFlags,
            })
            updates["safetyEscalation"] = localized_esc

        if session_state.clinicalProgress is not None:
            cp = session_state.clinicalProgress
            localized_doms = (
                list(translated_list[dom_start:dom_end])
                if was_translated and dom_end > dom_start
                else None
            )
            localized_cp = cp.model_copy(update={
                "activeDomainLocalized": _get("cp_activeDomain"),
                "domainsExploredLocalized": localized_doms,
            })
            updates["clinicalProgress"] = localized_cp

        session_state = session_state.model_copy(update=updates)

    logger.info("[TIMING] GET /cases/%s/adaptive-intake finished in %.3fs", case_id, time.perf_counter() - t_start)
    return session_state

@router.put("/{case_id}", response_model=CaseResponse)
def update_case(case_id: str, case_in: CaseUpdate, db: Session = Depends(get_db), current_user: Dict[str, Any] = Depends(require_patient_or_doctor)):
    import time
    t_start = time.perf_counter()

    current_case = case_service.get_case(db, case_id)
    if not current_case:
        raise HTTPException(status_code=404, detail="Case not found")

    provided_fields = case_in.model_dump(exclude_unset=True).keys()

    if "derivedClinicalData" in provided_fields:
        raise HTTPException(
            status_code=403,
            detail="Derived clinical data is server-controlled"
        )

    if current_user.get("role") == "patient":
        if current_user.get("case_id") != case_id:
            raise HTTPException(status_code=403, detail="Not authorized to update this case")
        if case_in.status == CaseStatus.COMPLETED:
            raise HTTPException(status_code=403, detail="Patients cannot mark case as completed")

        if "clinicalAssessment" in provided_fields or "reviewerId" in provided_fields:
            raise HTTPException(status_code=403, detail="Patients cannot modify doctor review fields")

    elif current_user.get("role") == "doctor":
        update_data = case_in.model_dump(exclude_unset=True)
        # Prevent client from spoofing reviewerId
        if "reviewerId" in update_data:
            del update_data["reviewerId"]

        if "clinicalAssessment" in provided_fields:
            update_data["reviewerId"] = current_user.get("sub")

        case_in = CaseUpdate(**update_data)

    if case_in.status and case_in.status != current_case.status:
        valid_transitions = {
            CaseStatus.INTAKE: [CaseStatus.PATIENT_VERIFYING],
            CaseStatus.PATIENT_VERIFYING: [CaseStatus.DOCTOR_REVIEW],
            CaseStatus.DOCTOR_REVIEW: [CaseStatus.COMPLETED, CaseStatus.PATIENT_VERIFYING],
            CaseStatus.COMPLETED: []
        }

        allowed_next_states = valid_transitions.get(CaseStatus(current_case.status), [])
        if case_in.status not in allowed_next_states:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid state transition from {current_case.status} to {case_in.status.value}"
            )

    was_intake_completion = (
        current_case.status == CaseStatus.INTAKE.value and case_in.status == CaseStatus.PATIENT_VERIFYING
    )
    was_patient_verification = (
        case_in.status == CaseStatus.DOCTOR_REVIEW and current_case.status == CaseStatus.PATIENT_VERIFYING.value
    )

    if case_in.intakeAnswers is not None:
        from app.services.ai_service import validate_answer_with_llm
        from app.services.adaptive_intake import (
            INTAKE_QUESTIONS,
            sanitize_active_answers,
            validate_clinical_answer,
        )
        from app.services.translation_service import normalise_lang, translate_to_english
        by_id = {q.id: q for q in INTAKE_QUESTIONS}

        # Determine case language for answer translation
        case_lang = normalise_lang(case_in.language or getattr(current_case, 'language', None))

        # Invalidate / exclude dependent answers that are no longer eligible
        sanitized_answers, _ = sanitize_active_answers(case_in.intakeAnswers)
        case_in.intakeAnswers = sanitized_answers

        for q_id, answer in list(case_in.intakeAnswers.items()):
            if not isinstance(answer, str) or not answer.strip():
                continue

            old_record = current_case.intakeAnswers.get(q_id) if current_case.intakeAnswers else None
            old_answer = old_record.get("value") if isinstance(old_record, dict) else old_record
            attempts = int(old_record.get("clarification_attempts", 0)) if isinstance(old_record, dict) else 0

            # Idempotency: if answer is identical and previously accepted (not in clarification), keep existing record
            if old_answer == answer and isinstance(old_record, dict) and "clarification_needed" not in old_record:
                case_in.intakeAnswers[q_id] = old_record
                continue

            # ── Translate non-English free-text answers to English ──────────
            # Safety rules, LLM validation and all clinical logic run on english_answer.
            # The patient's original language answer is preserved as original_lang_answer.
            original_lang_answer = answer
            english_answer = answer
            translation_was_successful = True

            if case_lang != "en":
                from app.services.translation_service import _lookup_static_bank
                bank_trans = _lookup_static_bank(answer, case_lang)
                if bank_trans:
                    english_answer = answer
                    original_lang_answer = bank_trans
                    translation_was_successful = True
                else:
                    try:
                        english_answer, translation_was_successful = translate_to_english(
                            answer, case_lang, db=db
                        )
                    except Exception as exc:
                        logger.warning("Translation to English failed (%s)", exc)
                        english_answer = answer
                        translation_was_successful = False

            # Store bilingual answer
            if case_lang != "en":
                case_in.intakeAnswers[q_id] = {
                    "value": english_answer,         # English for clinical logic
                    "original": original_lang_answer, # Patient's language
                    "lang": case_lang,
                    "translated": translation_was_successful,
                    "translationFailed": not translation_was_successful,
                    "translationPending": not translation_was_successful,
                }
                # Use english_answer for all subsequent validation
                answer = english_answer

            # ── Layered Answer Validation ──────────────────────────────────
            # 1. Emergency / Red-Flag Safety Check: MUST RUN FIRST!
            # Never block emergency content: if it triggers, accept and escalate immediately.
            from app.services.interview_engine import evaluate_emergency_safety
            tentative_for_safety = dict(current_case.intakeAnswers or {})
            tentative_for_safety[q_id] = english_answer
            safety_check = evaluate_emergency_safety(tentative_for_safety)

            needs_clar = False
            clar_prompt = None
            reason_code = None
            relevance_unchecked = False

            if safety_check.is_escalated:
                # Emergency content is accepted without clarification to trigger immediate escalation
                needs_clar = False
            else:
                # 2. Choice Questions Check: value must be one of the allowed options
                q_obj = by_id.get(q_id)
                if q_obj and q_obj.options and q_obj.inputType in ("choice", "radio", "select"):
                    allowed_opts = [opt.casefold() for opt in q_obj.options]
                    if english_answer.strip().casefold() not in allowed_opts:
                        needs_clar = True
                        reason_code = "ANSWER_INVALID"
                        clar_prompt = "Please select one of the provided options."

                # 3. Deterministic Free-Text Validation
                if not needs_clar:
                    val_res = validate_clinical_answer(
                        q_id,
                        english_answer,
                        previous_attempts=attempts,
                    )
                    if val_res.needs_clarification:
                        needs_clar = True
                        clar_prompt = val_res.message
                        reason_code = val_res.reason_code or "ANSWER_INVALID"

                # 4. Relevance Check using Groq (when deterministic checks pass)
                if not needs_clar:
                    try:
                        from app.services.interview_engine.policy_engine import CURATED_GAP_QUESTIONS
                        if q_id in by_id:
                            q_prompt = by_id[q_id].prompt
                        elif q_id in CURATED_GAP_QUESTIONS:
                            q_prompt = CURATED_GAP_QUESTIONS[q_id]["prompt"]
                        else:
                            q_prompt = "Patient answer:"

                        llm_val = validate_answer_with_llm(q_prompt, english_answer)
                        if llm_val.needs_clarification:
                            needs_clar = True
                            clar_prompt = llm_val.clarifying_question or clar_prompt
                            reason_code = llm_val.reason_code or "ANSWER_NOT_RELEVANT"
                        if getattr(llm_val, "relevance_unchecked", False):
                            relevance_unchecked = True
                    except Exception as e:
                        logger.warning("Groq relevance check error: %s", e)
                        relevance_unchecked = True

            # Format localized friendly message on rejection
            MESSAGES = {
                "ANSWER_INVALID": {
                    "en": "Please describe your symptoms using clear words so your care team can understand. (Example: 'Throbbing headache for 2 days')",
                    "kn": "ನಿಮ್ಮ ವೈದ್ಯರಿಗೆ ಅರ್ಥವಾಗಲು ದಯವಿಟ್ಟು ಸ್ಪಷ್ಟವಾದ ಪದಗಳಲ್ಲಿ ವಿವರಿಸಿ. (ಉದಾಹರಣೆ: '೨ ದಿನಗಳಿಂದ ತಲೆನೋವು')",
                    "hi": "अपने डॉक्टर को समझने में मदद के लिए कृपया स्पष्ट शब्दों में बताएं। (उदाहरण: '२ दिनों से तेज सिरदर्द')",
                },
                "ANSWER_NOT_RELEVANT": {
                    "en": "Your answer does not seem related to this question. Please answer what was asked, or type 'Not sure'. (Example: 'Fever since yesterday')",
                    "kn": "ನಿಮ್ಮ ಉತ್ತರವು ಈ ಪ್ರಶ್ನೆಗೆ ಸಂಬಂಧಪಟ್ಟಿಲ್ಲ ಎಂದು ತೋರುತ್ತಿದೆ. ದಯವಿಟ್ಟು ಕೇಳಿದ ಪ್ರಶ್ನೆಗೆ ಉತ್ತರಿಸಿ, ಅಥವಾ 'ಗೊತ್ತಿಲ್ಲ' ಎಂದು ತಿಳಿಸಿ. (ಉದಾಹರಣೆ: 'ನಿನ್ನೆಯಿಂದ ಜ್ವರ')",
                    "hi": "आपका उत्तर इस प्रश्न से संबंधित नहीं लगता है। कृपया पूछे गए प्रश्न का उत्तर दें, या 'पता नहीं' लिखें। (उदाहरण: 'कल से बुखार')",
                },
                "ANSWER_TOO_SHORT": {
                    "en": "Your answer is too short. Please describe your symptoms in a few words. (Example: 'Throat pain while swallowing')",
                    "kn": "ನಿಮ್ಮ ಉತ್ತರ ತುಂಬಾ ಚಿಕ್ಕದಾಗಿದೆ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ಲಕ್ಷಣಗಳನ್ನು ಕೆಲವು ಪದಗಳಲ್ಲಿ ವಿವರಿಸಿ. (ಉದಾಹರಣೆ: 'ನುಂಗುವಾಗ ಗಂಟಲು ನೋವು')",
                    "hi": "आपका उत्तर बहुत छोटा है। कृपया अपने लक्षणों का कुछ शब्दों में वर्णन करें। (उदाहरण: 'निगलते समय गले में दर्द')",
                },
            }

            if needs_clar:
                code_msgs = MESSAGES.get(reason_code or "ANSWER_INVALID", MESSAGES["ANSWER_INVALID"])
                friendly_msg = code_msgs.get(case_lang, clar_prompt or code_msgs["en"])

                record = {
                    "value": english_answer,
                    "original": original_lang_answer,
                    "originalValue": original_lang_answer,
                    "lang": case_lang,
                    "clarification_needed": friendly_msg,
                    "reason_code": reason_code or "ANSWER_INVALID",
                    "clarification_attempts": attempts + 1,
                    "translated": translation_was_successful,
                    "translationFailed": not translation_was_successful,
                    "translationPending": not translation_was_successful,
                }
                if relevance_unchecked:
                    record["relevanceUnchecked"] = True
                case_in.intakeAnswers[q_id] = record
            else:
                # Valid answer accepted
                if case_lang == "en":
                    case_in.intakeAnswers[q_id] = english_answer
                else:
                    record = {
                        "value": english_answer,
                        "original": original_lang_answer,
                        "originalValue": original_lang_answer,
                        "lang": case_lang,
                        "clarification_attempts": attempts,
                        "translated": translation_was_successful,
                        "translationFailed": not translation_was_successful,
                        "translationPending": not translation_was_successful,
                    }
                    if relevance_unchecked:
                        record["relevanceUnchecked"] = True
                    case_in.intakeAnswers[q_id] = record


    case = case_service.update_case(db, case_id, case_in)

    # Feature Four: Structured medical history and human-in-the-loop provenance
    from app.services.adaptive_intake import build_structured_intake
    is_verified = (case.status in [CaseStatus.DOCTOR_REVIEW.value, CaseStatus.COMPLETED.value])
    structured = build_structured_intake(case.intakeAnswers or {}, verified=is_verified)

    derived = dict(current_case.derivedClinicalData or {})
    derived["structuredIntake"] = structured

    # Check whether any non-English answer failed translation
    active_intake_answers = dict(case.intakeAnswers or {})
    unscreened_answers = [
        {"questionId": k, "original": v.get("original", ""), "lang": v.get("lang", getattr(case, "language", "non-en"))}
        for k, v in active_intake_answers.items()
        if isinstance(v, dict) and (v.get("translationFailed") is True or (v.get("translated") is False and v.get("lang") and normalise_lang(v.get("lang")) != "en"))
    ]
    translation_screening_incomplete = len(unscreened_answers) > 0
    derived["translationScreeningIncomplete"] = translation_screening_incomplete
    if translation_screening_incomplete:
        derived["translationFailedAnswers"] = unscreened_answers

    # Persist interview state and safety metadata
    from app.services.interview_engine import evaluate_emergency_safety
    from app.services.adaptive_intake import select_intake_state

    safety_check = evaluate_emergency_safety(case.intakeAnswers or {})
    if safety_check.is_escalated:
        from datetime import datetime, timezone
        derived["safetyEscalation"] = {
            "isEscalated": True,
            "severity": safety_check.severity,
            "title": safety_check.title,
            "message": safety_check.message,
            "instructions": safety_check.instructions,
            "redFlags": safety_check.red_flags,
            "escalatedAt": datetime.now(timezone.utc).isoformat(),
            "translationScreeningIncomplete": translation_screening_incomplete,
        }
    elif translation_screening_incomplete:
        from datetime import datetime, timezone
        derived["safetyEscalation"] = {
            "isEscalated": False,
            "translationScreeningIncomplete": True,
            "requiresManualReview": True,
            "title": "Manual Red-Flag Review Required",
            "message": "Automatic red-flag screening could not run on some non-English answers. Please review the original patient answers manually.",
            "instructions": "Clinician must manually review untranslated answers for safety signals.",
            "redFlags": ["Manual review needed: Non-English answers unscreened due to translation failure"],
            "escalatedAt": datetime.now(timezone.utc).isoformat(),
        }

    interview_session = select_intake_state(case.intakeAnswers or {}, enable_ai=False)
    derived["interviewState"] = {
        "status": interview_session.state.value,
        "completionReason": interview_session.completionReason,
        "questionsAnswered": len(interview_session.answeredQuestionIds),
        "clinicalProgress": interview_session.clinicalProgress.model_dump() if interview_session.clinicalProgress else None,
    }

    if was_patient_verification:
        from datetime import datetime, timezone
        derived["patientVerification"] = {
            "verified": True,
            "verifiedAt": datetime.now(timezone.utc).isoformat(),
            "patientId": current_case.patientId,
            "statement": "Patient confirmed self-reported intake responses."
        }
    elif case_in.intakeAnswers is not None and not is_verified:
        if "patientVerification" in derived:
            derived["patientVerification"]["verified"] = False
            derived["patientVerification"]["reverificationRequired"] = True

    case_service.update_derived_clinical_data(db, case_id, derived)
    case.derivedClinicalData = derived

    # Automatically generate AI summary on intake completion
    if was_intake_completion and not case.aiSummary and case.intakeAnswers:
        from app.services import ai_service
        try:
            summary_dict = ai_service.generate_clinical_brief(case.intakeAnswers)
            updated_case = case_service.update_ai_summary(db, case_id, summary_dict)
            if updated_case:
                case = updated_case
        except Exception as e:
            logging.error(f"Automatic AI summary generation failed: {e}")
    # Audit logging for case update events
    if case_in.intakeAnswers is not None:
        log_clinical_event(db, case_id, "answers_updated", {"answeredCount": len(case_in.intakeAnswers), "actor": current_user.get("role", "patient")})
    if was_patient_verification:
        log_clinical_event(db, case_id, "patient_verified", {"patientId": current_case.patientId, "actor": "patient"})
    if case_in.status == CaseStatus.COMPLETED and current_case.status != CaseStatus.COMPLETED.value:
        log_clinical_event(db, case_id, "case_finalized", {"reviewerId": current_user.get("sub"), "doctor": current_user.get("username", "doctor"), "actor": "doctor"})

    logger.info("[TIMING] PUT /cases/%s finished in %.3fs", case_id, time.perf_counter() - t_start)
    return case

@router.post("/{case_id}/documents", response_model=DocumentResponse, status_code=201)
def upload_case_document(
    case_id: str,
    file: Optional[UploadFile] = File(None),
    metadata: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor)
):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to upload to this case")

    if metadata:
        import json
        from pydantic import BaseModel
        class BlobMetadata(BaseModel):
            url: str
            pathname: str
            filename: str
            mimeType: str
            sizeBytes: int

        try:
            meta_dict = json.loads(metadata)
            meta_obj = BlobMetadata(**meta_dict)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid metadata format")

        return document_service.save_document_metadata(db, case_id, meta_obj)

    if file:
        return document_service.upload_document(db, case_id, file)

    raise HTTPException(status_code=400, detail="Must provide file or metadata")

@router.get("/{case_id}/documents", response_model=List[DocumentResponse])
def get_case_documents(case_id: str, db: Session = Depends(get_db), current_user: Dict[str, Any] = Depends(require_patient_or_doctor)):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to access these documents")
    case = case_service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return document_service.get_documents(db, case_id)

@router.get("/{case_id}/documents/{document_id}/file")
def get_case_document_file(
    case_id: str,
    document_id: str,
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    auth_token = None
    if authorization and authorization.startswith("Bearer "):
        auth_token = authorization.split(" ", 1)[1]
    elif token:
        auth_token = token

    if not auth_token:
        raise HTTPException(
            status_code=401,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    from app.core.security import SECRET_KEY, ALGORITHM
    from app.models.user import TokenBlocklist
    import jwt

    try:
        payload = jwt.decode(auth_token, SECRET_KEY, algorithms=[ALGORITHM])
        role = payload.get("role")
        if role not in ["patient", "doctor", "admin"]:
            raise HTTPException(status_code=403, detail="Operation not permitted")
        if role == "patient" and payload.get("case_id") != case_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this case")
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=401,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    is_blocked = db.query(TokenBlocklist).filter(TokenBlocklist.token == auth_token).first()
    if is_blocked:
        raise HTTPException(
            status_code=401,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    doc = db.query(PatientDocument).filter(
        PatientDocument.id == document_id,
        PatientDocument.caseId == case_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_bytes = None
    media_type = doc.mimeType or "application/octet-stream"

    if doc.storagePath.startswith("http://") or doc.storagePath.startswith("https://"):
        import urllib.request
        token = os.environ.get("BLOB_READ_WRITE_TOKEN")
        headers = {"User-Agent": "MedMap-Backend/1.0"}
        if "private.blob.vercel-storage.com" in doc.storagePath and token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            req = urllib.request.Request(doc.storagePath, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status == 200:
                    file_bytes = resp.read()
                    content_type_header = resp.headers.get("Content-Type")
                    if content_type_header:
                        media_type = content_type_header
                else:
                    raise HTTPException(
                        status_code=404,
                        detail="This file is no longer available, ask the patient to upload again"
                    )
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                status_code=404,
                detail="This file is no longer available, ask the patient to upload again"
            )
    else:
        local_path = doc.storagePath
        if local_path.startswith("local://"):
            local_path = local_path.replace("local://", "")
        if not os.path.exists(local_path):
            raise HTTPException(
                status_code=404,
                detail="This file is no longer available, ask the patient to upload again"
            )
        try:
            with open(local_path, "rb") as f:
                file_bytes = f.read()
        except Exception:
            raise HTTPException(
                status_code=404,
                detail="This file is no longer available, ask the patient to upload again"
            )

    import io
    clean_filename = os.path.basename(doc.filename or "document").replace('"', '')
    response_headers = {
        "Content-Disposition": f'inline; filename="{clean_filename}"'
    }

    # Handle files > 4.5 MB via StreamingResponse to avoid Vercel payload limit
    if len(file_bytes) > 4.5 * 1024 * 1024:
        return StreamingResponse(
            io.BytesIO(file_bytes),
            media_type=media_type,
            headers=response_headers
        )

    return Response(
        content=file_bytes,
        media_type=media_type,
        headers=response_headers
    )


@router.get("/{case_id}/documents/{document_id}/highlight")
def get_case_document_highlight(
    case_id: str,
    document_id: str,
    snippet: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    page: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_doctor)
):
    import re
    doc = db.query(PatientDocument).filter(
        PatientDocument.id == document_id,
        PatientDocument.caseId == case_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    search_snippet = snippet
    if not search_snippet and entity_id:
        from app.models.evidence import Evidence
        ev = db.query(Evidence).filter(
            (Evidence.evidenceId == entity_id) | (Evidence.eventId == entity_id),
            Evidence.sourceDocumentId == document_id
        ).first()
        if ev and ev.snippet:
            search_snippet = ev.snippet
            if not page and ev.pageLocation:
                m = re.search(r'page\s*(\d+)', ev.pageLocation, re.I)
                if m:
                    page = int(m.group(1))

    if not search_snippet:
        search_snippet = ""

    # Non-PDF documents (e.g. images)
    if doc.mimeType != "application/pdf" and not (doc.filename and doc.filename.lower().endswith(".pdf")):
        return {
            "page": page or 1,
            "pageWidth": 0.0,
            "pageHeight": 0.0,
            "rects": [],
            "matchType": "page_only"
        }

    # Fetch document bytes
    file_bytes = None
    if doc.storagePath.startswith("http://") or doc.storagePath.startswith("https://"):
        import urllib.request
        token = os.environ.get("BLOB_READ_WRITE_TOKEN")
        headers = {"User-Agent": "MedMap-Backend/1.0"}
        if "private.blob.vercel-storage.com" in doc.storagePath and token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            req = urllib.request.Request(doc.storagePath, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status == 200:
                    file_bytes = resp.read()
                else:
                    raise HTTPException(
                        status_code=404,
                        detail="This file is no longer available, ask the patient to upload again"
                    )
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                status_code=404,
                detail="This file is no longer available, ask the patient to upload again"
            )
    else:
        local_path = doc.storagePath
        if local_path.startswith("local://"):
            local_path = local_path.replace("local://", "")
        if not os.path.exists(local_path):
            raise HTTPException(
                status_code=404,
                detail="This file is no longer available, ask the patient to upload again"
            )
        try:
            with open(local_path, "rb") as f:
                file_bytes = f.read()
        except Exception:
            raise HTTPException(
                status_code=404,
                detail="This file is no longer available, ask the patient to upload again"
            )

    from app.services.pdf_highlight_service import get_cached_pdf_highlights
    return get_cached_pdf_highlights(doc.id, search_snippet, page, file_bytes)


@router.post("/{case_id}/documents/{document_id}/extract", response_model=DocumentResponse)
def trigger_document_extraction(
    case_id: str,
    document_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor)
):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this document")

    from app.services import document_extraction
    updated_doc = document_extraction.process_document(db, case_id, document_id)
    return updated_doc

@router.post("/{case_id}/ai-summary", response_model=CaseResponse)
def generate_case_ai_summary(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor)
):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")

    case = case_service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Idempotency
    if case.aiSummary:
        return case

    if not case.intakeAnswers:
        raise HTTPException(status_code=400, detail="Cannot generate AI summary: intake answers are empty")

    from app.services import ai_service
    from pydantic import ValidationError

    try:
        summary_dict = ai_service.generate_clinical_brief(case.intakeAnswers)
    except ValidationError:
        raise HTTPException(status_code=502, detail="AI generated malformed response")
    except ValueError as ve:
        raise HTTPException(status_code=500, detail=str(ve))
    except RuntimeError:
        raise HTTPException(status_code=502, detail="AI Generation Failed")
    except Exception:
        raise HTTPException(status_code=500, detail="An unexpected error occurred during AI generation")

    updated_case = case_service.update_ai_summary(db, case_id, summary_dict)
    if not updated_case:
        raise HTTPException(status_code=404, detail="Case not found during update")

    return updated_case

@router.get("/{case_id}/clinical-intelligence")
def get_clinical_intelligence(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor)
):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")

    case = case_service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    docs = document_service.get_documents(db, case_id)
    # Serialize docs to dict for medication processor
    doc_dicts = [
        {"id": d.documentId, "createdAt": d.createdAt.isoformat(), "medicalEntities": d.medicalEntities}
        for d in docs if d.medicalEntities
    ]

    from app.services.clinical_intelligence import ClinicalRuleEngine, process_medication_intelligence
    
    # Simple dict form for rule engine
    case_dict = {"intakeAnswers": case.intakeAnswers or {}}
    
    flags = ClinicalRuleEngine.evaluate_case(case_dict)
    medications = process_medication_intelligence(case_dict, doc_dicts)

    return {
        "redFlags": flags,
        "medicationIntelligence": medications
    }

@router.get("/{case_id}/fhir")
def export_fhir_prototype(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor)
):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")

    case = case_service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    from app.services.fhir_mapper import generate_fhir_bundle
    bundle = generate_fhir_bundle(case)

    # Record audit event for FHIR export
    log_clinical_event(db, case_id, "fhir_exported", {"role": current_user.get("role"), "actor": current_user.get("username", current_user.get("role", "unknown"))})

    return bundle

@router.get("/{case_id}/unified")
def get_unified_case(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor)
):
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")

    from app.services.longitudinal_service import generate_unified_case
    unified = generate_unified_case(db, case_id)
    
    if not unified:
        raise HTTPException(status_code=404, detail="Case not found")
        
    return unified

class ItemReviewRequest(BaseModel):
    itemType: str  # "medications", "allergies", "diagnoses", "investigations", "procedures", "intake"
    itemId: str    # item index or key
    action: str    # "accepted", "edited", "rejected"
    reviewedValue: Optional[Any] = None
    originalValue: Optional[Any] = None
    sourceType: Optional[str] = "document"
    sourceDocumentId: Optional[str] = None
    snippet: Optional[str] = None
    pageLocation: Optional[str] = None

@router.post("/{case_id}/review-item")
def review_clinical_item(
    case_id: str,
    review_in: ItemReviewRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_doctor),
):
    from app.models.case import ClinicalCase
    from sqlalchemy.orm.attributes import flag_modified

    case = db.query(ClinicalCase).filter(ClinicalCase.caseId == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    field_path = f"{review_in.itemType}.{review_in.itemId}"

    # Record evidence decision and audit trail entry
    record_evidence_decision(
        db=db,
        case_id=case_id,
        field_path=field_path,
        action=review_in.action,
        source_type=review_in.sourceType or "document",
        source_document_id=review_in.sourceDocumentId,
        snippet=review_in.snippet,
        page_location=review_in.pageLocation,
        actor=current_user.get("username", "doctor"),
    )

    # Persist review in case.derivedClinicalData["doctorReviews"]
    from datetime import datetime, timezone
    derived = dict(case.derivedClinicalData or {})
    doctor_reviews = dict(derived.get("doctorReviews") or {})
    doctor_reviews[field_path] = {
        "itemType": review_in.itemType,
        "itemId": review_in.itemId,
        "action": review_in.action,
        "originalValue": review_in.originalValue,
        "reviewedValue": review_in.reviewedValue,
        "sourceDocumentId": review_in.sourceDocumentId,
        "snippet": review_in.snippet,
        "pageLocation": review_in.pageLocation,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "doctor": current_user.get("username", "doctor"),
    }
    derived["doctorReviews"] = doctor_reviews
    case.derivedClinicalData = derived
    flag_modified(case, "derivedClinicalData")
    db.commit()
    db.refresh(case)

    return {
        "success": True,
        "fieldPath": field_path,
        "review": doctor_reviews[field_path],
        "doctorReviews": doctor_reviews,
    }

@router.get("/{case_id}/audit")
def get_case_audit_log(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_doctor_or_admin),
):
    case = case_service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    events = get_case_audit_trail(db, case_id)
    return [
        {
            "eventId": e.eventId,
            "caseId": e.caseId,
            "eventType": e.eventType,
            "eventDate": e.eventDate.isoformat() if e.eventDate else None,
            "details": e.details,
            "status": e.status,
        }
        for e in events
    ]
