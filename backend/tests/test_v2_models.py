import pytest
import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.document import PatientDocument
from app.models.case import ClinicalCase
from app.models.event import UnifiedClinicalEvent
from app.models.evidence import Evidence
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.base import Base

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_v2_models.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_v1_document_category_null(db: Session):
    case_id = str(uuid.uuid4())
    case = ClinicalCase(caseId=case_id, patientId="pat1", status="intake", consentGranted=True, createdAt=datetime.now(timezone.utc), updatedAt=datetime.now(timezone.utc))
    db.add(case)
    db.commit()

    doc_id = str(uuid.uuid4())
    doc = PatientDocument(
        id=doc_id,
        caseId=case_id,
        filename="v1.pdf",
        storagePath="path",
        mimeType="application/pdf",
        sizeBytes=100,
        createdAt=datetime.now(timezone.utc)
        # documentCategory is intentionally omitted
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    
    assert doc.documentCategory is None

def test_v2_document_valid_category(db: Session):
    case_id = str(uuid.uuid4())
    case = ClinicalCase(caseId=case_id, patientId="pat2", status="intake", consentGranted=True, createdAt=datetime.now(timezone.utc), updatedAt=datetime.now(timezone.utc))
    db.add(case)
    db.commit()

    doc_id = str(uuid.uuid4())
    doc = PatientDocument(
        id=doc_id,
        caseId=case_id,
        filename="lab.pdf",
        storagePath="path",
        mimeType="application/pdf",
        sizeBytes=100,
        createdAt=datetime.now(timezone.utc),
        documentCategory="lab_report"
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    
    assert doc.documentCategory == "lab_report"

def test_clinical_event_and_evidence(db: Session):
    case_id = str(uuid.uuid4())
    case = ClinicalCase(caseId=case_id, patientId="pat3", status="intake", consentGranted=True, createdAt=datetime.now(timezone.utc), updatedAt=datetime.now(timezone.utc))
    db.add(case)
    db.commit()

    doc_id = str(uuid.uuid4())
    doc = PatientDocument(
        id=doc_id,
        caseId=case_id,
        filename="source.pdf",
        storagePath="path",
        mimeType="application/pdf",
        sizeBytes=100,
        createdAt=datetime.now(timezone.utc)
    )
    db.add(doc)
    
    event_id = str(uuid.uuid4())
    event = UnifiedClinicalEvent(
        eventId=event_id,
        caseId=case_id,
        eventType="medication",
        details={"medication": "Aspirin", "dose": "81mg"}
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    
    # 3. clinical event belongs to case
    assert event.caseId == case_id
    # 7. new records default to pending
    assert event.status == "pending"

    evidence1_id = str(uuid.uuid4())
    evidence1 = Evidence(
        evidenceId=evidence1_id,
        eventId=event_id,
        sourceType="document",
        sourceDocumentId=doc_id,
        snippet="Aspirin 81mg",
        fieldPath="medications[0].dose"
    )
    
    evidence2_id = str(uuid.uuid4())
    evidence2 = Evidence(
        evidenceId=evidence2_id,
        eventId=event_id,
        sourceType="document",
        sourceDocumentId=doc_id,
        snippet="Start Aspirin 81 mg daily",
        fieldPath="medications[0]"
    )
    
    db.add(evidence1)
    db.add(evidence2)
    db.commit()
    
    db.refresh(evidence1)
    db.refresh(evidence2)
    
    # 4. event has multiple evidence records
    evidences = db.query(Evidence).filter(Evidence.eventId == event_id).all()
    assert len(evidences) == 2
    
    # 5. evidence correctly references source document
    assert evidence1.sourceDocumentId == doc_id
    assert evidence2.sourceDocumentId == doc_id
    
    # 6. evidence stores fieldPath
    assert evidence1.fieldPath == "medications[0].dose"
    assert evidence2.fieldPath == "medications[0]"
    
    # 7. defaults to pending
    assert evidence1.verificationStatus == "pending"

def test_evidence_without_event(db: Session):
    case_id = str(uuid.uuid4())
    case = ClinicalCase(caseId=case_id, patientId="pat4", status="intake", consentGranted=True, createdAt=datetime.now(timezone.utc), updatedAt=datetime.now(timezone.utc))
    db.add(case)
    db.commit()

    doc_id = str(uuid.uuid4())
    doc = PatientDocument(
        id=doc_id,
        caseId=case_id,
        filename="standalone.pdf",
        storagePath="path",
        mimeType="application/pdf",
        sizeBytes=100,
        createdAt=datetime.now(timezone.utc)
    )
    db.add(doc)
    
    evidence_id = str(uuid.uuid4())
    evidence = Evidence(
        evidenceId=evidence_id,
        eventId=None,
        sourceType="document",
        sourceDocumentId=doc_id,
        snippet="No known allergies",
        fieldPath="allergies"
    )
    db.add(evidence)
    db.commit()
    db.refresh(evidence)
    
    assert evidence.eventId is None
    assert evidence.snippet == "No known allergies"

def test_v2_extraction_data_storage(db: Session):
    case_id = str(uuid.uuid4())
    case = ClinicalCase(caseId=case_id, patientId="pat5", status="intake", consentGranted=True, createdAt=datetime.now(timezone.utc), updatedAt=datetime.now(timezone.utc))
    db.add(case)
    db.commit()

    # V1 Document
    v1_doc_id = str(uuid.uuid4())
    v1_doc = PatientDocument(
        id=v1_doc_id,
        caseId=case_id,
        filename="v1.pdf",
        storagePath="path",
        mimeType="application/pdf",
        sizeBytes=100,
        createdAt=datetime.now(timezone.utc),
        medicalEntities={"medications": [], "diagnoses": ["Hypertension"]}
    )
    db.add(v1_doc)

    # V2 Document
    v2_doc_id = str(uuid.uuid4())
    v2_doc = PatientDocument(
        id=v2_doc_id,
        caseId=case_id,
        filename="v2_lab.pdf",
        storagePath="path",
        mimeType="application/pdf",
        sizeBytes=100,
        createdAt=datetime.now(timezone.utc),
        documentCategory="lab_report",
        v2ExtractionData={"results": [{"testName": "Hemoglobin", "result": "13.5"}]}
    )
    db.add(v2_doc)
    db.commit()

    db.refresh(v1_doc)
    db.refresh(v2_doc)

    # V1 assertions
    assert v1_doc.v2ExtractionData is None
    assert v1_doc.medicalEntities == {"medications": [], "diagnoses": ["Hypertension"]}

    # V2 assertions
    assert v2_doc.documentCategory == "lab_report"
    assert v2_doc.v2ExtractionData == {"results": [{"testName": "Hemoglobin", "result": "13.5"}]}
    assert v2_doc.medicalEntities is None
