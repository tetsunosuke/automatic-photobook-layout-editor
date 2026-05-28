import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const albumUrl = req.query.url as string;

    if (!albumUrl) {
      res.status(400).json({ error: 'url parameter is required' });
      return;
    }

    console.log(`Fetching Google Photos Shared Album: ${albumUrl}`);

    const response = await fetch(albumUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      res.status(response.status).json({ error: `Failed to fetch album: ${response.statusText}` });
      return;
    }

    const html = await response.text();
    
    // Pattern to match high-resolution image URLs in Google Photos page source
    const regex = /https:\/\/lh3\.googleusercontent\.com\/pw\/[a-zA-Z0-9\-_]{50,}/g;
    const matches = html.match(regex) || [];

    // Deduplicate base URLs
    const baseUrls = Array.from(new Set(matches)).map(url => {
      const index = url.indexOf('=');
      return index !== -1 ? url.substring(0, index) : url;
    });

    const finalUrls = Array.from(new Set(baseUrls));
    console.log(`Found ${finalUrls.length} unique photos in album`);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    res.status(200).json({ urls: finalUrls });
  } catch (error: any) {
    console.error('Error fetching album:', error);
    res.status(500).json({ error: error.message });
  }
}
