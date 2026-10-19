import { test, expect, vi } from 'vitest';
import handler from './blob-read.js';

const getMock = vi.fn(async (url, options) => {
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
    return null;
  }
  return null;
});

vi.mock('@vercel/blob', () => ({
  get: (...args) => getMock(...args),
}));

test('Valid request succeeds and never exposes secret', async () => {
  getMock.mockClear();
  process.env.SECRET_KEY = 'test-secret';
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const req = {
    method: 'GET',
    headers: { 'x-internal-auth': 'test-secret' },
    query: { url: 'https://test-store.public.blob.vercel-storage.com/file.png' }
  };
  let status = 0;
  const headers = {};
  let sentBuffer;
  const res = {
    status: (s) => { status = s; return res; },
    setHeader: (k, v) => { headers[k] = v; return res; },
    send: (b) => { sentBuffer = b; return res; },
    json: () => { return res; }
  };
  await handler(req, res);
  expect(status).toBe(200);
  expect(headers['Content-Type']).toBe('image/png');
  expect(sentBuffer instanceof Buffer).toBe(true);
  expect(sentBuffer.toString().includes('test-secret')).toBe(false);
  expect(getMock).toHaveBeenCalledTimes(1);
  expect(getMock.mock.calls[0][0]).toBe('https://test-store.public.blob.vercel-storage.com/file.png');
  expect(getMock.mock.calls[0][1]).toEqual({ access: 'private' });
});

test('Missing x-internal-auth returns 401', async () => {
  process.env.SECRET_KEY = 'test-secret';
  const req = { method: 'GET', headers: {} };
  let status = 0;
  let jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  expect(status).toBe(401);
  expect(jsonBody.error).toBe('Unauthorized');
  expect(JSON.stringify(jsonBody).includes('test-secret')).toBe(false);
});

test('Incorrect x-internal-auth returns 401', async () => {
  process.env.SECRET_KEY = 'test-secret';
  const req = { method: 'GET', headers: { 'x-internal-auth': 'wrong-secret' } };
  let status = 0;
  let jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  expect(status).toBe(401);
  expect(JSON.stringify(jsonBody).includes('test-secret')).toBe(false);
});

test('Missing url returns 400', async () => {
  process.env.SECRET_KEY = 'test-secret';
  const req = { method: 'GET', headers: { 'x-internal-auth': 'test-secret' }, query: {} };
  let status = 0;
  let jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  expect(status).toBe(400);
  expect(JSON.stringify(jsonBody).includes('test-secret')).toBe(false);
});

test('Malformed URL returns 400', async () => {
  process.env.SECRET_KEY = 'test-secret';
  const req = { method: 'GET', headers: { 'x-internal-auth': 'test-secret' }, query: { url: 'not-a-url' } };
  let status = 0;
  let jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  expect(status).toBe(400);
  expect(JSON.stringify(jsonBody).includes('test-secret')).toBe(false);
});

test('Non-HTTPS URL returns 400', async () => {
  process.env.SECRET_KEY = 'test-secret';
  const req = { method: 'GET', headers: { 'x-internal-auth': 'test-secret' }, query: { url: 'http://test-store.public.blob.vercel-storage.com/file.png' } };
  let status = 0;
  let jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  expect(status).toBe(400);
});

test('URL with .vercel-storage.com in path returns 400', async () => {
  process.env.SECRET_KEY = 'test-secret';
  const req = { method: 'GET', headers: { 'x-internal-auth': 'test-secret' }, query: { url: 'https://malicious.com/.vercel-storage.com/file.png' } };
  let status = 0;
  let jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  expect(status).toBe(400);
});

test('get() returning no blob returns 404', async () => {
  process.env.SECRET_KEY = 'test-secret';
  const req = { method: 'GET', headers: { 'x-internal-auth': 'test-secret' }, query: { url: 'https://test-store.public.blob.vercel-storage.com/nodownload.png' } };
  let status = 0;
  let jsonBody;
  const res = {
    status: (s) => { status = s; return res; },
    json: (j) => { jsonBody = j; return res; }
  };
  await handler(req, res);
  expect(status).toBe(404);
  expect(jsonBody.error).toBe('Blob not found or not downloadable');
});
