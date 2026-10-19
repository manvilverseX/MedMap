import os
import uuid
import shutil
from datetime import datetime, timezone
from passlib.context import CryptContext
from app.core.database import SessionLocal, engine
from app.models.base import Base
from app.models.user import User
from app.models.case import ClinicalCase
from app.models.document import PatientDocument

def ensure_demo_files():
    """Ensure safe, synthetic demo PDFs and image files exist in demo_documents and uploads."""
    demo_dir = os.path.join(os.path.dirname(__file__), "demo_documents")
    upload_dir = os.path.join(os.path.dirname(__file__), "uploads")
    os.makedirs(demo_dir, exist_ok=True)
    os.makedirs(upload_dir, exist_ok=True)

    def create_minimal_pdf(title: str, lines: list) -> bytes:
        content_lines = [f"BT /F1 14 Tf 50 720 Td ({title}) Tj ET"]
        y = 690
        for line in lines:
            safe_line = line.replace("(", "[").replace(")", "]")
            content_lines.append(f"BT /F1 10 Tf 50 {y} Td ({safe_line}) Tj ET")
            y -= 20
        stream_body = "\n".join(content_lines)
        stream_len = len(stream_body)
        pdf = (
            "%PDF-1.4\n"
            "1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n"
            "2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n"
            "3 0 obj <</Type /Page /Parent 2 0 R /Resources <</Font <</F1 4 0 R>>>> /MediaBox [0 0 612 792] /Contents 5 0 R>> endobj\n"
            "4 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj\n"
            f"5 0 obj <</Length {stream_len}>> stream\n{stream_body}\nendstream\nendobj\n"
            "xref\n0 1\n0000000000 65535 f\ntrailer\n<</Size 1 /Root 1 0 R>>\nstartxref\n9\n%%EOF\n"
        )
        return pdf.encode("latin-1")

    # 1. Prescription demo PDF
    rx_pdf_path = os.path.join(demo_dir, "demo_prescription.pdf")
    if not os.path.exists(rx_pdf_path):
        rx_bytes = create_minimal_pdf(
            "All India Institute of Ayurveda - Department of Medicine",
            [
                "Patient ID: P-102 | Age: 52Y | Gender: Female",
                "Date: 2026-10-15 | OPD Record #AIIA-2026-9812",
                "Rx:",
                "1. Tab Metformin 1000mg BD (with breakfast and dinner)",
                "2. Tab Atorvastatin 10mg OD (at bedtime)",
                "Advise: Low carbohydrate diabetic diet, 30 min brisk walk.",
                "Review with FBS and HbA1c in 3 months.",
            ]
        )
        with open(rx_pdf_path, "wb") as f:
            f.write(rx_bytes)

    # 2. Lab report demo PDF
    lab_pdf_path = os.path.join(demo_dir, "demo_lab_report.pdf")
    if not os.path.exists(lab_pdf_path):
        lab_bytes = create_minimal_pdf(
            "Clinical Biochemistry Laboratory - Diagnostic Report",
            [
                "Patient ID: P-102 | Referred by: Dr. AIIA OPD",
                "Collection Date: 2026-10-14 | Fasting Status: 10 hrs",
                "Test Results:",
                "- Fasting Plasma Glucose: 142 mg/dL [Reference: 70 - 99 mg/dL] HIGH",
                "- HbA1c (Glycated Hemoglobin): 7.8 % [Reference: 4.0 - 5.6 %] HIGH",
                "- Serum Creatinine: 0.9 mg/dL [Reference: 0.6 - 1.2 mg/dL] NORMAL",
                "- Total Cholesterol: 198 mg/dL [Reference: < 200 mg/dL] DESIRABLE",
            ]
        )
        with open(lab_pdf_path, "wb") as f:
            f.write(lab_bytes)

    # 3. Small demo JPEG
    jpg_path = os.path.join(demo_dir, "demo_record.jpg")
    if not os.path.exists(jpg_path):
        # 1x1 minimal valid JPEG
        minimal_jpg = bytes([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
            0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
            0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
            0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
            0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
            0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
            0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
            0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
            0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F,
            0x00, 0x7F, 0x00, 0xFF, 0xD9
        ])
        with open(jpg_path, "wb") as f:
            f.write(minimal_jpg)

    # Copy files into uploads/ for direct local serving
    for fname in ["demo_prescription.pdf", "demo_lab_report.pdf", "demo_record.jpg"]:
        src = os.path.join(demo_dir, fname)
        dst = os.path.join(upload_dir, fname)
        if os.path.exists(src) and not os.path.exists(dst):
            shutil.copy2(src, dst)

    return {
        "rx_pdf": os.path.join(upload_dir, "demo_prescription.pdf"),
        "lab_pdf": os.path.join(upload_dir, "demo_lab_report.pdf"),
        "jpg": os.path.join(upload_dir, "demo_record.jpg"),
    }

def seed_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    now = datetime.now(timezone.utc)

    # ── 1. Users (doctor, admin, patient) ──────────────────────────────────
    users_to_seed = [
        ("doctor", "password123", "doctor"),
        ("admin", "admin123", "admin"),
        ("patient", "password123", "patient"),
    ]
    for username, raw_pw, role in users_to_seed:
        existing = db.query(User).filter(User.username == username).first()
        if not existing:
            u = User(
                id=str(uuid.uuid4()),
                username=username,
                hashed_password=pwd_context.hash(raw_pw),
                role=role,
            )
            db.add(u)
        else:
            existing.hashed_password = pwd_context.hash(raw_pw)
            existing.role = role
    db.commit()

    demo_files = ensure_demo_files()

    # ── 2. Demo Case A: General Case with Chest-Pain Red Flag ──────────────
    case_cardiac = db.query(ClinicalCase).filter(ClinicalCase.caseId == "demo-cardiac-redflag").first()
    cardiac_answers = {
        "chief_complaint": "Severe crushing retrosternal chest pain radiating to left jaw and left arm for 45 minutes with cold diaphoresis and breathlessness.",
        "duration": "45 minutes, acute onset while sitting",
        "chest_pain_severity": "8 out of 10, feels like heavy tight pressure",
        "associated_symptoms": "Cold sweating, nausea, shortness of breath",
        "past_history": "Hypertension for 5 years, smoker 10 pack-years",
        "allergies": "No known drug allergies",
        "medications": "Amlodipine 5mg once daily",
        "personal_history": {
            "diet": "Non-vegetarian, high salt",
            "sleep": "6 hours nightly, disturbed",
            "habits": "Tobacco smoking (10 cigarettes/day)",
            "occupation": "Long-haul truck driver",
        },
    }
    cardiac_derived = {
        "clinicalSummary": "Acute coronary syndrome triage alert: 52-year-old male with acute severe substernal squeezing chest pain radiating to left arm/jaw, diaphoresis, and dyspnea. Critical red flag detected.",
        "patientVerification": {"verified": True, "verifiedAt": now.isoformat()},
        "medicalEntities": {
            "diagnoses": ["Suspected Acute Coronary Syndrome", "Essential Hypertension"],
            "medications": [{"name": "Amlodipine", "dose": "5mg", "frequency": "Once daily"}],
            "investigations": [],
            "procedures": [],
        },
        "doctorReviews": {},
    }
    if not case_cardiac:
        case_cardiac = ClinicalCase(
            caseId="demo-cardiac-redflag",
            patientId="patient-demo-cardiac",
            createdAt=now,
            updatedAt=now,
            language="en-IN",
            status="doctor_review",
            consentGranted=True,
            intakeAnswers=cardiac_answers,
            derivedClinicalData=cardiac_derived,
        )
        db.add(case_cardiac)
    else:
        case_cardiac.intakeAnswers = cardiac_answers
        case_cardiac.derivedClinicalData = cardiac_derived
        case_cardiac.status = "doctor_review"
    db.commit()

    # Document for Case A
    doc_cardiac_id = "doc-demo-cardiac-ecg"
    doc_cardiac = db.query(PatientDocument).filter(PatientDocument.id == doc_cardiac_id).first()
    if not doc_cardiac:
        doc_cardiac = PatientDocument(
            id=doc_cardiac_id,
            caseId="demo-cardiac-redflag",
            filename="demo_record.jpg",
            storagePath=demo_files["jpg"],
            mimeType="image/jpeg",
            sizeBytes=os.path.getsize(demo_files["jpg"]) if os.path.exists(demo_files["jpg"]) else 150,
            createdAt=now,
            extractionStatus="completed",
            documentCategory="investigation",
            extractedText="Clinical record: acute onset retrosternal chest pain with diaphoresis.",
            medicalEntities={"diagnoses": ["Suspected Acute Coronary Syndrome"], "medications": [], "investigations": []},
        )
        db.add(doc_cardiac)
    db.commit()

    # ── 3. Demo Case B: Diabetes Repeat-Visit with Longitudinal Change ─────
    case_diabetes = db.query(ClinicalCase).filter(ClinicalCase.caseId == "demo-diabetes-repeat").first()
    diabetes_answers = {
        "chief_complaint": "Routine follow-up visit for Type 2 Diabetes; mild persistent fatigue and polyuria over past month.",
        "duration": "1 month of worsening lethargy",
        "medications": "Metformin 1000mg twice daily with meals (increased from 500mg)",
        "allergies": "Sulfa drugs (skin rash)",
        "past_history": "Type 2 Diabetes for 3 years, Dyslipidemia for 2 years",
        "personal_history": {
            "diet": "Vegetarian, high refined carbohydrate intake",
            "sleep": "7 hours nightly",
            "habits": "Non-smoker, no alcohol",
            "occupation": "Accountant, sedentary work",
        },
    }
    diabetes_derived = {
        "clinicalSummary": "Longitudinal repeat visit: 54-year-old female with Type 2 Diabetes. Metformin dosage escalated from 500mg daily to 1000mg twice daily. Recent lab report shows HbA1c 7.8% (elevated) and FBS 142 mg/dL.",
        "patientVerification": {"verified": True, "verifiedAt": now.isoformat()},
        "medicalEntities": {
            "diagnoses": ["Type 2 Diabetes Mellitus", "Dyslipidemia"],
            "medications": [
                {"name": "Metformin", "dose": "1000mg", "frequency": "Twice daily with meals"},
                {"name": "Atorvastatin", "dose": "10mg", "frequency": "Once daily at bedtime"},
            ],
            "investigations": [
                {"testName": "HbA1c", "value": "7.8", "unit": "%", "referenceRange": "4.0 - 5.6"},
                {"testName": "Fasting Plasma Glucose", "value": "142", "unit": "mg/dL", "referenceRange": "70 - 99"},
                {"testName": "Serum Creatinine", "value": "0.9", "unit": "mg/dL", "referenceRange": "0.6 - 1.2"},
            ],
            "procedures": [],
        },
        "longitudinalHistory": {
            "previousEncounters": [
                {
                    "date": "2026-05-10",
                    "diagnoses": ["Type 2 Diabetes Mellitus"],
                    "medications": [{"name": "Metformin", "dose": "500mg", "frequency": "Once daily"}],
                    "notes": "Initial diagnosis. Prescribed low-dose Metformin and lifestyle counseling.",
                }
            ],
            "medicationChanges": [
                {
                    "drug": "Metformin",
                    "previousDose": "500mg OD",
                    "currentDose": "1000mg BD",
                    "action": "Escalated due to suboptimal glycemic control",
                }
            ],
        },
        "doctorReviews": {},
    }
    if not case_diabetes:
        case_diabetes = ClinicalCase(
            caseId="demo-diabetes-repeat",
            patientId="patient-demo-diabetes",
            createdAt=now,
            updatedAt=now,
            language="en-IN",
            status="doctor_review",
            consentGranted=True,
            intakeAnswers=diabetes_answers,
            derivedClinicalData=diabetes_derived,
        )
        db.add(case_diabetes)
    else:
        case_diabetes.intakeAnswers = diabetes_answers
        case_diabetes.derivedClinicalData = diabetes_derived
        case_diabetes.status = "doctor_review"
    db.commit()

    # Documents for Case B (Prescription + Lab Report)
    doc_rx_id = "doc-demo-diabetes-rx"
    doc_rx = db.query(PatientDocument).filter(PatientDocument.id == doc_rx_id).first()
    if not doc_rx:
        doc_rx = PatientDocument(
            id=doc_rx_id,
            caseId="demo-diabetes-repeat",
            filename="demo_prescription.pdf",
            storagePath=demo_files["rx_pdf"],
            mimeType="application/pdf",
            sizeBytes=os.path.getsize(demo_files["rx_pdf"]) if os.path.exists(demo_files["rx_pdf"]) else 600,
            createdAt=now,
            extractionStatus="completed",
            documentCategory="prescription",
            extractedText="Prescription: Tab Metformin 1000mg BD, Tab Atorvastatin 10mg OD. Low carb diabetic diet.",
            medicalEntities={
                "diagnoses": ["Type 2 Diabetes Mellitus"],
                "medications": [
                    {"name": "Metformin", "dose": "1000mg", "frequency": "Twice daily"},
                    {"name": "Atorvastatin", "dose": "10mg", "frequency": "Once daily"},
                ],
                "investigations": [],
            },
        )
        db.add(doc_rx)

    doc_lab_id = "doc-demo-diabetes-lab"
    doc_lab = db.query(PatientDocument).filter(PatientDocument.id == doc_lab_id).first()
    if not doc_lab:
        doc_lab = PatientDocument(
            id=doc_lab_id,
            caseId="demo-diabetes-repeat",
            filename="demo_lab_report.pdf",
            storagePath=demo_files["lab_pdf"],
            mimeType="application/pdf",
            sizeBytes=os.path.getsize(demo_files["lab_pdf"]) if os.path.exists(demo_files["lab_pdf"]) else 700,
            createdAt=now,
            extractionStatus="completed",
            documentCategory="lab_report",
            extractedText="Lab Report: Fasting Plasma Glucose 142 mg/dL. HbA1c 7.8 %. Serum Creatinine 0.9 mg/dL.",
            medicalEntities={
                "diagnoses": [],
                "medications": [],
                "investigations": [
                    {"testName": "Fasting Plasma Glucose", "value": "142", "unit": "mg/dL"},
                    {"testName": "HbA1c", "value": "7.8", "unit": "%"},
                    {"testName": "Serum Creatinine", "value": "0.9", "unit": "mg/dL"},
                ],
            },
        )
        db.add(doc_lab)
    db.commit()

    # ── 4. Demo Case C: AYUSH / Ayurveda Case (Dashavidha Pariksha) ─────────
    case_ayush = db.query(ClinicalCase).filter(ClinicalCase.caseId == "demo-ayush-history").first()
    ayush_answers = {
        "consultation_type": "ayush",
        "chief_complaint": "Severe hyperacidity, burning sensation in epigastrium and retrosternal area (Amlapitta), sour eructations and disturbed sleep for 3 months.",
        "duration": "3 months, aggravated by tea and spicy food",
        "allergies": "No known drug allergies",
        "ayush": {
            "prakriti": "Pitta-dominant: warm body temperature, punctual sharp appetite, irritability when meals delayed, light/moderate build.",
            "vikriti": "Pitta-Vata aggravation with acid reflux, heartburn, sour belching after spicy foods.",
            "sara": "Madhyama Sara (moderate tissue vitality and stamina).",
            "samhanana": "Madhyama (compact, proportionate physical build).",
            "pramana": "Sama Pramana (balanced anthropometric proportions).",
            "satmya": "Katu-Amla asatmya (poor tolerance for spicy, sour, fried foods).",
            "sattva": "Madhyama Sattva (moderate emotional resilience; easily stressed by workload).",
            "ahara_shakti": "Abhyavaharana shakti is moderate, but Jarana shakti (digestion) is impaired with hyperacidity.",
            "vyayama_shakti": "Madhyama (walks 30 minutes daily; easily fatigued in hot climate).",
            "vaya": "Madhyama Vaya (34 years old, Pitta-predominant life stage).",
            "agni": "Tikshnagni / Vishamagni (sharp but irregular digestive fire with acid reflux).",
            "koshtha": "Madhyama to Krura (occasional hard stool, irregular bowel evacuation).",
            "ahara_vihara": "Late dinner (10:30 PM), high intake of tea/coffee, sedentary desk job, erratic sleep schedule.",
            "nidana": "Stress from work deadlines, skipping breakfast, excess chili and sour condiments.",
        },
        "personal_history": {
            "diet": "Vegetarian, high chili and fried snacks",
            "sleep": "5-6 hours, restless",
            "habits": "Non-smoker, 4 cups of black tea daily",
            "occupation": "Software Engineer",
        },
    }
    ayush_derived = {
        "clinicalSummary": "AYUSH clinical history: 34-year-old male presenting with chronic Amlapitta (Hyperacidity). Patient-reported Dashavidha Pariksha reveals Pitta-dominant baseline with Tikshnagni/Vishamagni and dietary/lifestyle nidana.",
        "patientVerification": {"verified": True, "verifiedAt": now.isoformat()},
        "medicalEntities": {
            "diagnoses": ["Amlapitta (Hyperacidity / Dyspepsia)"],
            "medications": [
                {"name": "Avipattikar Churna", "dose": "3g", "frequency": "Twice daily with lukewarm water before meals"}
            ],
            "investigations": [],
            "procedures": [],
        },
        "doctorReviews": {},
    }
    if not case_ayush:
        case_ayush = ClinicalCase(
            caseId="demo-ayush-history",
            patientId="patient-demo-ayush",
            createdAt=now,
            updatedAt=now,
            language="en-IN",
            status="doctor_review",
            consentGranted=True,
            intakeAnswers=ayush_answers,
            derivedClinicalData=ayush_derived,
        )
        db.add(case_ayush)
    else:
        case_ayush.intakeAnswers = ayush_answers
        case_ayush.derivedClinicalData = ayush_derived
        case_ayush.status = "doctor_review"
    db.commit()

    # ── 5. Demo Case D: Kannada Multilingual Case (Acute Febrile Illness) ──
    case_kn = db.query(ClinicalCase).filter(ClinicalCase.caseId == "demo-kannada-fever").first()
    kn_answers = {
        "chief_complaint": {
            "value": "High fever with chills and severe body ache for 3 days",
            "original": "ಮೂರು ದಿನಗಳಿಂದ ಚಳಿ ಮತ್ತು ತೀವ್ರ ಮೈಕೈ ನೋವಿನೊಂದಿಗೆ ತೀವ್ರ ಜ್ವರ",
            "lang": "kn",
        },
        "duration": {
            "value": "3 days",
            "original": "3 ದಿನಗಳು",
            "lang": "kn",
        },
        "symptom_severity": {
            "value": "Severe",
            "original": "ತೀವ್ರ",
            "lang": "kn",
        },
        "allergies": {
            "value": "No known drug allergies",
            "original": "ಯಾವುದೇ ಔಷಧ ಅಲರ್ಜಿ ಇಲ್ಲ",
            "lang": "kn",
        },
        "current_medications": {
            "value": "Paracetamol 650mg SOS",
            "original": "ಪ್ಯಾರಸಿಟಮಾಲ್ 650mg ಅಗತ್ಯವಿದ್ದಾಗ",
            "lang": "kn",
        },
    }
    kn_derived = {
        "clinicalSummary": "42-year-old male presenting with acute febrile illness: high fever, chills, and severe myalgia for 3 days.",
        "patientVerification": {"verified": True, "verifiedAt": now.isoformat()},
        "medicalEntities": {
            "diagnoses": ["Acute Febrile Illness", "Suspected Viral Infection"],
            "medications": [
                {"name": "Paracetamol", "dose": "650mg", "frequency": "SOS (as needed)"}
            ],
            "investigations": [],
            "procedures": [],
        },
        "doctorReviews": {},
    }
    if not case_kn:
        case_kn = ClinicalCase(
            caseId="demo-kannada-fever",
            patientId="patient-demo-kn",
            createdAt=now,
            updatedAt=now,
            language="kn",
            status="doctor_review",
            consentGranted=True,
            intakeAnswers=kn_answers,
            derivedClinicalData=kn_derived,
        )
        db.add(case_kn)
    else:
        case_kn.intakeAnswers = kn_answers
        case_kn.derivedClinicalData = kn_derived
        case_kn.language = "kn"
        case_kn.status = "doctor_review"

    # ── 6. Demo Case E: Hindi Multilingual Case (Allergic Bronchitis) ───────
    case_hi = db.query(ClinicalCase).filter(ClinicalCase.caseId == "demo-hindi-cough").first()
    hi_answers = {
        "chief_complaint": {
            "value": "Dry cough and shortness of breath during exertion for 1 week",
            "original": "एक सप्ताह से सूखी खांसी और मेहनत करने पर सांस फूलना",
            "lang": "hi",
        },
        "duration": {
            "value": "1 week",
            "original": "1 सप्ताह",
            "lang": "hi",
        },
        "symptom_severity": {
            "value": "Moderate",
            "original": "मध्यम",
            "lang": "hi",
        },
        "allergies": {
            "value": "Dust and pollen allergy",
            "original": "धूल और पराग से एलर्जी",
            "lang": "hi",
        },
        "current_medications": {
            "value": "Cetirizine 10mg OD at night",
            "original": "सिटिरिज़िन 10mg रात को एक बार",
            "lang": "hi",
        },
    }
    hi_derived = {
        "clinicalSummary": "38-year-old female presenting with dry cough and exertional dyspnea for 1 week with known atopy/dust allergy.",
        "patientVerification": {"verified": True, "verifiedAt": now.isoformat()},
        "medicalEntities": {
            "diagnoses": ["Bronchospasm", "Allergic Bronchitis"],
            "medications": [
                {"name": "Cetirizine", "dose": "10mg", "frequency": "OD at bedtime"}
            ],
            "investigations": [],
            "procedures": [],
        },
        "doctorReviews": {},
    }
    if not case_hi:
        case_hi = ClinicalCase(
            caseId="demo-hindi-cough",
            patientId="patient-demo-hi",
            createdAt=now,
            updatedAt=now,
            language="hi",
            status="doctor_review",
            consentGranted=True,
            intakeAnswers=hi_answers,
            derivedClinicalData=hi_derived,
        )
        db.add(case_hi)
    else:
        case_hi.intakeAnswers = hi_answers
        case_hi.derivedClinicalData = hi_derived
        case_hi.language = "hi"
        case_hi.status = "doctor_review"
    db.commit()

    # Pre-existing test cases for backward test compatibility
    for test_id, pat_id, cc, alg in [
        ("test-e2e-ci-positive", "patient-pos", "I have severe chest pain", "anaphylaxis to peanuts"),
        ("test-e2e-ci-empty", "patient-emp", "I have a mild headache", "none"),
    ]:
        c = db.query(ClinicalCase).filter(ClinicalCase.caseId == test_id).first()
        if not c:
            c = ClinicalCase(
                caseId=test_id,
                patientId=pat_id,
                createdAt=now,
                updatedAt=now,
                status="doctor_review",
                intakeAnswers={"chief_complaint": cc, "allergies_reaction": alg},
            )
            db.add(c)
    db.commit()

    db.close()
    print("Idempotent demo dataset seeded successfully:")
    print("  - Case A (Cardiac red flag): demo-cardiac-redflag")
    print("  - Case B (Diabetes repeat longitudinal): demo-diabetes-repeat")
    print("  - Case C (AYUSH / Ayurveda): demo-ayush-history")
    print("  - Case D (Kannada Multilingual): demo-kannada-fever")
    print("  - Case E (Hindi Multilingual): demo-hindi-cough")
    print("  - Users: doctor/password123, admin/admin123, patient/password123")

if __name__ == "__main__":
    seed_db()
