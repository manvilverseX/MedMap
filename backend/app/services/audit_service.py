import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.models.event import UnifiedClinicalEvent
from app.models.evidence import Evidence


def log_clinical_event(
    db: Session,
    case_id: str,
    event_type: str,
    details: Dict[str, Any],
    status: str = "completed",
    event_date: Optional[datetime] = None,
) -> UnifiedClinicalEvent:
    """Create and persist an audit event in the clinical_events table."""
    event = UnifiedClinicalEvent(
        eventId=f"evt-{uuid.uuid4()}",
        caseId=case_id,
        eventType=event_type,
        eventDate=event_date or datetime.now(timezone.utc),
        details=details,
        status=status,
    )
    db.add(event)
    try:
        db.commit()
        db.refresh(event)
    except Exception:
        db.rollback()
        raise
    return event


def get_case_audit_trail(db: Session, case_id: str) -> List[UnifiedClinicalEvent]:
    """Retrieve all audit events for a clinical case ordered chronologically."""
    return (
        db.query(UnifiedClinicalEvent)
        .filter(UnifiedClinicalEvent.caseId == case_id)
        .order_by(UnifiedClinicalEvent.eventDate.desc())
        .all()
    )


def record_evidence_decision(
    db: Session,
    case_id: str,
    field_path: str,
    action: str,  # "accepted", "edited", "rejected"
    source_type: str = "document",
    source_document_id: Optional[str] = None,
    snippet: Optional[str] = None,
    page_location: Optional[str] = None,
    actor: str = "doctor",
) -> Evidence:
    """Record or update doctor's item-level decision in the evidence table and log the event."""
    evidence = (
        db.query(Evidence)
        .filter(Evidence.fieldPath == field_path)
        .first()
    )

    audit_evt = log_clinical_event(
        db=db,
        case_id=case_id,
        event_type="doctor_decision",
        details={
            "fieldPath": field_path,
            "action": action,
            "actor": actor,
            "sourceType": source_type,
            "sourceDocumentId": source_document_id,
            "snippet": snippet,
            "pageLocation": page_location,
        },
    )

    if not evidence:
        evidence = Evidence(
            evidenceId=f"evi-{uuid.uuid4()}",
            eventId=audit_evt.eventId,
            sourceType=source_type,
            sourceDocumentId=source_document_id,
            snippet=snippet,
            pageLocation=page_location,
            verificationStatus=action,
            fieldPath=field_path,
        )
        db.add(evidence)
    else:
        evidence.verificationStatus = action
        evidence.eventId = audit_evt.eventId
        if snippet:
            evidence.snippet = snippet
        if page_location:
            evidence.pageLocation = page_location
        if source_document_id:
            evidence.sourceDocumentId = source_document_id

    db.commit()
    db.refresh(evidence)
    return evidence
