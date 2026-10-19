import os
import shutil
import unittest
import io
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import UploadFile, HTTPException

from app.models.base import Base
from app.models.case import ClinicalCase
from app.models.document import PatientDocument
from app.services.document_service import upload_document, get_documents
from datetime import datetime, timezone
import time

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class DocumentTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(bind=engine)
        self.db = TestingSessionLocal()
        
        # Create dummy case
        case = ClinicalCase(
            caseId="test-case",
            patientId="pat-1",
            status="intake",
            createdAt=datetime.now(timezone.utc),
            updatedAt=datetime.now(timezone.utc)
        )
        self.db.add(case)
        self.db.commit()
        
        if os.path.exists("uploads"):
            shutil.rmtree("uploads")
        os.makedirs("uploads", exist_ok=True)
        
    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=engine)
        if os.path.exists("uploads"):
            shutil.rmtree("uploads")

    def create_upload_file(self, filename, content, content_type):
        return UploadFile(filename=filename, file=io.BytesIO(content), headers={"content-type": content_type})

    def test_upload_success(self):
        file_content = b"fake pdf"
        file = self.create_upload_file("test.pdf", file_content, "application/pdf")
        
        response = upload_document(self.db, "test-case", file)
        
        self.assertEqual(response.filename, "test.pdf")
        self.assertEqual(response.mimeType, "application/pdf")
        self.assertEqual(response.sizeBytes, len(file_content))
        self.assertEqual(response.caseId, "test-case")
        
        doc = self.db.query(PatientDocument).filter_by(id=response.id).first()
        self.assertIsNotNone(doc)
        self.assertTrue(os.path.exists(doc.storagePath))

    def test_upload_missing_case(self):
        file_content = b"fake pdf"
        file = self.create_upload_file("test.pdf", file_content, "application/pdf")
        
        with self.assertRaises(Exception) as context:
            upload_document(self.db, "missing", file)
        self.assertEqual(context.exception.status_code, 404)

    def test_upload_unsupported_file_type(self):
        file_content = b"fake script"
        file = self.create_upload_file("test.sh", file_content, "application/x-sh")
        
        with self.assertRaises(Exception) as context:
            upload_document(self.db, "test-case", file)
        self.assertEqual(context.exception.status_code, 400)
        self.assertIn("Unsupported file format", context.exception.detail)

    def test_upload_oversized_file(self):
        file_content = b"12345678901"
        file = self.create_upload_file("test.pdf", file_content, "application/pdf")
        
        with patch("app.services.document_service.MAX_SIZE", 10):
            with self.assertRaises(Exception) as context:
                upload_document(self.db, "test-case", file)
            self.assertEqual(context.exception.status_code, 400)
            self.assertIn("File too large", context.exception.detail)
            self.assertEqual(len(os.listdir("uploads")), 0)
            
    def test_db_failure_cleans_up_file(self):
        file_content = b"fake pdf"
        file = self.create_upload_file("test.pdf", file_content, "application/pdf")
        
        def mock_commit():
            raise Exception("DB Error")
            
        with patch.object(self.db, "commit", side_effect=mock_commit):
            with self.assertRaises(Exception):
                upload_document(self.db, "test-case", file)
                
            self.assertEqual(len(os.listdir("uploads")), 0)

    def test_get_documents(self):
        file_content1 = b"fake pdf 1"
        file1 = self.create_upload_file("test1.pdf", file_content1, "application/pdf")
        upload_document(self.db, "test-case", file1)
        
        time.sleep(0.01)
        
        file_content2 = b"fake pdf 2"
        file2 = self.create_upload_file("test2.pdf", file_content2, "application/pdf")
        upload_document(self.db, "test-case", file2)
        
        docs = get_documents(self.db, "test-case")
        self.assertEqual(len(docs), 2)
        self.assertEqual(docs[0].filename, "test2.pdf") # desc order
        self.assertEqual(docs[1].filename, "test1.pdf")
        
        docs_empty = get_documents(self.db, "missing-case")
        self.assertEqual(len(docs_empty), 0)

    def test_save_document_metadata_success(self):
        class DummyMetadata:
            url = "https://blob.vercel-storage.com/test.pdf"
            pathname = "test.pdf"
            filename = "original.pdf"
            mimeType = "application/pdf"
            sizeBytes = 1234
            
        from app.services.document_service import save_document_metadata
        response = save_document_metadata(self.db, "test-case", DummyMetadata())
        
        self.assertEqual(response.filename, "original.pdf")
        self.assertEqual(response.mimeType, "application/pdf")
        self.assertEqual(response.sizeBytes, 1234)
        
        doc = self.db.query(PatientDocument).filter_by(id=response.id).first()
        self.assertIsNotNone(doc)
        self.assertEqual(doc.storagePath, "https://blob.vercel-storage.com/test.pdf")

    def test_get_document_file_endpoint_local(self):
        from fastapi.testclient import TestClient
        from app.main import app
        from app.core.database import get_db
        from app.core.security import create_access_token

        def override_get_db():
            try:
                yield self.db
            finally:
                pass

        app.dependency_overrides[get_db] = override_get_db
        client = TestClient(app)

        file_content = b"pdf-for-download"
        file = self.create_upload_file("download.pdf", file_content, "application/pdf")
        upload_res = upload_document(self.db, "test-case", file)

        patient_token = create_access_token({"role": "patient", "case_id": "test-case"})
        doctor_token = create_access_token({"role": "doctor", "sub": "dr_smith"})
        other_token = create_access_token({"role": "patient", "case_id": "other-case"})

        # 1. Patient with header auth can download
        resp = client.get(
            f"/api/v1/cases/test-case/documents/{upload_res.id}/file",
            headers={"Authorization": f"Bearer {patient_token}"}
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.content, file_content)

        # 2. Patient with query param token can download
        resp = client.get(
            f"/api/v1/cases/test-case/documents/{upload_res.id}/file?token={patient_token}"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.content, file_content)

        # 3. Doctor can download
        resp = client.get(
            f"/api/v1/cases/test-case/documents/{upload_res.id}/file",
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.content, file_content)

        # 4. Other patient is forbidden
        resp = client.get(
            f"/api/v1/cases/test-case/documents/{upload_res.id}/file",
            headers={"Authorization": f"Bearer {other_token}"}
        )
        self.assertEqual(resp.status_code, 403)

        # 5. Missing token is 401
        resp = client.get(f"/api/v1/cases/test-case/documents/{upload_res.id}/file")
        self.assertEqual(resp.status_code, 401)

        app.dependency_overrides.pop(get_db, None)
