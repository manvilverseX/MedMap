import type { Evidence, PatientVerificationStatus, DoctorReviewStatus } from './trust';

export interface TimelineEvent {
  date: string;
  eventType: string;
  description: string;
  evidenceIds?: string[]; // References Evidence items
}

export interface ClinicalHistory {
  chiefComplaint?: string;
  historyOfPresentIllness?: string[];
  pastMedicalHistory?: string[];
  pastSurgicalHistory?: string[];
  medicationHistory?: string[];
  allergies?: string[];
  familyHistory?: string[];
  personalHistory?: string[];
  reviewOfSystems?: string[];
  previousInvestigations?: string[];
}

export interface DoctorReview {
  status: DoctorReviewStatus;
  reviewedAt?: string;
  reviewedBy?: string; // string identifier for now
  notes?: string;
}

export interface UnifiedCase {
  caseId: string;
  patientId: string;
  
  // Structured Representation
  demographics?: Record<string, string>;
  history: ClinicalHistory;
  medications?: string[];
  allergies?: string[];
  investigations?: string[];
  documentsFindings?: string[];
  timeline?: TimelineEvent[];
  highlights?: string[];
  missingInformation?: string[];
  
  // Evidence Map (key is evidenceId)
  evidence?: Record<string, Evidence>;
  
  // Data Trust / Verification Model
  patientVerificationStatus: PatientVerificationStatus;
  doctorReview: DoctorReview;
}
