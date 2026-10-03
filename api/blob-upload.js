import { handleUploadPresigned } from '@vercel/blob/client';
import { issueSignedToken } from '@vercel/blob';
import * as jose from 'jose';

const ALLOWED_MIMES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export default async function handler(req, res) {
  // Evaluated per-request so tests can set process.env.VERCEL before calling.
  // True when running inside a Vercel deployment (preview or production).
  // In local development (plain `vite dev`) this is always false.
  const isVercelDeployment = process.env.VERCEL === '1';
  if (req.method !== 'POST') {
    return res.status(405).json({ detail: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ detail: 'Not authenticated' });
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.SECRET_KEY;

    if (!secret) {
      console.error("SECRET_KEY environment variable missing");
      return res.status(500).json({ detail: 'Internal server error' });
    }

    let userPayload;
    try {
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jose.jwtVerify(token, secretKey, {
        algorithms: ['HS256']
      });
      userPayload = payload;
    } catch (err) {
      console.error("JWT verification failed:", err);
      return res.status(401).json({ detail: 'Invalid token' });
    }

    const role = userPayload.role;
    if (role !== 'patient' && role !== 'doctor') {
      return res.status(401).json({ detail: 'Invalid role' });
    }

    // Vercel serverless parses JSON body automatically; Vite dev middleware
    // pre-parses it in vite.config.ts.
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ detail: 'Invalid JSON body' });
      }
    }

    // In local development, BLOB_READ_WRITE_TOKEN and VERCEL_BLOB_API_URL must
    // be set in .env.local to route blob calls to the local Vite mock server.
    // On Vercel (preview/production) those variables are absent and the SDK
    // uses OIDC + BLOB_STORE_ID automatically.
    if (!isVercelDeployment && !process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({
        detail: 'Local development requires BLOB_READ_WRITE_TOKEN and VERCEL_BLOB_API_URL ' +
                'to be set in .env.local (see project README for local setup instructions).'
      });
    }

    const jsonResponse = await handleUploadPresigned({
      body,
      request: req,
      getSignedToken: async (pathname, clientPayload, _multipart) => {
        const caseId = clientPayload;

        if (!caseId) {
          throw new Error('caseId missing');
        }

        if (role === 'patient' && userPayload.case_id !== caseId) {
          throw new Error('Not authorized for this case');
        }

        if (!pathname.startsWith(`${caseId}/`)) {
          throw new Error('Pathname must be restricted to the case directory');
        }

        const ext = pathname.substring(pathname.lastIndexOf('.')).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          throw new Error('Unsupported file format');
        }

        const validUntil = Date.now() + 60 * 60 * 1000;

        const tokenOptions = {
          pathname,
          allowedContentTypes: ALLOWED_MIMES,
          maximumSizeInBytes: MAX_SIZE,
          validUntil,
          operations: ['put']
        };

        // On Vercel the SDK resolves OIDC credentials automatically from the
        // environment — no explicit token field is needed.
        // In local development we pass the static read-write token explicitly.
        if (!isVercelDeployment) {
          tokenOptions.token = process.env.BLOB_READ_WRITE_TOKEN;
        }

        const signedToken = await issueSignedToken(tokenOptions);
        return { token: signedToken };
      }
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error("Blob handler error:", error.message);
    return res.status(400).json({ detail: error.message || 'Blob upload token generation failed' });
  }
}
