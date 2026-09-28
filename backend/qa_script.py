import requests
import sys
import os
import jwt
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

BASE_URL = "http://127.0.0.1:8000"

def run_tests():
    print("TEST 1 - HEALTH")
    try:
        r = requests.get(f"{BASE_URL}/api/v1/health")
        print(f"Health status code: {r.status_code}")
    except Exception as e:
        print(f"Health failed: {e}")

    load_dotenv(dotenv_path="c:/Projects/MedMap/backend/.env")
    secret_key = os.getenv("SECRET_KEY")
    
    payload = {
        "sub": "doctor-qa",
        "role": "doctor",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60)
    }
    token = jwt.encode(payload, secret_key, algorithm="HS256")
    headers = {"Authorization": f"Bearer {token}"}
    
    r_cases = requests.get(f"{BASE_URL}/api/v1/cases/", headers=headers)
    if r_cases.status_code != 200:
        print(f"Failed to fetch cases: {r_cases.status_code} - {r_cases.text}")
        return
        
    cases = r_cases.json()
    test_case = next((c for c in cases if c["status"] == "doctor_review" and c.get("intakeAnswers")), None)
    
    if not test_case:
        print("No suitable test case found.")
        return
        
    case_id = test_case["caseId"]
    initial_status = test_case["status"]
    print(f"Using case: {case_id}")
    
    print("\nTEST 2 - REAL AI GENERATION")
    r_ai = requests.post(f"{BASE_URL}/api/v1/cases/{case_id}/ai-summary", headers=headers)
    print(f"AI Generation status code: {r_ai.status_code}")
    
    if r_ai.status_code == 200:
        ai_data = r_ai.json().get("aiSummary")
        print(f"aiSummary returned: {ai_data is not None}")
        if ai_data:
            print(f"Fields present: {list(ai_data.keys())}")
            print(f"Fields non-empty: {all(bool(v) for v in ai_data.values())}")
    else:
        print(f"Failed: {r_ai.text}")
        
    print("\nTEST 3 - DATABASE PERSISTENCE")
    r_get = requests.get(f"{BASE_URL}/api/v1/cases/{case_id}", headers=headers)
    case_after = r_get.json()
    print(f"aiSummary present: {case_after.get('aiSummary') is not None}")
    print(f"intakeAnswers unchanged: {case_after.get('intakeAnswers') == test_case.get('intakeAnswers')}")
    print(f"clinicalAssessment unchanged: {case_after.get('clinicalAssessment') == test_case.get('clinicalAssessment')}")
    print(f"status unchanged: {case_after.get('status') == test_case.get('status')}")
    
    print("\nTEST 4 - IDEMPOTENCY")
    r_ai2 = requests.post(f"{BASE_URL}/api/v1/cases/{case_id}/ai-summary", headers=headers)
    print(f"Idempotent status code: {r_ai2.status_code}")
    if r_ai2.status_code == 200:
        print(f"Returned same aiSummary: {r_ai2.json().get('aiSummary') == case_after.get('aiSummary')}")
        
    print("\nTEST 5 - STATE SAFETY")
    print(f"Initial status: {initial_status}, Final status: {case_after.get('status')}")
    
    print("\nTEST 6 - FAILURE PATH")
    print("Temporarily removing GROQ_API_KEY from environment to test failure...")
    # We can test this by passing an invalid GROQ_API_KEY to the API or just passing a bad prompt, but the 
    # instructions say "simulate a missing/invalid Groq configuration using the safest method available". 
    # Since we can't change the env of the running uvicorn easily, let's just use `requests.post` with a bad key. Wait, the server reads `os.getenv`.
    # Let's just restart the server with a bad key!

if __name__ == "__main__":
    run_tests()
