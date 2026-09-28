import { put } from '@vercel/blob';
import * as jose from 'jose';
import Busboy from 'busboy';
import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false,
  },
};

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

    try {
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jose.jwtVerify(token, secretKey);
      req.userPayload = payload;
    } catch (err) {
      console.error("JWT verification failed:", err);
      return res.status(401).json({ detail: 'Invalid token' });
    }

    const role = req.userPayload.role;
    if (role !== 'patient' && role !== 'doctor') {
      return res.status(401).json({ detail: 'Invalid role' });
    }

    // Parse multipart data
    return new Promise((resolve, reject) => {
      let busboy;
      try {
        busboy = Busboy({ headers: req.headers, limits: { fileSize: MAX_SIZE } });
      } catch (err) {
        return resolve(res.status(400).json({ detail: 'Invalid multipart payload' }));
      }
      
      let caseId = null;
      let fileBuffer = null;
      let fileMime = null;
      let fileName = null;

      busboy.on('field', (name, val) => {
        if (name === 'caseId') {
          caseId = val;
        }
      });

      busboy.on('file', (name, file, info) => {
        if (name === 'file') {
          fileName = info.filename || 'unnamed';
          fileMime = info.mimeType;
          const chunks = [];
          file.on('data', (data) => chunks.push(data));
          file.on('end', () => {
            fileBuffer = Buffer.concat(chunks);
          });
        } else {
          file.resume(); // Ignore other files
        }
      });

      busboy.on('finish', async () => {
        if (!caseId) {
          return resolve(res.status(400).json({ detail: 'caseId missing' }));
        }

        if (role === 'patient' && req.userPayload.case_id !== caseId) {
          return resolve(res.status(403).json({ detail: 'Not authorized for this case' }));
        }

        if (!fileBuffer) {
          return resolve(res.status(400).json({ detail: 'Filename missing' }));
        }

        if (fileBuffer.length === 0) {
          return resolve(res.status(400).json({ detail: 'File is empty' }));
        }

        const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
        
        if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIMES.includes(fileMime)) {
          return resolve(res.status(400).json({ detail: 'Unsupported file format' }));
        }

        try {
          const uuid = crypto.randomUUID();
          const safeFilename = `${uuid}${ext}`;

          const blob = await put(safeFilename, fileBuffer, {
            access: 'private',
            contentType: fileMime,
            addRandomSuffix: false,
          });

          return resolve(res.status(200).json({
            url: blob.url,
            pathname: blob.pathname,
            filename: fileName,
            mimeType: fileMime,
            sizeBytes: fileBuffer.length
          }));
        } catch (uploadError) {
          console.error("Blob upload error:", uploadError);
          return resolve(res.status(500).json({ detail: 'Failed to upload document to cloud storage' }));
        }
      });

      busboy.on('error', (err) => {
        console.error("Busboy error:", err);
        return resolve(res.status(500).json({ detail: 'File parsing error' }));
      });

      req.pipe(busboy);
    });

  } catch (error) {
    console.error("Handler error:", error);
    return res.status(500).json({ detail: 'Internal server error' });
  }
}
