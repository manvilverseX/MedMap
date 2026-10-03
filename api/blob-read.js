import { get } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const internalAuth = req.headers['x-internal-auth'];
  const secret = process.env.SECRET_KEY;

  if (!secret) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (internalAuth !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const blobUrl = req.query.url;
  if (!blobUrl || typeof blobUrl !== 'string') {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Validate it's a vercel blob URL to prevent arbitrary proxying
  let parsedUrl;
  try {
    parsedUrl = new URL(blobUrl);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname.endsWith('.vercel-storage.com')) {
    return res.status(400).json({ error: 'Invalid blob URL' });
  }

  try {
    // Get the private blob directly using the SDK
    const result = await get(blobUrl, { access: 'private' });
    
    if (!result) {
      return res.status(404).json({ error: 'Blob not found or not downloadable' });
    }

    const { stream, blob } = result;

    // Stream the file back to the requester
    const contentType = blob?.contentType || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("blob-read error:", error.message);
    return res.status(500).json({ error: 'Failed to read blob' });
  }
}
