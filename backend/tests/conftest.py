import os
import sys
from pathlib import Path
import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Set default environment variables for testing
# This must happen before any application modules are imported
os.environ["SECRET_KEY"] = "test-secret-key-for-pytest-do-not-use-in-prod"
