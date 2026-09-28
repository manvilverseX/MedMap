import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.case import ClinicalCase  # noqa: F401 - registers the model metadata
from app.schemas.case import CaseCreate, CaseResponse, CaseUpdate
from app.services import case_service


class CaseSchemaTests(unittest.TestCase):
    def test_all_supported_update_statuses_are_accepted(self):
        for status in ("intake", "patient_verifying", "doctor_review", "completed"):
            with self.subTest(status=status):
                self.assertEqual(CaseUpdate(status=status).status.value, status)

    def test_unknown_update_status_is_rejected(self):
        with self.assertRaises(ValidationError):
            CaseUpdate(status="banana")

    def test_null_update_status_is_rejected(self):
        with self.assertRaises(ValidationError):
            CaseUpdate(status=None)

    def test_null_update_consent_is_rejected(self):
        with self.assertRaises(ValidationError):
            CaseUpdate(consentGranted=None)

    def test_omitted_update_fields_are_accepted(self):
        self.assertEqual(CaseUpdate().model_dump(exclude_unset=True), {})

    def test_valid_intake_answers_are_accepted(self):
        answers = {
            "chiefComplaint": "Headache",
            "duration": "2 days",
        }
        self.assertEqual(CaseUpdate(intakeAnswers=answers).intakeAnswers, answers)

    def test_null_intake_answers_are_accepted(self):
        self.assertIsNone(CaseUpdate(intakeAnswers=None).intakeAnswers)

    def test_valid_clinical_assessment_is_accepted(self):
        assessment = {
            "diagnosis": "Migraine",
            "followUpNeeded": True,
            "medications": ["Ibuprofen"],
            "details": {
                "severity": "moderate"
            }
        }
        self.assertEqual(CaseUpdate(clinicalAssessment=assessment).clinicalAssessment, assessment)

    def test_reviewer_id_is_accepted(self):
        self.assertEqual(CaseUpdate(reviewerId="doc-1").reviewerId, "doc-1")

    def test_invalid_intake_answer_shapes_are_rejected(self):
        invalid_values = (
            ["Headache"],
            {"chiefComplaint": {"value": "Headache"}},
            {"duration": 2},
        )
        for value in invalid_values:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                CaseUpdate(intakeAnswers=value)

    def test_null_language_is_accepted(self):
        self.assertEqual(
            CaseUpdate(language=None).model_dump(exclude_unset=True),
            {"language": None},
        )

    def test_omitted_create_consent_defaults_to_false(self):
        self.assertFalse(CaseCreate(patientId="patient-1").consentGranted)

    def test_null_create_consent_is_rejected(self):
        with self.assertRaises(ValidationError):
            CaseCreate(patientId="patient-1", consentGranted=None)

    def test_response_accepts_current_and_legacy_statuses(self):
        now = datetime.now(timezone.utc)
        for status in ("intake", "pending"):
            with self.subTest(status=status):
                response = CaseResponse(
                    caseId="case-12345678",
                    patientId="patient-1",
                    createdAt=now,
                    updatedAt=now,
                    language=None,
                    consentGranted=False,
                    status=status,
                )
                self.assertEqual(response.model_dump(mode="json")["status"], status)


class CaseServiceTests(unittest.TestCase):
    def setUp(self):
        self._temp_dir = tempfile.TemporaryDirectory()
        database_path = Path(self._temp_dir.name) / "cases.db"
        self.engine = create_engine(f"sqlite:///{database_path}")
        self.Session = sessionmaker(bind=self.engine)
        Base.metadata.create_all(self.engine)

    def tearDown(self):
        self.engine.dispose()
        self._temp_dir.cleanup()

    def test_case_crud_and_persistence_across_sessions(self):
        with self.Session() as session:
            created = case_service.create_case(
                session,
                CaseCreate(patientId="patient-1", language="English"),
            )
            case_id = created.caseId
            self.assertEqual(created.status, "intake")
            self.assertFalse(created.consentGranted)
            self.assertIsNone(created.intakeAnswers)

        with self.Session() as session:
            retrieved = case_service.get_case(session, case_id)
            self.assertIsNotNone(retrieved)
            self.assertEqual(retrieved.patientId, "patient-1")
            self.assertEqual(retrieved.status, "intake")

            updated = case_service.update_case(
                session,
                case_id,
                CaseUpdate(
                    language="Hindi",
                    consentGranted=True,
                    status="patient_verifying",
                ),
            )
            self.assertIsNotNone(updated)
            self.assertEqual(updated.language, "Hindi")
            self.assertTrue(updated.consentGranted)
            self.assertEqual(updated.status, "patient_verifying")

        with self.Session() as session:
            persisted = case_service.get_case(session, case_id)
            self.assertIsNotNone(persisted)
            self.assertEqual(persisted.language, "Hindi")
            self.assertTrue(persisted.consentGranted)
            self.assertEqual(persisted.status, "patient_verifying")

    def test_intake_answers_persist_preserve_and_clear(self):
        answers = {
            "chiefComplaint": "Headache",
            "duration": "2 days",
        }

        with self.Session() as session:
            created = case_service.create_case(
                session,
                CaseCreate(patientId="patient-answers"),
            )
            case_id = created.caseId
            self.assertIsNone(created.intakeAnswers)

            updated = case_service.update_case(
                session,
                case_id,
                CaseUpdate(intakeAnswers=answers),
            )
            self.assertEqual(updated.intakeAnswers, answers)

            retrieved = case_service.get_case(session, case_id)
            self.assertEqual(retrieved.intakeAnswers, answers)

        with self.Session() as session:
            persisted = case_service.get_case(session, case_id)
            self.assertEqual(persisted.intakeAnswers, answers)

            language_updated = case_service.update_case(
                session,
                case_id,
                CaseUpdate(language="Hindi"),
            )
            self.assertEqual(language_updated.language, "Hindi")
            self.assertEqual(language_updated.intakeAnswers, answers)

        with self.Session() as session:
            preserved = case_service.get_case(session, case_id)
            self.assertEqual(preserved.intakeAnswers, answers)

            cleared = case_service.update_case(
                session,
                case_id,
                CaseUpdate(intakeAnswers=None),
            )
            self.assertIsNone(cleared.intakeAnswers)

        with self.Session() as session:
            self.assertIsNone(case_service.get_case(session, case_id).intakeAnswers)

    def test_clinical_assessment_persist_preserve_and_clear(self):
        assessment = {
            "diagnosis": "Migraine",
            "prescription": "Ibuprofen 400mg",
        }

        with self.Session() as session:
            created = case_service.create_case(
                session,
                CaseCreate(patientId="patient-assessment"),
            )
            case_id = created.caseId
            self.assertIsNone(created.clinicalAssessment)

            updated = case_service.update_case(
                session,
                case_id,
                CaseUpdate(clinicalAssessment=assessment, reviewerId="doc-1"),
            )
            self.assertEqual(updated.clinicalAssessment, assessment)
            self.assertEqual(updated.reviewerId, "doc-1")

            retrieved = case_service.get_case(session, case_id)
            self.assertEqual(retrieved.clinicalAssessment, assessment)
            self.assertEqual(retrieved.reviewerId, "doc-1")

        with self.Session() as session:
            persisted = case_service.get_case(session, case_id)
            self.assertEqual(persisted.clinicalAssessment, assessment)
            self.assertEqual(persisted.reviewerId, "doc-1")

            language_updated = case_service.update_case(
                session,
                case_id,
                CaseUpdate(language="Hindi"),
            )
            self.assertEqual(language_updated.language, "Hindi")
            self.assertEqual(language_updated.clinicalAssessment, assessment)
            self.assertEqual(language_updated.reviewerId, "doc-1")

        with self.Session() as session:
            preserved = case_service.get_case(session, case_id)
            self.assertEqual(preserved.clinicalAssessment, assessment)
            self.assertEqual(preserved.reviewerId, "doc-1")

            cleared = case_service.update_case(
                session,
                case_id,
                CaseUpdate(clinicalAssessment=None, reviewerId=None),
            )
            self.assertIsNone(cleared.clinicalAssessment)
            self.assertIsNone(cleared.reviewerId)

        with self.Session() as session:
            final = case_service.get_case(session, case_id)
            self.assertIsNone(final.clinicalAssessment)
            self.assertIsNone(final.reviewerId)

    def test_missing_case_returns_none(self):
        with self.Session() as session:
            self.assertIsNone(case_service.get_case(session, "missing-case"))
            self.assertIsNone(
                case_service.update_case(
                    session,
                    "missing-case",
                    CaseUpdate(language="Hindi"),
                )
            )

    def test_get_cases_empty(self):
        with self.Session() as session:
            self.assertEqual(case_service.get_cases(session), [])

    def test_get_cases_returns_all_ordered_by_newest(self):
        import time
        with self.Session() as session:
            case1 = case_service.create_case(session, CaseCreate(patientId="p1"))
            time.sleep(0.01)
            case2 = case_service.create_case(session, CaseCreate(patientId="p2"))
            
            cases = case_service.get_cases(session)
            self.assertEqual(len(cases), 2)
            self.assertEqual(cases[0].caseId, case2.caseId)
            self.assertEqual(cases[1].caseId, case1.caseId)

    def test_get_cases_with_status_filter(self):
        with self.Session() as session:
            case1 = case_service.create_case(session, CaseCreate(patientId="p1"))
            case2 = case_service.create_case(session, CaseCreate(patientId="p2"))
            case_service.update_case(session, case2.caseId, CaseUpdate(status="completed"))
            
            intake_cases = case_service.get_cases(session, status="intake")
            completed_cases = case_service.get_cases(session, status="completed")
            
            self.assertEqual(len(intake_cases), 1)
            self.assertEqual(intake_cases[0].caseId, case1.caseId)
            
            self.assertEqual(len(completed_cases), 1)
            self.assertEqual(completed_cases[0].caseId, case2.caseId)




if __name__ == "__main__":
    unittest.main()
