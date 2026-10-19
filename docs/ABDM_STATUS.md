# ABDM Integration Status: MOCK / SIMULATION

> **Mandatory Honesty Notice:**<br />
> Current Status: **MOCK / SIMULATION**<br />
> MedMap is currently configured in **simulation mode** for all Ayushman Bharat Digital Mission (ABDM) workflows. It does **NOT** connect to live government ABDM / ABHA production systems or live sandbox servers. Every ABDM screen and dialog carries the visible badge: **"Simulation: not connected to ABDM"**.

---

## 1. Architectural Overview

MedMap simulates the national health data exchange architecture as defined by the National Health Authority (NHA) for India's Ayushman Bharat Digital Mission.

```
+-----------------------------------------------------------------------------------+
|                        MedMap ABDM Simulation Architecture                       |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  [ Patient Onboarding ] -----> [ ABHA Mock Verification ] (Demo OTP: 123456)      |
|           |                                                                       |
|           v                                                                       |
|  [ Clinical Case Intake ]                                                         |
|           |                                                                       |
|           v                                                                       |
|  [ Physician Review & Finalization ]                                              |
|           |                                                                       |
|           v                                                                       |
|  [ FHIR R4 Bundle Assembly ]                                                      |
|           |                                                                       |
|           v                                                                       |
|  [ Simulated ABDM Share ] ---> [ Granular Revocable Consent Modal ]               |
|                                         |                                         |
|                                         v                                         |
|                                [ Care Context Link ]                              |
|                                (Logged to Audit Trail)                            |
+-----------------------------------------------------------------------------------+
```

---

## 2. Simulated Workflow Steps

### Step 1: Patient ABHA Verification (Onboarding)
- **Endpoint:** `POST /api/v1/abdm/verify`
- **Behavior:** Validates ABHA ID format without external network calls.
- **Demo OTP:** A fixed demo OTP (`123456`) is accepted to simulate two-factor mobile authentication.
- **Skip Option:** Patients can skip ABHA linking at any time and continue as a new patient.

### Step 2: Physician Care Context Linking (Doctor Case View)
- **Trigger:** Available only after the case is finalized (`status === 'completed'`).
- **Endpoint:** `POST /api/v1/abdm/link-context`
- **Granular Consent:** Requires physician confirmation of patient's granular authorization:
  1. Care Context Linking (linking case ID to patient's ABHA profile).
  2. Clinical FHIR Bundle Exchange (permission to share diagnostic and observational findings).
- **Revocability:** Clearly states that consent is revocable at any time via the patient's ABHA / PHR app.

### Step 3: Lifecycle Timeline
Once simulated share is executed, the UI displays the 6-stage lifecycle status:
1. **Finalized:** Clinical case verified and signed off by physician.
2. **FHIR Mapped:** Standard HL7 FHIR R4 Bundle constructed.
3. **ABHA-Linked:** Care Context linked to patient ABHA identifier.
4. **Consent:** Granular, revocable authorization recorded and sealed.
5. **Exchange (Simulated):** Encrypted payload dispatched to simulated ABDM Gateway.
6. **Retrievable at Next Visit:** Longitudinally accessible in simulated HIP/HIU registry.

### Step 4: Audit Trail
Every simulated ABDM transaction is immutably logged to the `clinical_events` table under the event type `abdm_mock_action` with metadata:
- `action`: `"link_care_context"`
- `abhaId`: The targeted ABHA identifier
- `simulation`: `true`
- `badge`: `"Simulation: not connected to ABDM"`
- `actor`: User role initiating the action

---

## 3. Transitioning to Live ABDM Sandbox

To transition from this simulation to the official NHA ABDM Sandbox in the future:
1. Obtain official Sandbox credentials from the NHA developer portal (`https://sandbox.abdm.gov.in/`).
2. Populate the commented environment variables in `.env`:
   ```bash
   # ABDM_CLIENT_ID=<your-client-id>
   # ABDM_CLIENT_SECRET=<your-client-secret>
   # ABDM_SANDBOX_BASE_URL=https://dev.abdm.gov.in/gateway/v0.5
   # ABDM_BRIDGE_ID=<your-bridge-id>
   ```
3. Implement the cryptographic signing (JWE/JWS) and callback webhooks for `/v0.5/consent-requests/on-init`, `/v0.5/links/link/on-confirm`, and `/v0.5/health-information/hip/request`.
