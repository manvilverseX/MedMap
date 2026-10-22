import builtins
import importlib
import os
from pathlib import Path
import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent


def test_no_backend_module_reads_outside_backend():
    """
    Assert that importing any app module and calling translation lookup
    never attempts to read or open files outside the backend directory
    (such as ../src/i18n/strings.ts).
    """
    accessed_paths: list[Path] = []
    original_open = builtins.open

    def guarded_open(file, *args, **kwargs):
        try:
            if isinstance(file, (str, bytes, Path, os.PathLike)):
                p = Path(os.fsdecode(file)).resolve()
                accessed_paths.append(p)
        except Exception:
            pass
        return original_open(file, *args, **kwargs)

    builtins.open = guarded_open
    try:
        # Import core modules
        import app.main
        import app.services.translation_service as ts
        import app.services.adaptive_intake
        import app.services.interview_engine.policy_engine
        import app.api.v1.cases
        import app.api.v1.translate

        # Call translation service lookup
        translated, ok = ts.translate_texts(["Chief Complaint", "What is the main reason for your visit today?"], "hi")
        assert ok is True
        assert len(translated) == 2
        assert "मुख्य" in translated[0] or "शिकायत" in translated[0]

        translated_kn, ok_kn = ts.translate_texts(["Chief Complaint"], "kn")
        assert ok_kn is True

    finally:
        builtins.open = original_open

    # Verify no path accessed lies in the project's src directory
    project_src = BACKEND_DIR.parent / "src"
    violations = [p for p in accessed_paths if str(p).startswith(str(project_src))]
    assert not violations, f"Backend code opened files outside backend/ at runtime: {violations}"
