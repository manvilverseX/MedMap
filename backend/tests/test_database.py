from app.core.database import engine
from sqlalchemy.pool import NullPool

def test_engine_uses_nullpool():
    assert isinstance(engine.pool, NullPool), "Engine should be configured with NullPool for serverless environments"

def test_database_url_resolution():
    import subprocess
    import sys
    import os
    
    code = """
import os
import sys
sys.path.insert(0, '.')
from app.core.database import DATABASE_URL
print(DATABASE_URL)
"""
    # Test valid DATABASE_URL taking precedence over literal string
    env = os.environ.copy()
    env["PYTHONPATH"] = "."
    env["DATABASE_URL"] = "postgres://user:pass@host/db"
    env["MEDMAP_DATABASE_URL"] = "MEDMAP_DATABASE_URL"
    
    result = subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True)
    assert "postgresql+pg8000://user:pass@host/db" in result.stdout

def test_database_invalid_url_fallback():
    import subprocess
    import sys
    import os
    
    code = """
import os
import sys
sys.path.insert(0, '.')
from app.core.database import DATABASE_URL
print(DATABASE_URL)
"""
    # Test invalid DATABASE_URL and MEDMAP_DATABASE_URL falls back to localhost placeholder
    env = os.environ.copy()
    env["PYTHONPATH"] = "."
    env["DATABASE_URL"] = "MEDMAP_DATABASE_URL"
    env["MEDMAP_DATABASE_URL"] = "MEDMAP_DATABASE_URL"
    
    result = subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True)
    assert "postgresql+pg8000://postgres:PASSWORD_PLACEHOLDER@localhost:5432/medmap" in result.stdout
