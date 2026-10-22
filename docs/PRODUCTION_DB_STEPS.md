# Production Database Readiness Steps

> [!IMPORTANT]
> **APPROVAL REQUIRED BEFORE EXECUTION**
> Do **NOT** run these commands automatically or without explicit authorization.
> These commands modify the live production PostgreSQL database. They require the production `DATABASE_URL` secret. Ensure a database snapshot/backup is taken in the database provider (e.g., Neon / Supabase / AWS RDS) prior to performing migrations.

---

## 1. Confirm whether `translation_cache` exists in production

Run the following query using `psql` or the database provider's SQL console:

```sql
SELECT
    EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'translation_cache'
    ) AS table_exists;
```

Or via `psql` directly:

```bash
psql "$PROD_DATABASE_URL" -c "\dt translation_cache"
```

### Expected Output
- If the table exists: returns `true` or lists `public | translation_cache | table`.
- If the table does not exist: returns `false` or `Did not find any relation named "translation_cache"`.

---

## 2. Run Alembic Migrations to `head` against Production

Vercel builds run Alembic only during preview deployments (`VERCEL_ENV=preview`). Production builds skip Alembic. Therefore, production migrations must be executed explicitly.

From a secure administrative terminal (with the backend virtual environment activated):

```powershell
# PowerShell (Windows)
cd backend
$env:DATABASE_URL="<PRODUCTION_DATABASE_URL>"
.\venv\Scripts\alembic.exe upgrade head
```

```bash
# Bash (Linux/macOS)
cd backend
export DATABASE_URL="<PRODUCTION_DATABASE_URL>"
alembic upgrade head
```

### Verification
Run `alembic current` to ensure the database matches `head`:

```powershell
.\venv\Scripts\alembic.exe current
```
*(Should output `f3a1b2c4d5e6 (head)` or the latest revision).*

---

## 3. Warm the Translation Cache (Idempotent)

Once the `translation_cache` table is created, seed it with all static dictionary strings (`strings.ts`), curated intake questions, gap questions, AYUSH pathway prompts, and backend clinical error messages into Hindi (`hi`) and Kannada (`kn`).

```powershell
# PowerShell (Windows)
cd backend
$env:DATABASE_URL="<PRODUCTION_DATABASE_URL>"
$env:GROQ_API_KEY="<PRODUCTION_GROQ_API_KEY>"
.\venv\Scripts\python.exe warm_translation_cache.py
```

```bash
# Bash (Linux/macOS)
cd backend
export DATABASE_URL="<PRODUCTION_DATABASE_URL>"
export GROQ_API_KEY="<PRODUCTION_GROQ_API_KEY>"
python3 warm_translation_cache.py
```

### Expected Counts & Idempotency
- **Discovered strings**: ~172 unique translatable strings per language.
- **Pre-seeded static strings**: ~143 keys seeded directly from static dictionaries into DB without hitting Groq.
- **Dynamic strings translated**: ~29 strings per language translated in batches of 12.
- **Total entries in `translation_cache`**: ~344 entries total (~172 for `hi`, ~172 for `kn`).
- **Idempotency**: Running this script multiple times skips existing entries (`source_text_hash` + `target_lang`) and makes zero redundant API requests.

---

## 4. Rotate Demo Passwords (Doctor & Admin)

Rotate default credentials for the doctor and admin demo accounts on production to prevent unauthorized access.

### Step 4A: Generate Secure Hashes and Update Credentials
Execute the following one-line helper script to generate new random credentials and update the production database:

```powershell
cd backend
$env:DATABASE_URL="<PRODUCTION_DATABASE_URL>"
.\venv\Scripts\python.exe -c "
import os, secrets, string
from passlib.context import CryptContext
from sqlalchemy import create_engine, text

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
alphabet = string.ascii_letters + string.digits + '!@#$%^&*'

doc_pwd = ''.join(secrets.choice(alphabet) for _ in range(16))
admin_pwd = ''.join(secrets.choice(alphabet) for _ in range(16))

engine = create_engine(os.environ['DATABASE_URL'])
with engine.begin() as conn:
    conn.execute(
        text('UPDATE users SET hashed_password = :hp WHERE username = :u'),
        {'hp': pwd_context.hash(doc_pwd), 'u': 'doctor'}
    )
    conn.execute(
        text('UPDATE users SET hashed_password = :hp WHERE username = :u'),
        {'hp': pwd_context.hash(admin_pwd), 'u': 'admin'}
    )

print('SUCCESS: Passwords updated in production DB.')
print(f'New doctor password: {doc_pwd}')
print(f'New admin password:  {admin_pwd}')
"
```

> [!CAUTION]
> Record the printed credentials in the organizational secret manager immediately. Clear your terminal scrollback buffer after running this script.

---

## 5. Post-Deployment Smoke Test
Verify that production endpoints respond correctly:
1. `GET /api/v1/health` -> `{"status": "ok"}`
2. Doctor login with rotated credentials -> receives JWT token with `role: "doctor"`.
3. Patient intake in Kannada and Hindi -> verifies instant dictionary and `translation_cache` hits.
