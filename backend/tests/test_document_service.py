import os
import unittest
import io
from unittest.mock import patch, MagicMock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import UploadFile, HTTPException, Header

from app.models.base import Base
from app.models.case import ClinicalCase
from app.models.document import PatientDocument
from app.services.document_service import upload_document
from datetime import datetime, timezone

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class DocumentServiceBlobTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(bind=engine)
        self.db = TestingSessionLocal()
        
        case = ClinicalCase(
            caseId="CASE-test-1",
            patientId="pat-1",
            status="intake",
            createdAt=datetime.now(timezone.utc),
            updatedAt=datetime.now(timezone.utc)
        )
        self.db.add(case)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=engine)
        if os.path.exists("uploads"):
            for f in os.listdir("uploads"):
                os.remove(os.path.join("uploads", f))

    @patch("app.services.document_service.os.getenv")
    def test_local_fallback_upload(self, mock_getenv):
        mock_getenv.return_value = None
        file_content = b"fake pdf content"
        file = UploadFile(filename="test.pdf", file=io.BytesIO(file_content), headers={"content-type": "application/pdf"})
        
        doc_response = upload_document(self.db, "CASE-test-1", file)
        
        doc = self.db.query(PatientDocument).filter_by(id=doc_response.id).first()
        self.assertEqual(doc.filename, "test.pdf")
        self.assertEqual(doc.sizeBytes, len(file_content))
        self.assertEqual(doc.mimeType, "application/pdf")
        self.assertIn("uploads", doc.storagePath)

    @patch("app.services.document_service.requests.put")
    @patch("app.services.document_service.os.getenv")
    def test_blob_upload_success(self, mock_getenv, mock_put):
        mock_getenv.return_value = "fake_token"
        
        file_content = b"fake image content"
        file = UploadFile(filename="test.png", file=io.BytesIO(file_content), headers={"content-type": "image/png"})
        
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"url": "https://blob.vercel-storage.com/private/test.png"}
        mock_put.return_value = mock_resp
        
        doc_response = upload_document(self.db, "CASE-test-1", file)
        
        doc = self.db.query(PatientDocument).filter_by(id=doc_response.id).first()
        self.assertEqual(doc.filename, "test.png")
        self.assertEqual(doc.sizeBytes, len(file_content))
        self.assertEqual(doc.storagePath, "https://blob.vercel-storage.com/private/test.png")
        
        mock_put.assert_called_once()
        args, kwargs = mock_put.call_args
        self.assertEqual(args[0], "https://vercel.com/api/blob")
        self.assertEqual(kwargs["headers"]["x-vercel-blob-access"], "private")
        self.assertEqual(kwargs["headers"]["authorization"], "Bearer fake_token")
        self.assertEqual(kwargs["headers"]["x-content-type"], "image/png")
        self.assertEqual(kwargs["data"], b"fake image content")
        self.assertIn("pathname", kwargs["params"])

    @patch("app.services.document_service.requests.put")
    @patch("app.services.document_service.os.getenv")
    def test_blob_upload_failure(self, mock_getenv, mock_put):
        mock_getenv.return_value = "fake_token"
        
        file_content = b"fake image content"
        file = UploadFile(filename="test.jpg", file=io.BytesIO(file_content), headers={"content-type": "image/jpeg"})
        
        mock_put.side_effect = Exception("Upload failed")
        
        with self.assertRaises(HTTPException) as context:
            upload_document(self.db, "CASE-test-1", file)
        
        self.assertEqual(context.exception.status_code, 500)
