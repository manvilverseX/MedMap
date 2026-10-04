import type { ClinicalCase } from '../types/case';
import { uploadPresigned } from '@vercel/blob/client';

export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1').replace(/\/+$/, '');

const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('medmap_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

export const createCase = async (patientId: string, language?: string, consentGranted?: boolean): Promise<ClinicalCase> => {
  const response = await fetch(`${API_BASE_URL}/cases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ patientId, language, consentGranted }),
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

  if (response.status === 401 || response.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    throw new Error('Failed to load case');
  }

  return response.json();
};

export const getAdaptiveIntakeState = async (caseId: string, mode?: string, questionId?: string): Promise<any> => {
  const params = new URLSearchParams();
  if (mode) params.append('mode', mode);
  if (questionId) params.append('questionId', questionId);
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
  let blobMetadata = null;
  
  try {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const safeFilename = `${caseId}/${crypto.randomUUID()}${ext}`;

    blobMetadata = await uploadPresigned(safeFilename, file, {
      access: 'private',
      handleUploadUrl: '/api/blob-upload',
      clientPayload: caseId,
      headers: { ...getAuthHeaders() }
    });
  } catch (error: any) {
    throw new Error(error.message || 'Blob upload failed');
  }
  
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
  
  if (!response.ok) {
    let errorMessage = 'Failed to upload document';
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
