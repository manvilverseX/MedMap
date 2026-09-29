import test, { mock } from 'node:test';
import assert from 'node:assert';

mock.module('@vercel/blob/client', {
  exports: {
    handleUploadPresigned: async (options) => {
      if (options.getSignedToken) {
        try {
          const { token, urlOptions } = await options.getSignedToken(options.body?.payload?.pathname || '', options.body?.payload?.clientPayload || null, false);
          return { type: 'blob.generate-presigned-url', presignedUrlPayload: { delegationToken: token.delegationToken }, config: token.options };
        } catch (err) {
          throw err;
        }
      }
      return { type: 'blob.generate-presigned-url' };
    }
  }
});

mock.module('@vercel/blob', {
  exports: {
    issueSignedToken: async (options) => {
      return { delegationToken: 'fake-delegation-token', options };
    }
  }
});

mock.module('jose', {
  exports: {
    jwtVerify: async (token) => {
      if (token === 'valid-patient-token') {
        return { payload: { role: 'patient', case_id: 'case123' } };
      }
      if (token === 'invalid-token') {
        throw new Error('Invalid signature');
      }
      return { payload: {} };
    }
  }
});

test('unauthenticated request rejected', async () => {
  const handler = (await import('./blob-upload.js')).default;
  const req = { method: 'POST', headers: {} };
  let status, jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  assert.strictEqual(status, 401);
});

test('authorized patient gets token for their own case with correct config', async () => {
  const handler = (await import('./blob-upload.js')).default;
  process.env.SECRET_KEY = 'secret';
  const req = { 
    method: 'POST', 
    headers: { authorization: 'Bearer valid-patient-token' },
    body: {
      type: 'blob.generate-presigned-url',
      payload: {
        pathname: 'case123/file.pdf',
        clientPayload: 'case123'
      }
    }
  };
  let status, jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  assert.strictEqual(status, 200);
  assert.strictEqual(jsonBody.type, 'blob.generate-presigned-url');
  assert.strictEqual(jsonBody.config.maximumSizeInBytes, 10 * 1024 * 1024);
  assert.deepStrictEqual(jsonBody.config.allowedContentTypes, ["application/pdf", "image/png", "image/jpeg", "image/webp"]);
});

test('invalid JWT rejected', async () => {
  const handler = (await import('./blob-upload.js')).default;
  const req = { method: 'POST', headers: { authorization: 'Bearer invalid-token' } };
  let status, jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  assert.strictEqual(status, 401);
});

test('patient cannot request another case pathname', async () => {
  const handler = (await import('./blob-upload.js')).default;
  const req = { 
    method: 'POST', 
    headers: { authorization: 'Bearer valid-patient-token' },
    body: {
      type: 'blob.generate-presigned-url',
      payload: {
        pathname: 'othercase/file.pdf',
        clientPayload: 'othercase'
      }
    }
  };
  let status, jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  assert.strictEqual(status, 400);
  assert.strictEqual(jsonBody.detail, 'Not authorized for this case');
});

test('unsupported content type is rejected (by extension)', async () => {
  const handler = (await import('./blob-upload.js')).default;
  const req = { 
    method: 'POST', 
    headers: { authorization: 'Bearer valid-patient-token' },
    body: {
      type: 'blob.generate-presigned-url',
      payload: {
        pathname: 'case123/file.exe',
        clientPayload: 'case123'
      }
    }
  };
  let status, jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  assert.strictEqual(status, 400);
  assert.strictEqual(jsonBody.detail, 'Unsupported file format');
});
