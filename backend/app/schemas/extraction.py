from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

# Shared source/evidence representation
class ExtractedSourceInfo(BaseModel):
    sourceReference: str
    clinicallyRelevantDates: Optional[List[str]] = None
    evidenceQuotes: Optional[Dict[str, str]] = None

# 3. Lab Report
class ExtractedLabResult(BaseModel):
    testName: str
    result: str
    unit: Optional[str] = None
    referenceRange: Optional[str] = None
    abnormalFlag: Optional[bool] = None
    reportDate: Optional[str] = None
    labProvider: Optional[str] = None
    specimen: Optional[str] = None

class LabReportExtraction(ExtractedSourceInfo):
    results: List[ExtractedLabResult]

# 4. Discharge Summary
class ExtractedDischargeMedication(BaseModel):
    medication: str
    dose: Optional[str] = None
    frequency: Optional[str] = None

class DischargeSummaryExtraction(ExtractedSourceInfo):
    admissionDate: Optional[str] = None
    dischargeDate: Optional[str] = None
    reasonForAdmission: Optional[str] = None
    diagnoses: List[str]
    procedures: Optional[List[str]] = None
    hospitalCourse: Optional[str] = None
    dischargeMedications: Optional[List[ExtractedDischargeMedication]] = None
    followUp: Optional[str] = None
    importantFindings: Optional[List[str]] = None

# 5. Doctor Prescription
class ExtractedPrescriptionItem(BaseModel):
    medication: str
    dose: Optional[str] = None
    frequency: Optional[str] = None
    route: Optional[str] = None
    duration: Optional[str] = None
    status: Optional[str] = None

class PrescriptionExtraction(ExtractedSourceInfo):
    medications: List[ExtractedPrescriptionItem]
    prescriptionDate: Optional[str] = None
    prescriber: Optional[str] = None

# 6. Consultation Record
class ConsultationExtraction(ExtractedSourceInfo):
    date: Optional[str] = None
    complaint: Optional[str] = None
    history: Optional[str] = None
    assessmentDiagnosis: List[str]
    plan: Optional[str] = None
    prescribedMedications: Optional[List[ExtractedPrescriptionItem]] = None
    investigations: Optional[List[str]] = None
    followUp: Optional[str] = None

# 7. Surgical / Procedure Record
class ProcedureExtraction(ExtractedSourceInfo):
    procedureName: str
    procedureDate: Optional[str] = None
    provider: Optional[str] = None
    findings: Optional[str] = None
    complications: Optional[str] = None

# 8. Imaging / Diagnostic Report
class ImagingExtraction(ExtractedSourceInfo):
    modality: str
    bodySite: str
    impression: str
    reportDate: Optional[str] = None
    findings: Optional[str] = None
    measurements: Optional[List[str]] = None

# 9. Other Medical Document
class GenericEntity(BaseModel):
    key: str
    value: str

class OtherDocumentExtraction(ExtractedSourceInfo):
    summary: str
    entities: Optional[List[GenericEntity]] = None
