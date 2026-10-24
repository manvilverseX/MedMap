import pytest
import os
import io
import json
import uuid
import re
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.models.base import Base
from app.models.case import ClinicalCase
from app.models.document import PatientDocument
from app.models.event import UnifiedClinicalEvent
from app.core.security import create_access_token
from app.services.document_service import upload_document
from app.services.document_extraction import process_document

TEST_DB_PATH = "./test_duplicates.db"
engine = create_engine(f"sqlite:///{TEST_DB_PATH}", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    from app.core.database import get_db
    if os.path.exists(TEST_DB_PATH):
        try:
            os.remove(TEST_DB_PATH)
        except OSError:
            pass
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    if os.path.exists(TEST_DB_PATH):
        try:
            os.remove(TEST_DB_PATH)
        except OSError:
            pass

@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()

def test_duplicate_detection_same_case_and_different_file(db):
    client = TestClient(app)
    patient_id = "patient-dup-1"
    case_id = f"case-{uuid.uuid4()}"
    case = ClinicalCase(
        caseId=case_id,
        patientId=patient_id,
        status="intake",
        consentGranted=True,
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc)
    )
    db.add(case)
    db.commit()

    token = create_access_token({"sub": patient_id, "case_id": case_id, "role": "patient"})
    headers = {"Authorization": f"Bearer {token}"}

    file_bytes_1 = b"%PDF-1.4 original blood test report content bytes"
    file_bytes_2 = b"%PDF-1.4 completely different x-ray scan content"

    # 1. Upload first file
    resp1 = client.post(
        f"/api/v1/cases/{case_id}/documents",
        headers=headers,
        files={"file": ("report1.pdf", io.BytesIO(file_bytes_1), "application/pdf")}
    )
    assert resp1.status_code == 201
    data1 = resp1.json()
    assert "v2ExtractionData" in data1
    assert data1["v2ExtractionData"]["contentHash"] is not None
    assert data1["v2ExtractionData"].get("duplicateOf") is None

    # 2. Upload identical file in same case -> MUST be flagged
    resp2 = client.post(
        f"/api/v1/cases/{case_id}/documents",
        headers=headers,
        files={"file": ("report1_copy.pdf", io.BytesIO(file_bytes_1), "application/pdf")}
    )
    assert resp2.status_code == 201
    data2 = resp2.json()
    assert data2["v2ExtractionData"].get("duplicateOf") is not None
    assert data2["v2ExtractionData"]["duplicateOf"]["documentId"] == data1["id"]
    assert data2["v2ExtractionData"]["duplicateOf"]["caseId"] == case_id

    # 3. Upload different file in same case -> NOT flagged
    resp3 = client.post(
        f"/api/v1/cases/{case_id}/documents",
        headers=headers,
        files={"file": ("report2.pdf", io.BytesIO(file_bytes_2), "application/pdf")}
    )
    assert resp3.status_code == 201
    data3 = resp3.json()
    assert data3["v2ExtractionData"].get("duplicateOf") is None

def test_same_bytes_different_patient_not_flagged(db):
    client = TestClient(app)
    # Patient A
    p_a = "patient-A"
    case_a = f"case-{uuid.uuid4()}"
    db.add(ClinicalCase(caseId=case_a, patientId=p_a, status="intake", consentGranted=True, createdAt=datetime.now(timezone.utc), updatedAt=datetime.now(timezone.utc)))
    db.commit()

    # Patient B
    p_b = "patient-B"
    case_b = f"case-{uuid.uuid4()}"
    db.add(ClinicalCase(caseId=case_b, patientId=p_b, status="intake", consentGranted=True, createdAt=datetime.now(timezone.utc), updatedAt=datetime.now(timezone.utc)))
    db.commit()

    token_a = create_access_token({"sub": p_a, "case_id": case_a, "role": "patient"})
    token_b = create_access_token({"sub": p_b, "case_id": case_b, "role": "patient"})

    common_bytes = b"Common standard form template bytes 12345678"

    # Patient A uploads
    res_a = client.post(
        f"/api/v1/cases/{case_a}/documents",
        headers={"Authorization": f"Bearer {token_a}"},
        files={"file": ("template.pdf", io.BytesIO(common_bytes), "application/pdf")}
    )
    assert res_a.status_code == 201

    # Patient B uploads identical bytes -> MUST NOT be flagged as duplicate of patient A
    res_b = client.post(
        f"/api/v1/cases/{case_b}/documents",
        headers={"Authorization": f"Bearer {token_b}"},
        files={"file": ("template.pdf", io.BytesIO(common_bytes), "application/pdf")}
    )
    assert res_b.status_code == 201
    data_b = res_b.json()
    assert data_b["v2ExtractionData"].get("duplicateOf") is None

def test_cross_case_same_patient_flagged(db):
    client = TestClient(app)
    patient_id = "patient-returning"
    case_old = f"case-{uuid.uuid4()}"
    case_new = f"case-{uuid.uuid4()}"
    db.add(ClinicalCase(caseId=case_old, patientId=patient_id, status="completed", consentGranted=True, createdAt=datetime.now(timezone.utc), updatedAt=datetime.now(timezone.utc)))
    db.add(ClinicalCase(caseId=case_new, patientId=patient_id, status="intake", consentGranted=True, createdAt=datetime.now(timezone.utc), updatedAt=datetime.now(timezone.utc)))
    db.commit()

    token_old = create_access_token({"sub": patient_id, "case_id": case_old, "role": "patient"})
    token_new = create_access_token({"sub": patient_id, "case_id": case_new, "role": "patient"})

    test_bytes = b"Patient personal lab history from last month"

    # Upload in old case
    res1 = client.post(
        f"/api/v1/cases/{case_old}/documents",
        headers={"Authorization": f"Bearer {token_old}"},
        files={"file": ("old_lab.pdf", io.BytesIO(test_bytes), "application/pdf")}
    )
    assert res1.status_code == 201
    old_doc_id = res1.json()["id"]

    # Upload in new case of same patient -> MUST be flagged with cross-case duplicateOf
    res2 = client.post(
        f"/api/v1/cases/{case_new}/documents",
        headers={"Authorization": f"Bearer {token_new}"},
        files={"file": ("re_uploaded_lab.pdf", io.BytesIO(test_bytes), "application/pdf")}
    )
    assert res2.status_code == 201
    data_new = res2.json()
    assert data_new["v2ExtractionData"].get("duplicateOf") is not None
    assert data_new["v2ExtractionData"]["duplicateOf"]["caseId"] == case_old
    assert data_new["v2ExtractionData"]["duplicateOf"]["documentId"] == old_doc_id

def test_delete_document_and_access_control(db):
    client = TestClient(app)
    patient_1 = "patient-del-1"
    patient_2 = "patient-del-2"
    case_1 = f"case-{uuid.uuid4()}"
    case_2 = f"case-{uuid.uuid4()}"
    db.add(ClinicalCase(caseId=case_1, patientId=patient_1, status="intake", consentGranted=True, createdAt=datetime.now(timezone.utc), updatedAt=datetime.now(timezone.utc)))
    db.add(ClinicalCase(caseId=case_2, patientId=patient_2, status="intake", consentGranted=True, createdAt=datetime.now(timezone.utc), updatedAt=datetime.now(timezone.utc)))
    db.commit()

    token_1 = create_access_token({"sub": patient_1, "case_id": case_1, "role": "patient"})
    token_2 = create_access_token({"sub": patient_2, "case_id": case_2, "role": "patient"})

    # Upload a document to case 1
    up = client.post(
        f"/api/v1/cases/{case_1}/documents",
        headers={"Authorization": f"Bearer {token_1}"},
        files={"file": ("to_delete.pdf", io.BytesIO(b"file to delete"), "application/pdf")}
    )
    assert up.status_code == 201
    doc_id = up.json()["id"]

    # Access control: patient 2 cannot delete patient 1's document
    res_forbidden = client.delete(
        f"/api/v1/cases/{case_1}/documents/{doc_id}",
        headers={"Authorization": f"Bearer {token_2}"}
    )
    assert res_forbidden.status_code in [403, 404]

    # Patient 1 successfully deletes own document
    res_delete = client.delete(
        f"/api/v1/cases/{case_1}/documents/{doc_id}",
        headers={"Authorization": f"Bearer {token_1}"}
    )
    assert res_delete.status_code == 200
    assert res_delete.json()["deleted"] is True

    # Verify audit event was logged
    audit = db.query(UnifiedClinicalEvent).filter(
        UnifiedClinicalEvent.caseId == case_1,
        UnifiedClinicalEvent.eventType == "document_deleted"
    ).first()
    assert audit is not None
    assert audit.details.get("documentId") == doc_id

    # Verify document is gone from DB
    doc = db.query(PatientDocument).filter(PatientDocument.id == doc_id).first()
    assert doc is None

def test_phase4_localization_and_no_leak():
    # Programmatic check for Phase 4 new patient-facing strings
    bank_path = "app/data/curated_translations_hi_kn.json"
    if not os.path.exists(bank_path):
        bank_path = "backend/app/data/curated_translations_hi_kn.json"
    with open(bank_path, "r", encoding="utf-8") as f:
        bank = json.load(f)

    frontend_strings_path = "../src/i18n/strings.ts"
    if not os.path.exists(frontend_strings_path):
        frontend_strings_path = "src/i18n/strings.ts"
    with open(frontend_strings_path, "r", encoding="utf-8") as f:
        frontend_code = f.read()

    frontend_keys = ["duplicateDocumentNotice", "duplicateDocumentKeep", "duplicateDocumentRemove"]
    for k in frontend_keys:
        assert k in frontend_code, f"{k} missing from frontend strings.ts"

    static_keys = ["This file looks the same as one you already uploaded", "Keep it", "Remove it"]
    kannada_re = re.compile(r"[\u0C80-\u0CFF]")
    devanagari_re = re.compile(r"[\u0900-\u097F]")

    for k in static_keys:
        assert k in bank, f"{k} missing in static bank"
        entry = bank[k]
        assert "hi" in entry and entry["hi"].strip(), f"Missing hi for {k}"
        assert "kn" in entry and entry["kn"].strip(), f"Missing kn for {k}"
        assert devanagari_re.search(entry["hi"]), f"Hindi translation for {k} must contain Devanagari script: {entry['hi']}"
        assert kannada_re.search(entry["kn"]), f"Kannada translation for {k} must contain Kannada script: {entry['kn']}"

