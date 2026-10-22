from pydantic import BaseModel, ConfigDict, field_validator
from typing import Dict, Optional, Any
from datetime import datetime
from enum import Enum


class AISummary(BaseModel):
    model_config = ConfigDict(extra="allow")

    chiefComplaint: str
    historyOfPresentIllness: str
    pastMedicalHistory: str
    pastSurgicalHistory: Optional[str] = None
    medications: Optional[str] = None
    allergies: Optional[str] = None
    familyHistory: Optional[str] = None
    reviewOfSystems: Optional[str] = None


class CaseStatus(str, Enum):
    INTAKE = "intake"
    PATIENT_VERIFYING = "patient_verifying"
    DOCTOR_REVIEW = "doctor_review"
    COMPLETED = "completed"


class CaseCreate(BaseModel):
    patientId: str
    language: Optional[str] = None
    consentGranted: bool = False
    intakeAnswers: Optional[Dict[str, Any]] = None


MAX_ANSWER_LENGTH = 5000
ALLOWED_ANSWER_DICT_KEYS = {
    "value",
    "clarification_needed",
    "reason_code",
    "original",
    "originalValue",
    "lang",
    "translated",
    "translationFailed",
    "translationPending",
    "relevanceUnchecked",
    "uncertain",
    "isClarified",
    "isCorrected",
    "isUncertain",
    "clarification_attempts",
}


class CaseUpdate(BaseModel):
    status: Optional[CaseStatus] = None
    language: Optional[str] = None
    consentGranted: Optional[bool] = None
    intakeAnswers: Optional[Dict[str, Any]] = None
    derivedClinicalData: Optional[Dict[str, Any]] = None
    clinicalAssessment: Optional[Dict[str, Any]] = None
    reviewerId: Optional[str] = None

    @field_validator("status", "consentGranted", mode="before")
    @classmethod
    def reject_null_for_non_nullable_fields(cls, value):
        if value is None:
            raise ValueError("Field cannot be null")
        return value

    @field_validator("intakeAnswers", mode="before")
    @classmethod
    def validate_intake_answers(cls, v):
        if v is None:
            return v
        if not isinstance(v, dict):
            raise ValueError("intakeAnswers must be a dict")
        for k, val in v.items():
            if isinstance(val, str):
                if len(val) > MAX_ANSWER_LENGTH:
                    raise ValueError(f"Answer for {k} exceeds maximum length of {MAX_ANSWER_LENGTH} characters")
                continue
            if isinstance(val, dict):
                unknown_keys = set(val.keys()) - ALLOWED_ANSWER_DICT_KEYS
                if unknown_keys:
                    raise ValueError(f"Unknown structure for {k}: unrecognized keys {sorted(unknown_keys)}")
                if "value" not in val or not isinstance(val["value"], str):
                    raise ValueError(f"Invalid value type for {k}: dict must contain string 'value'")
                if len(val["value"]) > MAX_ANSWER_LENGTH:
                    raise ValueError(f"Answer for {k} exceeds maximum length of {MAX_ANSWER_LENGTH} characters")
                if "original" in val and isinstance(val["original"], str) and len(val["original"]) > MAX_ANSWER_LENGTH:
                    raise ValueError(f"Original answer for {k} exceeds maximum length of {MAX_ANSWER_LENGTH} characters")

                has_clarification = "clarification_needed" in val
                has_multilingual = "original" in val or "lang" in val or "translated" in val or "translationFailed" in val
                if has_clarification or has_multilingual:
                    continue
                raise ValueError(f"Invalid value type for {k}")
            raise ValueError(f"Invalid value type for {k}: expected string or valid answer dict")
        return v



class CaseResponse(BaseModel):
    caseId: str
    patientId: str
    createdAt: datetime
    updatedAt: datetime
    language: Optional[str] = None
    consentGranted: bool = False
    status: str
    intakeAnswers: Optional[Dict[str, Any]] = None
    derivedClinicalData: Optional[Dict[str, Any]] = None
    clinicalAssessment: Optional[Dict[str, Any]] = None
    aiSummary: Optional[AISummary] = None
    reviewerId: Optional[str] = None
    adaptiveState: Optional[Dict[str, Any]] = None
    nextQuestion: Optional[Dict[str, Any]] = None
