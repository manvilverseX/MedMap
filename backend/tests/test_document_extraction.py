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

@patch("app.services.document_extraction.get_image_slices_base64")
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

    mock_get_base64.return_value = ["fake_base64_data_1", "fake_base64_data_2", "fake_base64_data_3"]

    # Setup mock Groq response
    mock_client_instance = MagicMock()
    MockGroq.return_value = mock_client_instance

    mock_response1 = MagicMock()
    mock_response1.choices[0].message.content = '{"sourceReference": "' + doc_id + '", "medications": [{"name": "Aspirin"}], "diagnoses": ["Hypertension"], "investigations": [{"testName": "Hb", "value": "12"}], "procedures": [], "clinicallyRelevantDates": [], "summary": "Test Summary 1"}'

    mock_response2 = MagicMock()
    mock_response2.choices[0].message.content = '{"sourceReference": "' + doc_id + '", "medications": [{"name": "Aspirin"}], "diagnoses": ["Diabetes"], "investigations": [{"testName": "Hb", "value": "12"}, {"testName": "WBC", "value": "5"}], "procedures": [], "clinicallyRelevantDates": [], "summary": "Test Summary 2"}'

    mock_response3 = MagicMock()
    mock_response3.choices[0].message.content = '{"sourceReference": "' + doc_id + '", "medications": [{"name": "Lisinopril"}], "diagnoses": ["Hypertension"], "investigations": [], "procedures": [], "clinicallyRelevantDates": [], "summary": "Test Summary 3"}'

    mock_client_instance.chat.completions.create.side_effect = [mock_response1, mock_response2, mock_response3]

    res = patient_client.post(f"/api/v1/cases/{patient_case}/documents/{doc_id}/extract")
    assert res.status_code == 200
    data = res.json()
    assert data["extractionStatus"] == "completed"
    assert data["extractedText"] == "Test Summary 1 Test Summary 2 Test Summary 3"

    # Verify exact deduplication of simple strings
    diagnoses = data["medicalEntities"]["diagnoses"]
    assert len(diagnoses) == 2
    assert "Hypertension" in diagnoses
    assert "Diabetes" in diagnoses

    # Verify exact deduplication of models
    medications = data["medicalEntities"]["medications"]
    assert len(medications) == 2
    assert any(m["name"] == "Aspirin" for m in medications)
    assert any(m["name"] == "Lisinopril" for m in medications)

    investigations = data["medicalEntities"]["investigations"]
    assert len(investigations) == 2
    assert any(inv["testName"] == "Hb" for inv in investigations)
    assert any(inv["testName"] == "WBC" for inv in investigations)

    assert data["medicalEntities"]["sourceReference"] == doc_id

    # Verify max_tokens is passed
    mock_create = mock_client_instance.chat.completions.create
    assert mock_create.call_count == 3
    assert mock_create.call_args_list[0][1].get("max_tokens") == 330

@patch("app.services.document_extraction.get_image_slices_base64")
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

    mock_get_base64.return_value = ["fake_base64_data_1", "fake_base64_data_2", "fake_base64_data_3"]
    mock_client_instance = MagicMock()
    MockGroq.return_value = mock_client_instance
    mock_response1 = MagicMock()
    # Missing required sourceReference field in the response causes validation error
    mock_response1.choices[0].message.content = '{"diagnoses": ["Hypertension"]}'
    mock_client_instance.chat.completions.create.return_value = mock_response1

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

@patch("os.getenv")
@patch("urllib.request.Request")
@patch("urllib.request.urlopen")
def test_internal_blob_proxy_logic(mock_urlopen, mock_request, mock_getenv):
    from app.services.document_extraction import get_image_slices_base64

    # Mock urlopen to return empty bytes
    mock_response = MagicMock()
    mock_response.read.return_value = b""
    mock_urlopen.return_value.__enter__.return_value = mock_response

    # Test proxying through internal API when env vars are set
    def mock_getenv_side_effect(key, default=None):
        if key == "VERCEL_URL":
            return "my-vercel-project.vercel.app"
        if key == "SECRET_KEY":
            return "my-secret-key"
        return default

    mock_getenv.side_effect = mock_getenv_side_effect

    # Since get_image_slices_base64 tries to parse as Image, it will fail on empty bytes
    # We only care that the network logic executes correctly
    get_image_slices_base64("https://test.blob.vercel-storage.com/test.png")

    # Assert it called the correct internal proxy URL and set the x-internal-auth header
    args = mock_request.call_args[0]
    headers = mock_request.call_args[1]["headers"]

    internal_endpoint = args[0]
    assert internal_endpoint.startswith("https://my-vercel-project.vercel.app/api/blob-read")
    assert headers.get("x-internal-auth") == "my-secret-key"
    assert "Authorization" not in headers

def test_real_pillow_slicing(tmp_path):
    from app.services.document_extraction import get_image_slices_base64
    from PIL import Image
    import io, base64

    # Create a dummy image 100x300
    image = Image.new("RGB", (100, 300), color="red")

    # Save it to a temporary file
    test_image_path = tmp_path / "test_image.jpg"
    image.save(test_image_path, format="JPEG")

    # Pass its actual path
    slices_b64 = get_image_slices_base64(str(test_image_path))

    assert slices_b64 is not None
    assert len(slices_b64) == 3

    for idx, b64_str in enumerate(slices_b64):
        # Verify valid base64
        decoded_bytes = base64.b64decode(b64_str)
        # Verify it can be reopened by Pillow
        slice_img = Image.open(io.BytesIO(decoded_bytes))
        slice_img.verify()

        # Verify non-zero dimensions
        assert slice_img.size[0] > 0
        assert slice_img.size[1] > 0

def test_pillow_exif_orientation(tmp_path):
    from app.services.document_extraction import get_image_slices_base64
    from PIL import Image
    from unittest.mock import patch

    # Create an image
    image = Image.new("RGB", (300, 100), color="blue")
    test_image_path = tmp_path / "test_exif.jpg"
    image.save(test_image_path, format="JPEG")

    with patch("PIL.ImageOps.exif_transpose") as mock_transpose:
        # Mock transpose to just return the image unchanged
        mock_transpose.side_effect = lambda img: img
        get_image_slices_base64(str(test_image_path))

        # Verify it was called
        mock_transpose.assert_called_once()
