import type { ClinicalCase } from '../types/case';
import type { StringKey } from '../i18n/strings';
import { uploadPresigned } from '@vercel/blob/client';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string = '', status: number = 500) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export async function parseApiError(response: Response | any, defaultMessage: string): Promise<ApiError> {
  let message = defaultMessage;
  let code = (response?.headers?.get ? response.headers.get('x-error-code') : '') || '';
  const status = response?.status || 500;

  try {
    const data = typeof response?.clone === 'function' ? await response.clone().json() : await response?.json?.();
    if (typeof data?.detail === 'object' && data.detail !== null) {
      if (data.detail.code) code = data.detail.code;
      if (data.detail.message) message = data.detail.message;
    } else if (typeof data?.detail === 'string') {
      message = data.detail;
    }
    if (data?.code) {
      code = data.code;
    }
  } catch {
    // response not JSON
  }

  if (!code) {
    const lower = message.toLowerCase();
    if (status === 401 || status === 403 || lower.includes('unauthorized') || lower.includes('not authorized')) {
      code = 'unauthorized';
    } else if (status === 404 || lower.includes('not found')) {
      code = 'case_not_found';
    } else if (status === 429 || lower.includes('rate limit')) {
      code = 'rate_limit';
    } else if (lower.includes('file too large') || lower.includes('too large')) {
      code = 'file_too_large';
    } else if (lower.includes('unsupported') || lower.includes('format')) {
      code = 'unsupported_file';
    } else if (lower.includes('empty')) {
      code = 'empty_input';
    } else if (lower.includes('meaningless') || lower.includes('invalid')) {
      code = 'invalid_input';
    } else if (status === 503) {
      code = 'service_unavailable';
    } else {
      code = 'unknown_error';
    }
  }

  return new ApiError(message, code, status);
}

export function mapApiErrorToKey(error: any): StringKey {
  const code = (error?.code || '').toLowerCase();
  const msg = (error?.message || '').toLowerCase();
  const status = error?.status;

  if (status === 429 || code.includes('rate_limit') || msg.includes('rate limit')) {
    return 'errorRateLimit';
  }
  if (status === 401 || status === 403 || code.includes('unauthorized') || msg.includes('unauthorized') || msg.includes('not authorized') || msg.includes('session')) {
    return 'errorUnauthorized';
  }
  if (status === 404 || code.includes('not_found') || msg.includes('not found')) {
    return 'errorCaseNotFound';
  }
  if (code.includes('file_too_large') || msg.includes('file too large') || msg.includes('too large')) {
    return 'documentsFileSizeExceeded';
  }
  if (code.includes('unsupported_file') || msg.includes('unsupported') || msg.includes('format')) {
    return 'documentsUnsupportedFormat';
  }
  if (code.includes('tts_unavailable') || code.includes('stt_unavailable') || code.includes('speech') || msg.includes('speech') || msg.includes('microphone')) {
    return 'errorSpeechUnavailable';
  }
  if (code.includes('translation') || msg.includes('translation')) {
    return 'errorTranslationUnavailable';
  }
  if (code.includes('upload') || msg.includes('upload')) {
    return 'errorUploadFailed';
  }
  if (code.includes('create_case') || msg.includes('create case')) {
    return 'errorFailedCreateCase';
  }
  if (code.includes('load_case') || msg.includes('load case') || msg.includes('load adaptive')) {
    return 'errorFailedLoadCase';
  }
  if (status === 400 || code.includes('invalid') || code.includes('meaningless') || msg.includes('meaningless')) {
    return 'errorInvalidInput';
  }
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('connection')) {
    return 'errorNetwork';
  }
  return 'somethingWentWrong';
}

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
    throw await parseApiError(response, 'Failed to create case');
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
    throw await parseApiError(response, errorDetail !== 'Unknown Error' ? errorDetail : 'Failed to load case');
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

  if (!response.ok) {
    throw await parseApiError(response, 'Failed to load adaptive intake state');
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
    throw await parseApiError(response, 'Failed to update case');
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
    throw await parseApiError(directResponse, 'Failed to upload document');
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

export const synthesizeSpeech = async (text: string, language: string): Promise<Blob> => {
  const response = await fetch(`${API_BASE_URL}/speech/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ text, language }),
  });

  if (!response.ok) {
    let errorDetail = 'tts_unavailable';
    try {
      const errJson = await response.json();
      if (errJson?.detail?.message) {
        errorDetail = errJson.detail.message;
      } else if (errJson?.detail?.code) {
        errorDetail = errJson.detail.code;
      } else if (typeof errJson?.detail === 'string') {
        errorDetail = errJson.detail;
      }
    } catch {}
    throw new Error(errorDetail);
  }

  return await response.blob();
};

export const transcribeSpeech = async (
  audioBlob: Blob,
  filename: string,
  language: string
): Promise<{ transcript: string }> => {
  const formData = new FormData();
  formData.append('file', audioBlob, filename);
  formData.append('language', language);

  const response = await fetch(`${API_BASE_URL}/speech/stt`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
    },
    body: formData,
  });

  if (!response.ok) {
    let errorDetail = 'stt_unavailable';
    try {
      const errJson = await response.json();
      if (errJson?.detail?.code) {
        errorDetail = errJson.detail.code;
      }
    } catch {}
    throw new Error(errorDetail);
  }

  return await response.json();
};

