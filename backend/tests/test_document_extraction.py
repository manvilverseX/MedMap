import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.main import app
from app.models.document import PatientDocument
from app.models.case import ClinicalCase
from app.services import document_extraction
from datetime import datetime, timezone
import uuid
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.base import Base
from unittest.mock import patch, MagicMock

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_doc_ext.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    from app.core.database import get_db
    if os.path.exists("./test_doc_ext.db"):
        os.remove("./test_doc_ext.db")
    Base.metadata.create_all(bind=engine)
    
    def override_get_db():
        try:
            db = TestingSessionLocal()
            yield db
        finally:
            db.close()
            
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    if os.path.exists("./test_doc_ext.db"):
        try:
            os.remove("./test_doc_ext.db")
        except:
            pass

@pytest.fixture
def db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture
def patient_client():
    from app.core.security import create_access_token
    client = TestClient(app)
    db = TestingSessionLocal()
    case_id = str(uuid.uuid4())
    case = ClinicalCase(caseId=case_id, patientId="test-patient-id", status="intake", consentGranted=True, createdAt=datetime.now(timezone.utc), updatedAt=datetime.now(timezone.utc))
    db.add(case)
    db.commit()
    db.close()
    
    token = create_access_token(data={"role": "patient", "case_id": case_id})
    client.headers.update({"Authorization": f"Bearer {token}"})
    client.case_id = case_id
    return client


def test_document_extraction_unsupported_pdf(db: Session, patient_client: TestClient):
    patient_case = patient_client.case_id
    doc_id = str(uuid.uuid4())
    db_doc = PatientDocument(
        id=doc_id,
        caseId=patient_case,
        filename="test.pdf",
        storagePath="uploads/test.pdf",
        mimeType="application/pdf",
        sizeBytes=1000,
        createdAt=datetime.now(timezone.utc),
        extractionStatus="pending"
    )
    db.add(db_doc)
    db.commit()

    res = patient_client.post(f"/api/v1/cases/{patient_case}/documents/{doc_id}/extract")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == doc_id
    assert data["extractionStatus"] == "unsupported"

@patch("app.services.document_extraction.get_image_base64")
@patch("app.services.document_extraction.Groq")
def test_document_extraction_supported_image(MockGroq, mock_get_base64, db: Session, patient_client: TestClient):
    patient_case = patient_client.case_id
    doc_id = str(uuid.uuid4())
    db_doc = PatientDocument(
        id=doc_id,
        caseId=patient_case,
        filename="test.png",
        storagePath="uploads/test.png",
        mimeType="image/png",
        sizeBytes=1000,
        createdAt=datetime.now(timezone.utc),
        extractionStatus="pending"
    )
    db.add(db_doc)
    db.commit()

    mock_get_base64.return_value = "fake_base64_data"
    
    # Setup mock Groq response
    mock_client_instance = MagicMock()
    MockGroq.return_value = mock_client_instance
    mock_response = MagicMock()
    mock_response.choices[0].message.content = '{"sourceReference": "' + doc_id + '", "medications": [], "diagnoses": ["Hypertension"], "investigations": [], "procedures": [], "clinicallyRelevantDates": [], "summary": "Test Summary"}'
    mock_client_instance.chat.completions.create.return_value = mock_response

    res = patient_client.post(f"/api/v1/cases/{patient_case}/documents/{doc_id}/extract")
    assert res.status_code == 200
    data = res.json()
    assert data["extractionStatus"] == "completed"
    assert data["extractedText"] == "Test Summary"
    assert data["medicalEntities"]["diagnoses"] == ["Hypertension"]
    assert data["medicalEntities"]["sourceReference"] == doc_id

@patch("app.services.document_extraction.get_image_base64")
@patch("app.services.document_extraction.Groq")
def test_document_extraction_malformed_json(MockGroq, mock_get_base64, db: Session, patient_client: TestClient):
    patient_case = patient_client.case_id
    doc_id = str(uuid.uuid4())
    db_doc = PatientDocument(
        id=doc_id,
        caseId=patient_case,
        filename="test2.png",
        storagePath="uploads/test2.png",
        mimeType="image/png",
        sizeBytes=1000,
        createdAt=datetime.now(timezone.utc),
        extractionStatus="pending"
    )
    db.add(db_doc)
    db.commit()

    mock_get_base64.return_value = "fake_base64_data"
    mock_client_instance = MagicMock()
    MockGroq.return_value = mock_client_instance
    mock_response = MagicMock()
    # Missing required sourceReference field in the response causes validation error
    mock_response.choices[0].message.content = '{"diagnoses": ["Hypertension"]}'
    mock_client_instance.chat.completions.create.return_value = mock_response

    res = patient_client.post(f"/api/v1/cases/{patient_case}/documents/{doc_id}/extract")
    assert res.status_code == 200
    data = res.json()
    assert data["extractionStatus"] == "failed"

def test_document_extraction_authorization_denied(db: Session, patient_client: TestClient):
    other_case_id = str(uuid.uuid4())
    res = patient_client.post(f"/api/v1/cases/{other_case_id}/documents/some-doc-id/extract")
    assert res.status_code == 403

def test_extraction_schema():
    entity = document_extraction.ExtractedMedicalEntities(
        sourceReference="doc_id_123"
    )
    assert entity.sourceReference == "doc_id_123"
    assert entity.medications == []
