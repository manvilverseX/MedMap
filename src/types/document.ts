export type DocumentProcessingStatus = 'uploaded' | 'processing' | 'processed' | 'failed';

export interface Document {
  documentId: string;
  caseId: string;
  fileName: string;
  documentType?: string;
  uploadedAt: string;
  processingStatus: DocumentProcessingStatus;
  extractedText?: string;
}
