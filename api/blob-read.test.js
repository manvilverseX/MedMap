import test, { mock } from 'node:test';
import assert from 'node:assert';

mock.module('@vercel/blob', {
  exports: {
    head: async (url) => {
      if (url === 'https://test-store.public.blob.vercel-storage.com/file.png') {
        return {
          downloadUrl: 'https://presigned.vercel-storage.com/download/file.png',
          contentType: 'image/png'
        };
      }
      if (url === 'https://test-store.public.blob.vercel-storage.com/nodownload.png') {
        return { contentType: 'image/png' };
      }
      if (url === 'https://test-store.public.blob.vercel-storage.com/failfetch.png') {
        return { downloadUrl: 'https://presigned.vercel-storage.com/download/failfetch.png', contentType: 'image/png' };
      }
      return null;
    }
  }
});

const mockFetch = mock.fn(async (url) => {
  if (url === 'https://presigned.vercel-storage.com/download/file.png') {
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
    };
  }
  if (url === 'https://presigned.vercel-storage.com/download/failfetch.png') {
    return { ok: false, status: 502, json: async () => ({}) };
  }
  return { ok: false, status: 500, json: async () => ({}) };
});
global.fetch = mockFetch;

test('Valid request succeeds and never exposes secret', async () => {
  const handler = (await import('./blob-read.js')).default;
  process.env.SECRET_KEY = 'test-secret';
  const req = { method: 'GET', headers: { 'x-internal-auth': 'test-secret' }, query: { url: 'https://test-store.public.blob.vercel-storage.com/file.png' } };
  let status, headers = {};
  let sentBuffer;
  const res = {
    status: (s) => { status = s; return res; },
    setHeader: (k, v) => { headers[k] = v; return res; },
    send: (b) => { sentBuffer = b; return res; },
    json: () => { return res; }
  };
  await handler(req, res);
  assert.strictEqual(status, 200);
  assert.strictEqual(headers['Content-Type'], 'image/png');
  assert.ok(sentBuffer instanceof Buffer);
  // Ensure secret is nowhere in response
  assert.ok(!sentBuffer.toString().includes('test-secret'));
});

test('Missing x-internal-auth returns 401', async () => {
  const handler = (await import('./blob-read.js')).default;
  process.env.SECRET_KEY = 'test-secret';
  const req = { method: 'GET', headers: {} };
  let status, jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  assert.strictEqual(status, 401);
  assert.strictEqual(jsonBody.error, 'Unauthorized');
  assert.ok(!JSON.stringify(jsonBody).includes('test-secret'));
});

test('Incorrect x-internal-auth returns 401', async () => {
  const handler = (await import('./blob-read.js')).default;
  process.env.SECRET_KEY = 'test-secret';
  const req = { method: 'GET', headers: { 'x-internal-auth': 'wrong-secret' } };
  let status, jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  assert.strictEqual(status, 401);
  assert.ok(!JSON.stringify(jsonBody).includes('test-secret'));
});

test('Missing url returns 400', async () => {
  const handler = (await import('./blob-read.js')).default;
  process.env.SECRET_KEY = 'test-secret';
  const req = { method: 'GET', headers: { 'x-internal-auth': 'test-secret' }, query: {} };
  let status, jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  assert.strictEqual(status, 400);
  assert.ok(!JSON.stringify(jsonBody).includes('test-secret'));
});

test('Malformed URL returns 400', async () => {
  const handler = (await import('./blob-read.js')).default;
  process.env.SECRET_KEY = 'test-secret';
  const req = { method: 'GET', headers: { 'x-internal-auth': 'test-secret' }, query: { url: 'not-a-url' } };
  let status, jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  assert.strictEqual(status, 400);
  assert.ok(!JSON.stringify(jsonBody).includes('test-secret'));
});

test('Non-HTTPS URL returns 400', async () => {
  const handler = (await import('./blob-read.js')).default;
  process.env.SECRET_KEY = 'test-secret';
  const req = { method: 'GET', headers: { 'x-internal-auth': 'test-secret' }, query: { url: 'http://test-store.public.blob.vercel-storage.com/file.png' } };
  let status, jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  assert.strictEqual(status, 400);
});

test('URL with .vercel-storage.com in path returns 400', async () => {
  const handler = (await import('./blob-read.js')).default;
  process.env.SECRET_KEY = 'test-secret';
  const req = { method: 'GET', headers: { 'x-internal-auth': 'test-secret' }, query: { url: 'https://malicious.com/.vercel-storage.com/file.png' } };
  let status, jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  assert.strictEqual(status, 400);
});

test('head() returning no downloadUrl returns 404', async () => {
  const handler = (await import('./blob-read.js')).default;
  process.env.SECRET_KEY = 'test-secret';
  const req = { method: 'GET', headers: { 'x-internal-auth': 'test-secret' }, query: { url: 'https://test-store.public.blob.vercel-storage.com/nodownload.png' } };
  let status, jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  assert.strictEqual(status, 404);
  assert.strictEqual(jsonBody.error, 'Blob not found or not downloadable');
});

test('Failed presigned download returns error', async () => {
  const handler = (await import('./blob-read.js')).default;
  process.env.SECRET_KEY = 'test-secret';
  
  const req = { method: 'GET', headers: { 'x-internal-auth': 'test-secret' }, query: { url: 'https://test-store.public.blob.vercel-storage.com/failfetch.png' } };
  let status, jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  assert.strictEqual(status, 502);
});
