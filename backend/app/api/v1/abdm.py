from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Any
from app.core.database import get_db
from app.core.security import require_patient_or_doctor
from app.services.abdm_sandbox import abdm_sandbox

router = APIRouter()

@router.post("/verify")
async def verify_abha_endpoint(
    payload: Dict[str, str],
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor)
):
    abha_id = payload.get("abhaId")
    if not abha_id:
        raise HTTPException(status_code=400, detail="abhaId is required")
        
    result = await abdm_sandbox.verify_abha(abha_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Verification failed"))
        
    return result

@router.post("/link-context")
async def link_care_context_endpoint(
    payload: Dict[str, str],
    current_user: Dict[str, Any] = Depends(require_patient_or_doctor)
):
    abha_id = payload.get("abhaId")
    case_id = payload.get("caseId")
    
    if not abha_id or not case_id:
        raise HTTPException(status_code=400, detail="abhaId and caseId are required")
        
    if current_user.get("role") == "patient" and current_user.get("case_id") != case_id:
        raise HTTPException(status_code=403, detail="Not authorized to link this case")
        
    result = await abdm_sandbox.link_care_context(abha_id, case_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail="Failed to link context")
        
    return result
