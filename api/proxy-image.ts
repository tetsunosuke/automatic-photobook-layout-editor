import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const imageUrl = req.query.url as string;

    if (!imageUrl) {
      res.status(400).send('url parameter is required');
      return;
    }

    // Request image with high resolution sizing parameters
    const targetUrl = imageUrl + '=w1600';

    const response = await fetch(targetUrl);
    if (!response.ok) {
      res.status(response.status).send(`Failed to fetch image: ${response.statusText}`);
      return;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.status(200).send(buffer);
  } catch (error: any) {
    console.error('Error proxying image:', error);
    res.status(500).send(error.message);
  }
}
