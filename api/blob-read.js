import { get } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  // Verify an internal shared secret to bypass Vercel deployment protection
  const internalSecret = req.headers['x-internal-secret'];
  if (process.env.INTERNAL_API_SECRET && internalSecret !== process.env.INTERNAL_API_SECRET) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const blobResult = await get(url, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
      access: 'private',
    });

    if (!blobResult || !blobResult.stream) {
      return res.status(404).send('Blob not found');
    }

    res.setHeader('Content-Type', blobResult.contentType || 'image/jpeg');
    // Pipe or send blob bytes
    const arrayBuffer = await blobResult.blob.arrayBuffer();
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error("blob-read error:", err.message);
    return res.status(500).send(err.message);
  }
}
