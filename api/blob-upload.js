import { put } from '@vercel/blob';

export const config = {
  runtime: 'edge',
};

const ALLOWED_MIMES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ detail: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ detail: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return new Response(JSON.stringify({ detail: 'Filename missing' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const filename = file.name || 'unnamed';
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    
    if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIMES.includes(file.type)) {
      return new Response(JSON.stringify({ detail: 'Unsupported file format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (file.size > MAX_SIZE) {
      return new Response(JSON.stringify({ detail: 'File too large' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    if (file.size === 0) {
      return new Response(JSON.stringify({ detail: 'File is empty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const uuid = crypto.randomUUID();
    const safeFilename = `${uuid}${ext}`;

    const blob = await put(safeFilename, file, {
      access: 'private',
      contentType: file.type,
      addRandomSuffix: false,
    });

    return new Response(JSON.stringify({
      url: blob.url,
      pathname: blob.pathname,
      filename: filename,
      mimeType: file.type,
      sizeBytes: file.size
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Blob upload error:", error);
    return new Response(JSON.stringify({ detail: 'Failed to upload document to cloud storage' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
