import pytest
from fastapi.testclient import TestClient
from app.main import app
import os
from app.models.base import Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

client = TestClient(app)

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_privacy.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    from app.core.database import get_db
    from app.models.user import User, TokenBlocklist
    from app.models.case import ClinicalCase
    from app.models.event import UnifiedClinicalEvent
    from app.models.document import PatientDocument

    if os.path.exists("./test_privacy.db"):
        try:
            os.remove("./test_privacy.db")
        except Exception:
            pass

    Base.metadata.create_all(bind=engine)

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    yield

    Base.metadata.drop_all(bind=engine)
    if os.path.exists("./test_privacy.db"):
        try:
            os.remove("./test_privacy.db")
        except Exception:
            pass


def test_second_patient_cannot_access_first_patient_data():
    # 1. Patient 1 creates a case with sensitive symptoms
    res1 = client.post(
        "/api/v1/cases",
        json={
            "patientId": "patient-alice-private",
            "consentGranted": True,
            "intakeAnswers": {"chief_complaint": "Severe acute chest pain radiating to left arm"},
        },
    )
    assert res1.status_code == 201
    data1 = res1.json()
    case1_id = data1["case"]["caseId"]
    token1 = data1["token"]

    # 2. Patient 2 creates a separate case
    res2 = client.post(
        "/api/v1/cases",
        json={
            "patientId": "patient-bob-separate",
            "consentGranted": True,
            "intakeAnswers": {"chief_complaint": "Mild seasonal allergic rhinitis"},
        },
    )
    assert res2.status_code == 201
    data2 = res2.json()
    case2_id = data2["case"]["caseId"]
    token2 = data2["token"]

    # 3. Patient 2 attempts to read Patient 1's case -> MUST be 403
    res_snoop_case = client.get(
        f"/api/v1/cases/{case1_id}",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res_snoop_case.status_code == 403
    assert "Not authorized" in res_snoop_case.json()["detail"]

    # 4. Patient 2 attempts to read Patient 1's adaptive intake state -> MUST be 403
    res_snoop_intake = client.get(
        f"/api/v1/cases/{case1_id}/adaptive-intake",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res_snoop_intake.status_code == 403

    # 5. Patient 2 attempts to list Patient 1's documents -> MUST be 403
    res_snoop_docs = client.get(
        f"/api/v1/cases/{case1_id}/documents",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res_snoop_docs.status_code == 403

    # 6. Patient 2 attempts to update Patient 1's case -> MUST be 403
    res_snoop_update = client.put(
        f"/api/v1/cases/{case1_id}",
        headers={"Authorization": f"Bearer {token2}"},
        json={"intakeAnswers": {"malicious_tamper": "hacked"}},
    )
    assert res_snoop_update.status_code == 403

    # 7. Patient 2 attempts to link Patient 1's case to ABDM -> MUST be 403
    res_snoop_abdm = client.post(
        "/api/v1/abdm/link-context",
        headers={"Authorization": f"Bearer {token2}"},
        json={"abhaId": "bob-abha-9999", "caseId": case1_id},
    )
    assert res_snoop_abdm.status_code == 403

    # 8. Patient 2 attempts to inspect Patient 1's audit log -> MUST be 403
    res_snoop_audit = client.get(
        f"/api/v1/cases/{case1_id}/audit",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res_snoop_audit.status_code == 403

    # 9. Test Shared Device Cleanup: Patient 1 logs out
    res_logout = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert res_logout.status_code == 200

    # 10. Once logged out, Token 1 is blocked and cannot be reused
    res_reused = client.get(
        f"/api/v1/cases/{case1_id}",
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert res_reused.status_code == 401
