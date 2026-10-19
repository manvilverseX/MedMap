import { get } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const internalAuth = req.headers['x-internal-auth'];
  const internalSecret = req.headers['x-internal-secret'];
  const secretKey = process.env.SECRET_KEY;
  const internalApiSecret = process.env.INTERNAL_API_SECRET;

  const isAuthorized =
    (secretKey && internalAuth === secretKey) ||
    (internalApiSecret && internalSecret === internalApiSecret);

  if ((secretKey || internalApiSecret) && !isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const query = req.query || {};
  const blobUrl = query.url;
  if (!blobUrl || typeof blobUrl !== 'string') {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Validate it's a vercel blob URL to prevent arbitrary proxying
  let parsedUrl;
  try {
    parsedUrl = new URL(blobUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname.endsWith('.vercel-storage.com')) {
    return res.status(400).json({ error: 'Invalid blob URL' });
  }

  try {
    const blobOptions = { access: 'private' };
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      blobOptions.token = process.env.BLOB_READ_WRITE_TOKEN;
    }
    const result = await get(blobUrl, blobOptions);

    if (!result || (!result.stream && !result.blob)) {
      return res.status(404).json({ error: 'Blob not found or not downloadable' });
    }

    const { stream, blob } = result;
    const contentType = blob?.contentType || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);

    const chunks = [];
    if (stream) {
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
    } else if (blob?.arrayBuffer) {
      chunks.push(Buffer.from(await blob.arrayBuffer()));
    }
    const buffer = Buffer.concat(chunks);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("blob-read error:", error.message);
    return res.status(500).json({ error: 'Failed to read blob' });
  }
}
