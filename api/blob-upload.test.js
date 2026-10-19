import { test, expect, vi } from 'vitest';
import handler from './blob-upload.js';

vi.mock('@vercel/blob/client', () => ({
  handleUploadPresigned: async (options) => {
    if (options.getSignedToken) {
      try {
        const { token, urlOptions } = await options.getSignedToken(
          options.body?.payload?.pathname || '',
          options.body?.payload?.clientPayload || null,
          false
        );
        return {
          type: 'blob.generate-presigned-url',
          presignedUrlPayload: { delegationToken: token.delegationToken },
          config: token.options,
        };
      } catch (err) {
        throw err;
      }
    }
    return { type: 'blob.generate-presigned-url' };
  },
}));

vi.mock('@vercel/blob', () => ({
  issueSignedToken: async (options) => {
    return { delegationToken: 'fake-delegation-token', options };
  },
}));

vi.mock('jose', () => ({
  jwtVerify: async (token) => {
    if (token === 'valid-patient-token') {
      return { payload: { role: 'patient', case_id: 'case123' } };
    }
    if (token === 'invalid-token') {
      throw new Error('Invalid signature');
    }
    return { payload: {} };
  },
}));

test('unauthenticated request rejected', async () => {
  const req = { method: 'POST', headers: {}, body: {} };
  let status = 0;
  let jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; },
  };
  await handler(req, res);
  expect(status).toBe(400); // Or 401 if body has presigned-url type
});

test('authorized patient gets token for their own case with correct config', async () => {
  process.env.SECRET_KEY = 'secret';
  process.env.VERCEL = '1';
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer valid-patient-token' },
    body: {
      type: 'blob.generate-presigned-url',
      payload: {
        pathname: 'case123/file.pdf',
        clientPayload: 'case123',
      },
    },
  };
  let status = 0;
  let jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; },
  };
  await handler(req, res);
  expect(status).toBe(200);
  expect(jsonBody.type).toBe('blob.generate-presigned-url');
  expect(jsonBody.config.maximumSizeInBytes).toBe(10 * 1024 * 1024);
  expect(jsonBody.config.allowedContentTypes).toEqual([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
  ]);
});

test('invalid JWT rejected', async () => {
  process.env.SECRET_KEY = 'secret';
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer invalid-token' },
    body: {
      type: 'blob.generate-presigned-url',
      payload: { pathname: 'case123/file.pdf', clientPayload: 'case123' },
    },
  };
  let status = 0;
  let jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; },
  };
  await handler(req, res);
  expect(status).toBe(401);
});

test('patient cannot request another case pathname', async () => {
  process.env.SECRET_KEY = 'secret';
  process.env.VERCEL = '1';
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer valid-patient-token' },
    body: {
      type: 'blob.generate-presigned-url',
      payload: {
        pathname: 'othercase/file.pdf',
        clientPayload: 'othercase',
      },
    },
  };
  let status = 0;
  let jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; },
  };
  await handler(req, res);
  expect(status).toBe(400);
  expect(jsonBody.detail).toBe('Not authorized for this case');
});

test('unsupported content type is rejected (by extension)', async () => {
  process.env.SECRET_KEY = 'secret';
  process.env.VERCEL = '1';
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer valid-patient-token' },
    body: {
      type: 'blob.generate-presigned-url',
      payload: {
        pathname: 'case123/file.exe',
        clientPayload: 'case123',
      },
    },
  };
  let status = 0;
  let jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; },
  };
  await handler(req, res);
  expect(status).toBe(400);
  expect(jsonBody.detail).toBe('Unsupported file format');
});
