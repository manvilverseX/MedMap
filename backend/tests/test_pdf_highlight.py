import os
import tempfile
import unittest
from datetime import datetime, timezone
import pymupdf
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import SessionLocal, get_db
from app.core.security import create_access_token
from app.models.case import ClinicalCase
from app.models.document import PatientDocument


class PdfHighlightTests(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        def override_get_db():
            yield self.db
        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

        now = datetime.now(timezone.utc)
        self.case = ClinicalCase(
            caseId="case-highlight-test",
            patientId="patient-hl-1",
            status="doctor_review",
            consentGranted=True,
            createdAt=now,
            updatedAt=now,
        )
        self.other_case = ClinicalCase(
            caseId="case-highlight-other",
            patientId="patient-hl-2",
            status="doctor_review",
            consentGranted=True,
            createdAt=now,
            updatedAt=now,
        )
        self.db.merge(self.case)
        self.db.merge(self.other_case)

        # 1. Text PDF fixture
        doc_pdf = pymupdf.open()
        p1 = doc_pdf.new_page(width=612, height=792)
        p1.insert_text((50, 100), "Prescription Record")
        p1.insert_text((50, 140), "Metformin 500 mg twice daily")
        p1.insert_text((50, 180), "Atorvastatin - 10 mg once daily")
        
        p2 = doc_pdf.new_page(width=612, height=792)
        p2.insert_text((50, 100), "Laboratory Investigations")
        p2.insert_text((50, 140), "HbA1c: 7.2 %")

        self.temp_text_pdf = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        self.temp_text_pdf.close()
        doc_pdf.save(self.temp_text_pdf.name)
        doc_pdf.close()

        self.doc_text = PatientDocument(
            id="doc-hl-text",
            caseId=self.case.caseId,
            filename="medical_record.pdf",
            mimeType="application/pdf",
            storagePath=self.temp_text_pdf.name,
            sizeBytes=os.path.getsize(self.temp_text_pdf.name),
            createdAt=now,
        )
        self.db.merge(self.doc_text)

        # 2. Scanned / image-only PDF fixture (no text layer)
        doc_scanned = pymupdf.open()
        doc_scanned.new_page(width=612, height=792)
        self.temp_scanned_pdf = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        self.temp_scanned_pdf.close()
        doc_scanned.save(self.temp_scanned_pdf.name)
        doc_scanned.close()

        self.doc_scanned = PatientDocument(
            id="doc-hl-scanned",
            caseId=self.case.caseId,
            filename="scanned_report.pdf",
            mimeType="application/pdf",
            storagePath=self.temp_scanned_pdf.name,
            sizeBytes=os.path.getsize(self.temp_scanned_pdf.name),
            createdAt=now,
        )
        self.db.merge(self.doc_scanned)

        # 3. Image document fixture
        self.doc_image = PatientDocument(
            id="doc-hl-img",
            caseId=self.case.caseId,
            filename="photo.jpg",
            mimeType="image/jpeg",
            storagePath="/tmp/photo.jpg",
            sizeBytes=500,
            createdAt=now,
        )
        self.db.merge(self.doc_image)

        self.db.commit()

        self.doctor_token = create_access_token({"role": "doctor", "sub": "dr_smith"})
        self.patient_token = create_access_token({"role": "patient", "case_id": self.case.caseId})

    def tearDown(self):
        try:
            if os.path.exists(self.temp_text_pdf.name):
                os.remove(self.temp_text_pdf.name)
            if os.path.exists(self.temp_scanned_pdf.name):
                os.remove(self.temp_scanned_pdf.name)
        except Exception:
            pass

        self.db.query(PatientDocument).filter(
            PatientDocument.id.in_(["doc-hl-text", "doc-hl-scanned", "doc-hl-img"])
        ).delete()
        self.db.query(ClinicalCase).filter(
            ClinicalCase.caseId.in_([self.case.caseId, self.other_case.caseId])
        ).delete()
        self.db.commit()
        self.db.close()
        app.dependency_overrides.pop(get_db, None)

    def test_access_control(self):
        # 1. Unauthenticated -> 401
        res = self.client.get(f"/api/v1/cases/{self.case.caseId}/documents/{self.doc_text.id}/highlight")
        self.assertEqual(res.status_code, 401)

        # 2. Patient role -> 403 (Doctor only)
        res = self.client.get(
            f"/api/v1/cases/{self.case.caseId}/documents/{self.doc_text.id}/highlight",
            headers={"Authorization": f"Bearer {self.patient_token}"},
        )
        self.assertEqual(res.status_code, 403)

        # 3. Mismatched case -> 404
        res = self.client.get(
            f"/api/v1/cases/{self.other_case.caseId}/documents/{self.doc_text.id}/highlight",
            headers={"Authorization": f"Bearer {self.doctor_token}"},
        )
        self.assertEqual(res.status_code, 404)

    def test_exact_match(self):
        res = self.client.get(
            f"/api/v1/cases/{self.case.caseId}/documents/{self.doc_text.id}/highlight?snippet=Metformin%20500%20mg",
            headers={"Authorization": f"Bearer {self.doctor_token}"},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["page"], 1)
        self.assertEqual(data["matchType"], "exact")
        self.assertGreater(len(data["rects"]), 0)
        self.assertGreater(data["pageWidth"], 0)

    def test_hyphenated_and_whitespace_variant_match(self):
        # Snippet without hyphen should match "Atorvastatin - 10 mg"
        res = self.client.get(
            f"/api/v1/cases/{self.case.caseId}/documents/{self.doc_text.id}/highlight?snippet=Atorvastatin%2010%20mg",
            headers={"Authorization": f"Bearer {self.doctor_token}"},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["page"], 1)
        self.assertIn(data["matchType"], ["exact", "fuzzy"])
        self.assertGreater(len(data["rects"]), 0)

    def test_fuzzy_match_on_page_2(self):
        # Snippet with extra boilerplate text: "Laboratory investigation result: HbA1c — 7.2 % — normal"
        res = self.client.get(
            f"/api/v1/cases/{self.case.caseId}/documents/{self.doc_text.id}/highlight?snippet=Laboratory%20investigation%20result:%20HbA1c%207.2%20percent",
            headers={"Authorization": f"Bearer {self.doctor_token}"},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["page"], 2)
        self.assertIn(data["matchType"], ["exact", "fuzzy"])
        self.assertGreater(len(data["rects"]), 0)

    def test_no_match_returns_none(self):
        res = self.client.get(
            f"/api/v1/cases/{self.case.caseId}/documents/{self.doc_text.id}/highlight?snippet=Unrelated%20Antibiotic%20Amoxicillin%20875mg",
            headers={"Authorization": f"Bearer {self.doctor_token}"},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["matchType"], "none")
        self.assertEqual(len(data["rects"]), 0)

    def test_scanned_pdf_returns_page_only(self):
        res = self.client.get(
            f"/api/v1/cases/{self.case.caseId}/documents/{self.doc_scanned.id}/highlight?snippet=Some%20Diagnosis&page=1",
            headers={"Authorization": f"Bearer {self.doctor_token}"},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["matchType"], "page_only")
        self.assertEqual(len(data["rects"]), 0)

    def test_image_document_returns_page_only(self):
        res = self.client.get(
            f"/api/v1/cases/{self.case.caseId}/documents/{self.doc_image.id}/highlight?snippet=XRay",
            headers={"Authorization": f"Bearer {self.doctor_token}"},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["matchType"], "page_only")
