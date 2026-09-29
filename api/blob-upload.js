import { handleUpload } from '@vercel/blob/client';
import * as jose from 'jose';

const ALLOWED_MIMES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export default async function handler(req, res) {
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

    // Vercel serverless parses JSON body automatically if bodyParser is not false
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ detail: 'Invalid JSON body' });
      }
    }

    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
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

        return {
          allowedContentTypes: ALLOWED_MIMES,
          maximumSizeInBytes: MAX_SIZE,
          addRandomSuffix: false, // The client generates a unique UUID
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Upload completed, no server-side persistence needed here since the client triggers FastAPI directly.
      }
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error("Handler error:", error);
    return res.status(400).json({ detail: error.message || 'Blob upload token generation failed' });
  }
}
