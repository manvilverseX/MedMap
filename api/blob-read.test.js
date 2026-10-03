import test, { mock } from 'node:test';
import assert from 'node:assert';

const getMock = mock.fn(async (url, options) => {
  if (options?.access !== 'private') return null;
  if (url === 'https://test-store.public.blob.vercel-storage.com/file.png') {
    return {
      blob: { contentType: 'image/png' },
      stream: (async function* () {
        yield new Uint8Array([1, 2, 3]);
      })()
    };
  }
  if (url === 'https://test-store.public.blob.vercel-storage.com/nodownload.png') {
    return null; // Mocking missing blob
  }
  return null;
});

mock.module('@vercel/blob', {
  exports: {
    get: getMock
  }
});

test('Valid request succeeds and never exposes secret', async () => {
  getMock.mock.resetCalls();
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
  
  // Verify get was called correctly
  assert.strictEqual(getMock.mock.calls.length, 1);
  assert.strictEqual(getMock.mock.calls[0].arguments[0], 'https://test-store.public.blob.vercel-storage.com/file.png');
  assert.deepStrictEqual(getMock.mock.calls[0].arguments[1], { access: 'private' });
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

test('get() returning no blob returns 404', async () => {
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
