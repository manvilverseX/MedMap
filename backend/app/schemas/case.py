from pydantic import BaseModel, field_validator
from typing import Dict, Optional, Any
from datetime import datetime
from enum import Enum


class AISummary(BaseModel):
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
                continue
            if isinstance(val, dict):
                if "value" not in val or "clarification_needed" not in val:
                    raise ValueError(f"Invalid value type for {k}")
                continue
            raise ValueError(f"Invalid value type for {k}")
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
