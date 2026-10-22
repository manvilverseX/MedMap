import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchDocumentBlob, openDocumentFile } from '../utils/api';

describe('Document open and viewing in api.ts', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('medmap_token', 'test-token-123');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches document blob with authorization header and token query parameter', async () => {
    const dummyBlob = new Blob(['pdf-data'], { type: 'application/pdf' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => dummyBlob,
    });

    const result = await fetchDocumentBlob('case-1', 'doc-1');
    expect(result).toBe(dummyBlob);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/cases/case-1/documents/doc-1/file?token=test-token-123'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-123',
        }),
      })
    );
  });

  it('openDocumentFile creates object URL and triggers window.open', async () => {
    const dummyBlob = new Blob(['pdf-data'], { type: 'application/pdf' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => dummyBlob,
    });

    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/mock-uuid');
    const windowOpenSpy = vi.spyOn(window, 'open').mockReturnValue({} as any);

    await openDocumentFile('case-1', 'doc-1');

    expect(createObjectURLSpy).toHaveBeenCalledWith(dummyBlob);
    expect(windowOpenSpy).toHaveBeenCalledWith('blob:http://localhost/mock-uuid', '_blank');
  });

  it('alerts user with friendly message when document is not found or expired', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        detail: 'This file is no longer available, ask the patient to upload again',
      }),
    });

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    await openDocumentFile('case-1', 'doc-missing');

    expect(alertSpy).toHaveBeenCalledWith(
      'This file is no longer available, ask the patient to upload again'
    );
  });
});
