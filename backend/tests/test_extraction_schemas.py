import pytest
from pydantic import ValidationError
from app.schemas.extraction import (
    LabReportExtraction,
    DischargeSummaryExtraction,
    PrescriptionExtraction,
    ConsultationExtraction,
    ProcedureExtraction,
    ImagingExtraction,
    OtherDocumentExtraction,
    ExtractedLabResult,
    ExtractedPrescriptionItem
)
from app.services.document_extraction import ExtractedMedicalEntities

def test_lab_report_extraction_valid():
    data = {
        "sourceReference": "doc-123",
        "results": [
            {
                "testName": "Hemoglobin",
                "result": "13.5",
                "unit": "g/dL"
            }
        ]
    }
    model = LabReportExtraction(**data)
    assert model.sourceReference == "doc-123"
    assert len(model.results) == 1
    assert model.results[0].testName == "Hemoglobin"
    assert model.results[0].result == "13.5"
    assert model.results[0].unit == "g/dL"
    assert model.results[0].referenceRange is None

def test_lab_report_missing_required():
    data = {
        "sourceReference": "doc-123",
        "results": [
            {
                "testName": "Hemoglobin"
            }
        ]
    }
    with pytest.raises(ValidationError):
        LabReportExtraction(**data)

def test_missing_source_reference():
    data = {
        "results": [
            {
                "testName": "Hemoglobin",
                "result": "13.5"
            }
        ]
    }
    with pytest.raises(ValidationError):
        LabReportExtraction(**data)

def test_discharge_summary_valid():
    data = {
        "sourceReference": "doc-123",
        "diagnoses": ["Hypertension"]
    }
    model = DischargeSummaryExtraction(**data)
    assert model.diagnoses == ["Hypertension"]
    assert model.admissionDate is None
    assert model.dischargeMedications is None

def test_prescription_valid():
    data = {
        "sourceReference": "doc-123",
        "medications": [
            {
                "medication": "Metformin",
                "dose": None
            }
        ]
    }
    model = PrescriptionExtraction(**data)
    assert len(model.medications) == 1
    assert model.medications[0].medication == "Metformin"
    assert model.medications[0].dose is None

def test_consultation_valid():
    data = {
        "sourceReference": "doc-123",
        "assessmentDiagnosis": ["Asthma"]
    }
    model = ConsultationExtraction(**data)
    assert model.assessmentDiagnosis == ["Asthma"]
    assert model.complaint is None

def test_procedure_valid():
    data = {
        "sourceReference": "doc-123",
        "procedureName": "Appendectomy"
    }
    model = ProcedureExtraction(**data)
    assert model.procedureName == "Appendectomy"
    assert model.complications is None

def test_imaging_valid():
    data = {
        "sourceReference": "doc-123",
        "modality": "X-Ray",
        "bodySite": "Chest",
        "impression": "Normal chest x-ray"
    }
    model = ImagingExtraction(**data)
    assert model.modality == "X-Ray"
    assert model.impression == "Normal chest x-ray"
    assert model.findings is None

def test_other_document_valid():
    data = {
        "sourceReference": "doc-123",
        "summary": "Patient arrived for physical."
    }
    model = OtherDocumentExtraction(**data)
    assert model.summary == "Patient arrived for physical."
    assert model.entities is None

def test_v1_compatibility_remains():
    data = {
        "sourceReference": "doc-123"
    }
    model = ExtractedMedicalEntities(**data)
    assert model.sourceReference == "doc-123"
    assert model.medications == []
    assert model.diagnoses == []
