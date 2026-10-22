import os
import tempfile
import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import SessionLocal
from app.core.security import create_access_token
from app.models.case import ClinicalCase
from app.models.document import PatientDocument


class DocumentFileAccessTests(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        self.client = TestClient(app)

        # Create two cases
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        self.case1 = ClinicalCase(
            caseId="case-file-test-1",
            patientId="patient-file-1",
            status="intake",
            consentGranted=True,
            createdAt=now,
            updatedAt=now,
        )
        self.case2 = ClinicalCase(
            caseId="case-file-test-2",
            patientId="patient-file-2",
            status="intake",
            consentGranted=True,
            createdAt=now,
            updatedAt=now,
        )
        self.db.merge(self.case1)
        self.db.merge(self.case2)

        # Create temporary file on disk for case 1
        self.temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        self.temp_file.write(b"%PDF-1.4 test pdf content")
        self.temp_file.close()

        self.doc1 = PatientDocument(
            id="doc-file-1",
            caseId=self.case1.caseId,
            filename="lab_report.pdf",
            mimeType="application/pdf",
            storagePath=self.temp_file.name,
            sizeBytes=len(b"%PDF-1.4 test pdf content"),
            createdAt=now,
        )
        self.db.merge(self.doc1)

        # Missing file on disk
        self.doc_missing = PatientDocument(
            id="doc-file-missing",
            caseId=self.case1.caseId,
            filename="missing.pdf",
            mimeType="application/pdf",
            storagePath="/tmp/non_existent_path_12345.pdf",
            sizeBytes=100,
            createdAt=now,
        )
        self.db.merge(self.doc_missing)

        # Blob URL document
        self.doc_blob = PatientDocument(
            id="doc-file-blob",
            caseId=self.case1.caseId,
            filename="scan.png",
            mimeType="image/png",
            storagePath="https://mock.private.blob.vercel-storage.com/cases/scan.png",
            sizeBytes=50,
            createdAt=now,
        )
        self.db.merge(self.doc_blob)

        self.db.commit()

        # Tokens
        self.patient1_token = create_access_token({"role": "patient", "case_id": self.case1.caseId})
        self.patient2_token = create_access_token({"role": "patient", "case_id": self.case2.caseId})
        self.doctor_token = create_access_token({"role": "doctor", "sub": "dr_smith"})

    def tearDown(self):
        try:
            if os.path.exists(self.temp_file.name):
                os.remove(self.temp_file.name)
        except Exception:
            pass
        self.db.query(PatientDocument).filter(
            PatientDocument.id.in_(["doc-file-1", "doc-file-missing", "doc-file-blob"])
        ).delete()
        self.db.query(ClinicalCase).filter(
            ClinicalCase.caseId.in_([self.case1.caseId, self.case2.caseId])
        ).delete()
        self.db.commit()
        self.db.close()

    def test_unauthorized_access_denied(self):
        # No token
        res = self.client.get(f"/api/v1/cases/{self.case1.caseId}/documents/{self.doc1.id}/file")
        self.assertEqual(res.status_code, 401)

        # Invalid token
        res = self.client.get(
            f"/api/v1/cases/{self.case1.caseId}/documents/{self.doc1.id}/file",
            headers={"Authorization": "Bearer invalid_garbage_token"},
        )
        self.assertEqual(res.status_code, 401)

    def test_cross_patient_access_denied(self):
        # Patient 2 tries to access Patient 1's document
        res = self.client.get(
            f"/api/v1/cases/{self.case1.caseId}/documents/{self.doc1.id}/file",
            headers={"Authorization": f"Bearer {self.patient2_token}"},
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("Not authorized", res.json()["detail"])

    def test_patient_can_access_own_document_with_inline_headers(self):
        res = self.client.get(
            f"/api/v1/cases/{self.case1.caseId}/documents/{self.doc1.id}/file",
            headers={"Authorization": f"Bearer {self.patient1_token}"},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.content, b"%PDF-1.4 test pdf content")
        self.assertIn("inline", res.headers.get("content-disposition", ""))
        self.assertIn("lab_report.pdf", res.headers.get("content-disposition", ""))
        self.assertEqual(res.headers.get("content-type"), "application/pdf")

    def test_doctor_can_access_document(self):
        res = self.client.get(
            f"/api/v1/cases/{self.case1.caseId}/documents/{self.doc1.id}/file",
            headers={"Authorization": f"Bearer {self.doctor_token}"},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.content, b"%PDF-1.4 test pdf content")

    def test_missing_disk_file_returns_friendly_404(self):
        res = self.client.get(
            f"/api/v1/cases/{self.case1.caseId}/documents/{self.doc_missing.id}/file",
            headers={"Authorization": f"Bearer {self.patient1_token}"},
        )
        self.assertEqual(res.status_code, 404)
        self.assertEqual(
            res.json()["detail"],
            "This file is no longer available, ask the patient to upload again",
        )

    def test_blob_file_fetch_and_streaming(self):
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = b"\x89PNG\r\n\x1a\nfake image bytes"
        mock_response.headers.get.return_value = "image/png"

        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_urlopen.return_value.__enter__.return_value = mock_response

            res = self.client.get(
                f"/api/v1/cases/{self.case1.caseId}/documents/{self.doc_blob.id}/file",
                headers={"Authorization": f"Bearer {self.patient1_token}"},
            )
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.content, b"\x89PNG\r\n\x1a\nfake image bytes")
            self.assertIn("inline", res.headers.get("content-disposition", ""))
            self.assertIn("scan.png", res.headers.get("content-disposition", ""))

    def test_blob_fetch_failure_returns_friendly_404(self):
        with patch("urllib.request.urlopen", side_effect=Exception("Connection refused")):
            res = self.client.get(
                f"/api/v1/cases/{self.case1.caseId}/documents/{self.doc_blob.id}/file",
                headers={"Authorization": f"Bearer {self.patient1_token}"},
            )
            self.assertEqual(res.status_code, 404)
            self.assertEqual(
                res.json()["detail"],
                "This file is no longer available, ask the patient to upload again",
            )
