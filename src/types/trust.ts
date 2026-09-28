export type PatientVerificationStatus = 'pending' | 'verified' | 'flagged';
export type DoctorReviewStatus = 'pending' | 'accepted' | 'modified' | 'rejected';

export interface Evidence {
  evidenceId: string;
  sourceType: 'intake' | 'document';
  sourceId: string;
  extractedContent?: string;
  location?: string;
}
