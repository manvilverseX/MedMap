import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadDocument } from '../utils/api';

describe('Document Upload Fallback in api.ts', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('medmap_token', 'test-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('falls back to direct multipart/form-data POST when Vercel Blob upload fails', async () => {
    const validBlob = new Blob(['dummy pdf content'], { type: 'application/pdf' });
    const validFile = new File([validBlob], 'report.pdf', { type: 'application/pdf' });

    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      if (url.includes('/api/blob-upload')) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ detail: 'Blob token error' }),
        };
      }
      if (url.includes('/cases/case-123/documents')) {
        expect(options.method).toBe('POST');
        expect(options.body instanceof FormData).toBe(true);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            documentId: 'doc-fallback-1',
            caseId: 'case-123',
            filename: 'report.pdf',
            storagePath: 'local://documents/doc-fallback-1.pdf',
            extractionStatus: 'pending',
          }),
        };
      }
      return { ok: false, status: 404 };
    });

    const result = await uploadDocument('case-123', validFile);
    expect(result).toBeDefined();
    expect(result.documentId).toBe('doc-fallback-1');
    expect(result.storagePath).toContain('local://');
  });

  it('handles backend error during direct upload fallback', async () => {
    const validBlob = new Blob(['dummy content'], { type: 'image/jpeg' });
    const validFile = new File([validBlob], 'scan.jpg', { type: 'image/jpeg' });

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/blob-upload')) {
        throw new Error('Network error on Vercel Blob');
      }
      if (url.includes('/cases/case-123/documents')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ detail: 'Direct upload rejected by server' }),
        };
      }
      return { ok: false, status: 404 };
    });

    await expect(uploadDocument('case-123', validFile)).rejects.toThrow(
      /Direct upload rejected by server/i
    );
  });

  it('includes auth headers when making direct upload request', async () => {
    const validBlob = new Blob(['dummy content'], { type: 'application/pdf' });
    const validFile = new File([validBlob], 'test.pdf', { type: 'application/pdf' });

    let capturedHeaders: any = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      if (url.includes('/cases/case-123/documents')) {
        capturedHeaders = options.headers;
        return {
          ok: true,
          status: 200,
          json: async () => ({ documentId: 'doc-auth-test', success: true }),
        };
      }
      return { ok: false, status: 404 };
    });

    await uploadDocument('case-123', validFile);
    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders.Authorization).toBe('Bearer test-token');
  });
});
