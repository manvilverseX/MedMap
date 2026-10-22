export type CaseStatus = 'intake' | 'patient_verifying' | 'doctor_review' | 'completed';

export interface ClinicalCase {
  caseId: string;
  patientId: string;
  createdAt: string;
  updatedAt: string;
  language?: string;
  consentGranted?: boolean;
  status: CaseStatus;
  intakeAnswers?: Record<string, any>;
  clinicalAssessment?: Record<string, any>;
  aiSummary?: {
    chiefComplaint: string;
    historyOfPresentIllness: string;
    pastMedicalHistory: string;
    pastSurgicalHistory?: string;
    medications?: string;
    allergies?: string;
    familyHistory?: string;
    reviewOfSystems?: string;
  };
  derivedClinicalData?: Record<string, any>;
  reviewerId?: string;
  adaptiveState?: any;
  nextQuestion?: any;
}

export interface SafetyEscalation {
  isEscalated: boolean;
  severity?: string;
  title?: string;
  message?: string;
  instructions?: string;
  redFlags?: string[];
}

export interface ClinicalProgress {
  domainsExplored: string[];
  activeDomain?: string;
  questionsAnswered: number;
  coverageStatus?: string;
  unresolvedGapsCount?: number;
}
