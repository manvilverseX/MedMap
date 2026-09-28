import type { ClinicalCase } from '../types/case';

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

export const uploadDocument = async (caseId: string, file: File): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('caseId', caseId);
  
  // Attempt JS Vercel Blob Upload
  let blobMetadata = null;
  
  try {
    const blobRes = await fetch('/api/blob-upload', {
      method: 'POST',
      headers: { ...getAuthHeaders() },
      body: formData
    });
    
    if (blobRes.ok) {
      blobMetadata = await blobRes.json();
    } else if (blobRes.status !== 404 && blobRes.status !== 405 && blobRes.status !== 502) {
      let err;
      try { err = await blobRes.json(); } catch(e) { err = {}; }
      throw new Error(err.detail || 'Blob upload failed');
    }
  } catch (error: any) {
    if (error.message !== 'Failed to fetch' && !error.message.includes('Blob upload failed')) {
      throw error;
    }
  }
  
  // If blob succeeded, send metadata. Otherwise, fallback to sending file.
  let finalBody;
  
  if (blobMetadata) {
    finalBody = new FormData();
    finalBody.append('metadata', JSON.stringify(blobMetadata));
  } else {
    finalBody = formData;
  }
  
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
