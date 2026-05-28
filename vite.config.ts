import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'google-photos-proxy',
      configureServer(server: ViteDevServer) {
        // 1. Endpoint to scrape photo URLs from Google Photos shared album
        server.middlewares.use('/api/fetch-album', async (req: IncomingMessage, res: ServerResponse) => {
          try {
            const urlObj = new URL(req.url || '', 'http://localhost');
            const albumUrl = urlObj.searchParams.get('url');

            if (!albumUrl) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'url parameter is required' }));
              return;
            }

            console.log(`Fetching Google Photos Shared Album: ${albumUrl}`);

            const response = await fetch(albumUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            });

            if (!response.ok) {
              res.statusCode = response.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: `Failed to fetch album: ${response.statusText}` }));
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

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ urls: finalUrls }));
          } catch (error: any) {
            console.error('Error fetching album:', error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: error.message }));
          }
        });

        // 2. CORS Proxy endpoint for downloading Google Photos images
        server.middlewares.use('/api/proxy-image', async (req: IncomingMessage, res: ServerResponse) => {
          try {
            const urlObj = new URL(req.url || '', 'http://localhost');
            const imageUrl = urlObj.searchParams.get('url');

            if (!imageUrl) {
              res.statusCode = 400;
              res.end('url parameter is required');
              return;
            }

            // Request image with high resolution sizing parameters
            const targetUrl = imageUrl + '=w1600';

            const response = await fetch(targetUrl);
            if (!response.ok) {
              res.statusCode = response.status;
              res.end(`Failed to fetch image: ${response.statusText}`);
              return;
            }

            const contentType = response.headers.get('content-type') || 'image/jpeg';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day

            const arrayBuffer = await response.arrayBuffer();
            res.end(Buffer.from(arrayBuffer));
          } catch (error: any) {
            console.error('Error proxying image:', error);
            res.statusCode = 500;
            res.end(error.message);
          }
        });
      }
    }
  ]
});
