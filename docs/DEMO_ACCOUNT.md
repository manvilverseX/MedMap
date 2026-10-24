# Dedicated Demo Doctor Account & Production Runbook

## Overview
MedMap includes a dedicated demo-only doctor account (`demo_doctor`) used exclusively for live product demonstrations and evaluation.

- **Username:** `demo_doctor`
- **Role:** `doctor`
- **Local Dev Default Password:** `demo_doctor_password123`
- **Production Environment Password:** Configured via `DEMO_DOCTOR_PASSWORD` environment variable.

---

## Running `create_demo_doctor.py`

The script `backend/scripts/create_demo_doctor.py` is idempotent and safe:
- It **only** touches the `demo_doctor` record in the database.
- It **refuses** to touch any other user account.
- It **never prints or logs** passwords to stdout or stderr.
- On any non-local database, it **strictly requires** `DEMO_DOCTOR_PASSWORD` to be explicitly set in the environment and exits with a non-zero code if missing.

### Local Development Usage
In local development (connected to localhost / sqlite):
```bash
cd backend
python scripts/create_demo_doctor.py
```
To reset the password in local development:
```bash
cd backend
python scripts/create_demo_doctor.py --reset-password
```

### Production Deployment Execution
When deploying or preparing a dedicated demonstration database:
1. Export the production database connection string and secure demo password in your shell:
   ```bash
   export DATABASE_URL="postgresql+psycopg2://user:secret@host:5432/medmap"
   export DEMO_DOCTOR_PASSWORD="<STRONG_RANDOMLY_GENERATED_PASSWORD>"
   ```
2. Run the script:
   ```bash
   python backend/scripts/create_demo_doctor.py
   ```
3. To update or rotate the password for `demo_doctor`:
   ```bash
   python backend/scripts/create_demo_doctor.py --reset-password
   ```

---

## Frontend Vercel Environment Variables

In production builds, the "Fill Demo Credentials" helper button is **hidden by default** to prevent exposing broken or unintended credentials.

To enable the quick-fill button on a deployed demonstration environment:
Set the following environment variables in Vercel project settings:
- `VITE_DEMO_DOCTOR_USERNAME`: `demo_doctor`
- `VITE_DEMO_DOCTOR_PASSWORD`: `<MATCHING_PASSWORD_SET_IN_DB>`

When these variables are active, a safety warning banner is displayed on both the doctor login and patient onboarding pages:
> **"Demo environment: use only synthetic data, never real patient information"**
