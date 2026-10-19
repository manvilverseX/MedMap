import type { ClinicalCase } from '../types/case';
import { uploadPresigned } from '@vercel/blob/client';

export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1').replace(/\/+$/, '');

const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('medmap_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

export const createCase = async (
  patientId: string,
  language?: string,
  consentGranted?: boolean,
  consultationType?: string,
  abhaId?: string
): Promise<ClinicalCase> => {
  const bodyPayload: Record<string, any> = { patientId, language, consentGranted };
  const answers: Record<string, any> = {};
  if (consultationType) {
    answers.consultation_type = consultationType;
  }
  if (abhaId) {
    answers.abha_id = abhaId;
    answers.abha_verified = true;
  }
  if (Object.keys(answers).length > 0) {
    bodyPayload.intakeAnswers = answers;
  }

  const response = await fetch(`${API_BASE_URL}/cases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    throw new Error('Failed to create case');
  }

  const data = await response.json();
  if (data.token) {
    localStorage.setItem('medmap_token', data.token);
  }
  return data.case;
};

export const getCase = async (caseId: string): Promise<ClinicalCase> => {
  const response = await fetch(`${API_BASE_URL}/cases/${caseId}`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  let errorDetail = 'Unknown Error';

  if (!response.ok) {

    try {
      const errorData = await response.clone().json();
      if (errorData.detail) {
        errorDetail = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
      }
    } catch {}
    if (process.env.NODE_ENV === 'development') {
      console.error(`[API Error] endpoint="/cases/${caseId}" caseId="${caseId}" status=${response.status} category="${errorDetail}"`);
    }
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    throw new Error(errorDetail !== 'Unknown Error' ? errorDetail : 'Failed to load case');
  }

  return response.json();
};

export const getAdaptiveIntakeState = async (caseId: string, mode?: string, questionId?: string): Promise<any> => {
  const params = new URLSearchParams();
  if (mode) params.append('mode', mode);
  if (questionId) params.append('question_id', questionId);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const response = await fetch(`${API_BASE_URL}/cases/${caseId}/adaptive-intake${qs}`, {
    headers: {
      ...getAuthHeaders(),
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    let errorMessage = 'Failed to load adaptive intake state';
    try {
      const errorData = await response.json();
      if (errorData.detail) errorMessage = errorData.detail;
    } catch {
      // Ignore
    }
    throw new Error(errorMessage);
  }

  return response.json();
};

export const updateCaseStatus = async (caseId: string, status: string): Promise<ClinicalCase> => {
  return updateCase(caseId, { status: status as any });
};

export const updateCase = async (caseId: string, data: Partial<ClinicalCase>): Promise<ClinicalCase> => {
  const response = await fetch(`${API_BASE_URL}/cases/${caseId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to update case');
  }

  return response.json();
};

export const generateAISummary = async (caseId: string): Promise<ClinicalCase> => {
  const response = await fetch(`${API_BASE_URL}/cases/${caseId}/ai-summary`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
    },
  });

  if (!response.ok) {
    let errorMessage = 'Failed to generate AI summary';
    try {
      const errorData = await response.json();
      if (errorData.detail) errorMessage = errorData.detail;
    } catch {
      // Ignore
    }
    throw new Error(errorMessage);
  }

  return response.json();
};

export const uploadDocument = async (caseId: string, file: File): Promise<any> => {
  let blobUploaded = false;
  let blobMetadata: any = null;

  // Check if running in a local environment
  const isLocalHost = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '[::1]'
  );

  // If not local, try Vercel Blob presigned flow first
  if (!isLocalHost) {
    try {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      const safeFilename = `${caseId}/${crypto.randomUUID()}${ext}`;

      blobMetadata = await uploadPresigned(safeFilename, file, {
        access: 'private',
        handleUploadUrl: '/api/blob-upload',
        clientPayload: caseId,
        headers: { ...getAuthHeaders() }
      });
      if (blobMetadata && blobMetadata.url) {
        blobUploaded = true;
      }
    } catch (error: any) {
      console.warn('Vercel Blob presigned upload failed, falling back to direct server upload:', error?.message);
      blobUploaded = false;
    }
  }

  // If Vercel Blob upload succeeded, save metadata to backend
  if (blobUploaded && blobMetadata) {
    const finalBody = new FormData();
    finalBody.append('metadata', JSON.stringify({
      url: blobMetadata.url,
      pathname: blobMetadata.pathname,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size
    }));

    const response = await fetch(`${API_BASE_URL}/cases/${caseId}/documents`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
      body: finalBody,
    });

    if (response.ok) {
      return response.json();
    }
    console.warn('Metadata save failed, falling back to direct file upload');
  }

  // Fallback: direct multipart/form-data upload to FastAPI
  const directBody = new FormData();
  directBody.append('file', file);

  const directResponse = await fetch(`${API_BASE_URL}/cases/${caseId}/documents`, {
    method: 'POST',
    headers: { ...getAuthHeaders() },
    body: directBody,
  });

  if (!directResponse.ok) {
    let errorMessage = 'Failed to upload document';
    try {
      const errorData = await directResponse.json();
      if (errorData.detail) errorMessage = errorData.detail;
    } catch {
      // Ignore
    }
    throw new Error(errorMessage);
  }

  return directResponse.json();
};

export const getDocumentFileUrl = (caseId: string, documentId: string): string => {
  const token = localStorage.getItem('medmap_token');
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${API_BASE_URL}/cases/${caseId}/documents/${documentId}/file${tokenParam}`;
};

export const extractDocument = async (caseId: string, documentId: string): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/cases/${caseId}/documents/${documentId}/extract`, {
    method: 'POST',
    headers: { ...getAuthHeaders() },
  });

  if (!response.ok) {
    let errorMessage = 'Failed to extract document details';
    try {
      const errorData = await response.json();
      if (errorData.detail) errorMessage = errorData.detail;
    } catch {
      // Ignore
    }
    throw new Error(errorMessage);
  }

  return response.json();
};

export const getCases = async (): Promise<ClinicalCase[]> => {
  const response = await fetch(`${API_BASE_URL}/cases`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    throw new Error('Failed to load cases');
  }
  return response.json();
};

export const getCaseDocuments = async (caseId: string): Promise<any[]> => {
  const response = await fetch(`${API_BASE_URL}/cases/${caseId}/documents`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  if (!response.ok) {
    throw new Error('Failed to load case documents');
  }
  return response.json();
};

export const getClinicalIntelligence = async (caseId: string): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/cases/${caseId}/clinical-intelligence`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    throw new Error('Failed to load clinical intelligence');
  }
  return response.json();
};
export const getUnifiedCase = async (caseId: string): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/cases/${caseId}/unified`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    throw new Error('Failed to load unified case');
  }
  return response.json();
};

export const getFhirBundle = async (caseId: string): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/cases/${caseId}/fhir`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    let msg = 'Failed to load FHIR bundle';
    try {
      const err = await response.json();
      if (err.detail) msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
    } catch {}
    throw new Error(msg);
  }
  return response.json();
};

export interface ItemReviewPayload {
  itemType: string;
  itemId: string;
  action: 'accepted' | 'edited' | 'rejected';
  reviewedValue?: any;
  originalValue?: any;
  sourceType?: string;
  sourceDocumentId?: string;
  snippet?: string;
  pageLocation?: string;
}

export const reviewClinicalItem = async (caseId: string, payload: ItemReviewPayload): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/cases/${caseId}/review-item`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    let msg = 'Failed to record review decision';
    try {
      const err = await response.json();
      if (err.detail) msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
    } catch {}
    throw new Error(msg);
  }
  return response.json();
};

export const getCaseAuditTrail = async (caseId: string): Promise<any[]> => {
  const response = await fetch(`${API_BASE_URL}/cases/${caseId}/audit`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    let msg = 'Failed to load case audit trail';
    try {
      const err = await response.json();
      if (err.detail) msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
    } catch {}
    throw new Error(msg);
  }
  return response.json();
};

export interface AbdmVerificationResult {
  success: boolean;
  mode: string;
  data: {
    abhaId: string;
    kycStatus: string;
    name: string;
    message: string;
  };
}

export const verifyAbha = async (abhaId: string): Promise<AbdmVerificationResult> => {
  const response = await fetch(`${API_BASE_URL}/abdm/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ abhaId }),
  });

  if (!response.ok) {
    let msg = 'ABHA verification failed';
    try {
      const err = await response.json();
      if (err.detail) msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
    } catch {}
    throw new Error(msg);
  }

  return response.json();
};

export interface AbdmLinkResult {
  success: boolean;
  mode: string;
  data: {
    abhaId: string;
    caseId: string;
    status: string;
    timestamp: string;
  };
}

export const linkCareContext = async (abhaId: string, caseId: string): Promise<AbdmLinkResult> => {
  const response = await fetch(`${API_BASE_URL}/abdm/link-context`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ abhaId, caseId }),
  });

  if (!response.ok) {
    let msg = 'Failed to link care context to ABDM profile';
    try {
      const err = await response.json();
      if (err.detail) msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
    } catch {}
    throw new Error(msg);
  }

  return response.json();
};

export interface AdminQueueResponse {
  statusCounts: {
    intake: number;
    patient_verifying: number;
    doctor_review: number;
    completed: number;
    total: number;
  };
  cases: Array<{
    caseId: string;
    patientId: string;
    language: string;
    consultationType: string;
    status: string;
    hasRedFlags: boolean;
    redFlagCount: number;
    chiefComplaint: string;
    redFlags: Array<{
      category: string;
      severity: string;
      explanation: string;
      evidence: string;
      acknowledged: boolean;
    }>;
    lastUpdated: string | null;
  }>;
  redFlagAlerts: Array<{
    caseId: string;
    patientId: string;
    category: string;
    severity: string;
    explanation: string;
    evidence: string;
    acknowledged: boolean;
    caseStatus: string;
    updatedAt: string | null;
  }>;
}

export const getAdminQueue = async (): Promise<AdminQueueResponse> => {
  const response = await fetch(`${API_BASE_URL}/admin/queue`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    throw new Error('Failed to load admin queue');
  }
  return response.json();
};

export const acknowledgeAdminAlert = async (caseId: string, category: string, explanation?: string): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/admin/alerts/acknowledge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ caseId, category, explanation }),
  });
  if (!response.ok) {
    throw new Error('Failed to acknowledge alert');
  }
  return response.json();
};

export const logout = async (): Promise<void> => {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
      },
    });
  } catch {}
  localStorage.removeItem('medmap_token');
  localStorage.removeItem('medmap_role');
  sessionStorage.clear();
};
