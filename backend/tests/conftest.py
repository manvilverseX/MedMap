import os
import pytest

# Set default environment variables for testing
# This must happen before any application modules are imported
os.environ["SECRET_KEY"] = "test-secret-key-for-pytest-do-not-use-in-prod"
