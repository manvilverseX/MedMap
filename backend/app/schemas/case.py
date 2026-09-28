from pydantic import BaseModel, field_validator
from typing import Dict, Optional, Any
from datetime import datetime
from enum import Enum


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
    intakeAnswers: Optional[Dict[str, str]] = None
    derivedClinicalData: Optional[Dict[str, Any]] = None
    clinicalAssessment: Optional[Dict[str, Any]] = None
    reviewerId: Optional[str] = None

    @field_validator("status", "consentGranted", mode="before")
    @classmethod
    def reject_null_for_non_nullable_fields(cls, value):
        if value is None:
            raise ValueError("Field cannot be null")
        return value


class CaseResponse(BaseModel):
    caseId: str
    patientId: str
    createdAt: datetime
    updatedAt: datetime
    language: Optional[str] = None
    consentGranted: bool = False
    status: str
    intakeAnswers: Optional[Dict[str, str]] = None
    derivedClinicalData: Optional[Dict[str, Any]] = None
    clinicalAssessment: Optional[Dict[str, Any]] = None
    reviewerId: Optional[str] = None
