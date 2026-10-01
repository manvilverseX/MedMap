import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// ---------------------------------------------------------------------------
// env loader — makes ALL .env.local variables (not just VITE_-prefixed ones)
// available in process.env for server-side middleware and the blob handler.
// This mirrors what Vercel's runtime does: every project env var is in
// process.env.  Production needs no change (Vercel populates process.env).
// ---------------------------------------------------------------------------
const envLoaderPlugin = ({ mode }: { mode: string }) => ({
  name: 'env-loader',
  config() {
    const env = loadEnv(mode, process.cwd(), '') // '' prefix = all vars
    for (const [k, v] of Object.entries(env)) {
      if (!(k in process.env)) process.env[k] = v
    }
  },
})

// ---------------------------------------------------------------------------
// Local Blob mock
//
// When VERCEL_BLOB_API_URL=http://localhost:5173 is set, @vercel/blob routes
// all SDK calls (issueSignedToken, PUT upload) to this Vite dev server
// instead of the real Vercel API.  We intercept two paths:
//
//   POST /signed-token   – issueSignedToken() → return a delegation token
//   PUT  /?pathname=…    – actual file upload → save to .vercel-blob-local/
//
// Production (Vercel preview / production) has no VERCEL_BLOB_API_URL, so
// the real Vercel Blob API with OIDC is used unchanged.
// ---------------------------------------------------------------------------

const LOCAL_BLOB_DIR = path.resolve(process.cwd(), '.vercel-blob-local')

function ensureBlobDir() {
  if (!fs.existsSync(LOCAL_BLOB_DIR)) {
    fs.mkdirSync(LOCAL_BLOB_DIR, { recursive: true })
  }
}

// Build a minimal delegation token the client SDK can parse.
// Format expected by parseStoreIdFromDelegationToken:
//   base64url(JSON { storeId, pathname, validUntil, operations, ... }) + "." + signature
function buildLocalDelegationToken(storeId: string, opts: {
  pathname: string
  validUntil: number
  maximumSizeInBytes: number
  allowedContentTypes: string[]
  operations: string[]
}) {
  const payload = JSON.stringify({
    storeId,
    pathname: opts.pathname,
    validUntil: opts.validUntil,
    maximumSizeInBytes: opts.maximumSizeInBytes,
    allowedContentTypes: opts.allowedContentTypes,
    operations: opts.operations,
  })
  const b64 = Buffer.from(payload).toString('base64url')
  // The client SDK only reads the payload segment (before the dot).
  // Use a fixed local signing key so clientSigningToken HMAC works.
  const sig = crypto.createHmac('sha256', 'local-dev-signing-key').update(b64).digest('base64url')
  return { delegationToken: `${b64}.${sig}`, clientSigningToken: 'local-dev-signing-key' }
}

const localBlobMockPlugin = () => ({
  name: 'local-blob-mock',
  configureServer(server: any) {
    // -----------------------------------------------------------------------
    // 1.  POST /signed-token  →  issueSignedToken() response
    // -----------------------------------------------------------------------
    server.middlewares.use('/signed-token', (req: any, res: any, next: any) => {
      if (req.method !== 'POST') return next()

      // The real Vercel API requires auth; we accept any Bearer token here.
      let rawBody = ''
      req.on('data', (c: any) => { rawBody += c })
      req.on('end', () => {
        try {
          const body = rawBody ? JSON.parse(rawBody) : {}
          const storeId = req.headers['x-vercel-blob-store-id'] || 'YBjQMVFlVOtreT3H'
          const validUntil = body.validUntil ?? (Date.now() + 3600_000)
          const { delegationToken, clientSigningToken } = buildLocalDelegationToken(storeId, {
            pathname: body.pathname ?? '*',
            validUntil,
            maximumSizeInBytes: body.maximumSizeInBytes ?? 10 * 1024 * 1024,
            allowedContentTypes: body.allowedContentTypes ?? [],
            operations: body.operations ?? ['put'],
          })
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ delegationToken, clientSigningToken }))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: { code: 'local_blob_error', message: String(err) } }))
        }
      })
    })

    // -----------------------------------------------------------------------
    // 2.  PUT /?pathname=…   →  save file, return blob metadata
    // -----------------------------------------------------------------------
    server.middlewares.use('/', (req: any, res: any, next: any) => {
      if (req.method !== 'PUT') return next()
      const urlObj = new URL(req.url, 'http://localhost')
      const pathname = urlObj.searchParams.get('pathname')
      if (!pathname) return next()

      ensureBlobDir()
      const safeName = pathname.replace(/[^a-zA-Z0-9._/-]/g, '_')
      const filePath = path.join(LOCAL_BLOB_DIR, safeName)
      fs.mkdirSync(path.dirname(filePath), { recursive: true })

      const chunks: Buffer[] = []
      req.on('data', (c: any) => chunks.push(c))
      req.on('end', () => {
        const buf = Buffer.concat(chunks)
        fs.writeFileSync(filePath, buf)
        const localUrl = `http://localhost:5173/.vercel-blob-local/${safeName}`
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({
          url: localUrl,
          downloadUrl: localUrl + '?download=1',
          pathname,
          contentType: req.headers['content-type'] ?? 'application/octet-stream',
          contentDisposition: `attachment; filename="${path.basename(pathname)}"`,
        }))
      })
    })
  },
})

// ---------------------------------------------------------------------------
// Blob upload handler middleware
//
// Routes POST /api/blob-upload to api/blob-upload.js so the Vite dev server
// behaves like Vercel's serverless runtime in preview/production.
// ---------------------------------------------------------------------------
const blobUploadMiddleware = () => ({
  name: 'blob-upload-middleware',
  configureServer(server: any) {
    server.middlewares.use('/api/blob-upload', (req: any, res: any) => {
      let rawBody = ''
      req.on('data', (chunk: any) => { rawBody += chunk })
      req.on('end', async () => {
        // Parse the JSON body so the handler sees req.body as an object,
        // matching the behaviour of Vercel's serverless body-parser.
        try {
          req.body = rawBody ? JSON.parse(rawBody) : {}
        } catch {
          req.body = rawBody
        }

        // Provide the Express-style res.status(n).json(obj) helpers that
        // the handler relies on (Node's raw ServerResponse lacks them).
        res.status = (code: number) => {
          res.statusCode = code
          return res
        }
        res.json = (data: any) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        }

        try {
          // Dynamic import keeps the module cache fresh across edits.
          // @ts-ignore
          const { default: handle } = await import('./api/blob-upload.js')
          await handle(req, res)
        } catch (err) {
          console.error('blob-upload middleware error:', err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ detail: 'Internal server error' }))
        }
      })
    })
  },
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), envLoaderPlugin({ mode }), localBlobMockPlugin(), blobUploadMiddleware()],
}))
