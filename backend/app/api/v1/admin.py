from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_admin
from app.models.case import ClinicalCase
from app.models.event import UnifiedClinicalEvent
from app.services.audit_service import log_clinical_event

router = APIRouter()


class AlertAcknowledgeRequest(BaseModel):
    caseId: str
    category: str
    explanation: Optional[str] = None


@router.get("/queue")
def get_admin_triage_queue(
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin),
):
    cases = db.query(ClinicalCase).all()

    status_counts = {
        "intake": 0,
        "patient_verifying": 0,
        "doctor_review": 0,
        "completed": 0,
        "total": len(cases),
    }

    # Query all alert acknowledgment events
    ack_events = db.query(UnifiedClinicalEvent).filter(UnifiedClinicalEvent.eventType == "alert_acknowledged").all()
    acknowledged_keys = set()
    for evt in ack_events:
        det = evt.details or {}
        key = f"{evt.caseId}:{det.get('category')}:{det.get('explanation')}"
        acknowledged_keys.add(key)
        acknowledged_keys.add(f"{evt.caseId}:{det.get('category')}")

    queue_cases = []
    red_flag_alerts = []

    for c in cases:
        st = c.status or "intake"
        if st in status_counts:
            status_counts[st] += 1

        intake_ans = c.intakeAnswers or {}
        consultation_type = intake_ans.get("consultation_type", "general")

        # Complaint summary (minimal triage info only, not full clinical details)
        complaint_summary = "Not recorded"
        if c.aiSummary and isinstance(c.aiSummary, dict) and c.aiSummary.get("chiefComplaint"):
            complaint_summary = c.aiSummary.get("chiefComplaint")
        elif intake_ans.get("chief_complaint"):
            raw_cc = intake_ans.get("chief_complaint")
            complaint_summary = raw_cc if isinstance(raw_cc, str) else str(raw_cc.get("value", ""))

        derived = c.derivedClinicalData or {}
        ci = derived.get("clinicalIntelligence", {})
        raw_flags = ci.get("redFlags", [])

        case_flags = []
        for rf in raw_flags:
            cat = rf.get("category", "General")
            expl = rf.get("explanation", "")
            key = f"{c.caseId}:{cat}:{expl}"
            key_cat = f"{c.caseId}:{cat}"
            is_ack = key in acknowledged_keys or key_cat in acknowledged_keys

            flag_item = {
                "category": cat,
                "severity": rf.get("severity", "high"),
                "explanation": expl,
                "evidence": rf.get("evidence", ""),
                "acknowledged": is_ack,
            }
            case_flags.append(flag_item)

            red_flag_alerts.append({
                "caseId": c.caseId,
                "patientId": c.patientId,
                "category": cat,
                "severity": rf.get("severity", "high"),
                "explanation": expl,
                "evidence": rf.get("evidence", ""),
                "acknowledged": is_ack,
                "caseStatus": c.status,
                "updatedAt": c.updatedAt.isoformat() if c.updatedAt else None,
            })

        queue_cases.append({
            "caseId": c.caseId,
            "patientId": c.patientId,
            "language": c.language or "English",
            "consultationType": consultation_type,
            "status": c.status,
            "hasRedFlags": len(case_flags) > 0,
            "redFlagCount": len(case_flags),
            "chiefComplaint": complaint_summary,
            "redFlags": case_flags,
            "lastUpdated": c.updatedAt.isoformat() if c.updatedAt else None,
        })

    queue_cases.sort(key=lambda x: x["lastUpdated"] or "", reverse=True)

    return {
        "statusCounts": status_counts,
        "cases": queue_cases,
        "redFlagAlerts": red_flag_alerts,
    }


@router.post("/alerts/acknowledge")
def acknowledge_triage_alert(
    payload: AlertAcknowledgeRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(require_admin),
):
    case = db.query(ClinicalCase).filter(ClinicalCase.caseId == payload.caseId).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    log_clinical_event(
        db,
        payload.caseId,
        "alert_acknowledged",
        {
            "category": payload.category,
            "explanation": payload.explanation,
            "actor": current_user.get("sub", "admin"),
            "role": "admin",
            "statement": f"Triage alert for {payload.category} acknowledged by admin {current_user.get('sub', 'admin')}",
        },
    )
    return {
        "success": True,
        "message": "Alert acknowledged",
        "caseId": payload.caseId,
        "category": payload.category,
    }
