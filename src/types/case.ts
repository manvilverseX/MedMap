export type CaseStatus = 'intake' | 'patient_verifying' | 'doctor_review' | 'completed';

export interface ClinicalCase {
  caseId: string;
  patientId: string;
  createdAt: string;
  updatedAt: string;
  language?: string;
  consentGranted?: boolean;
  status: CaseStatus;
  intakeAnswers?: Record<string, string>;
  clinicalAssessment?: Record<string, any>;
  reviewerId?: string;
}
