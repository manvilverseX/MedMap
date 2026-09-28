import os
import sys

# Add the 'backend' directory to sys.path so that 'app.main' and 'app.core' resolve correctly.
backend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'backend')
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app

# Vercel function cache bust: dc63c42
# Preview deployment trigger
