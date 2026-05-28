const https = require('https');

const url = 'https://photos.app.goo.gl/cio5SYUadCJCBpfy6';

function fetchUrl(targetUrl) {
  return new Promise((resolve, reject) => {
    https.get(targetUrl, (res) => {
      // Follow redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`Redirected to: ${res.headers.location}`);
        resolve(fetchUrl(res.headers.location));
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Failed to load page: ${res.statusCode} ${res.statusMessage}`));
        return;
      }

      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

fetchUrl(url)
  .then((html) => {
    console.log('HTML Loaded. Length:', html.length);
    
    // Test regex
    const regex = /https:\/\/lh3\.googleusercontent\.com\/pw\/[a-zA-Z0-9\-_]{50,}/g;
    const matches = html.match(regex) || [];
    console.log('Total matches found:', matches.length);
    
    const unique = Array.from(new Set(matches));
    console.log('Unique matches:', unique.length);
    if (unique.length > 0) {
      console.log('First 5 unique matches:');
      console.log(unique.slice(0, 5));
    } else {
      // Let's write html to a file to inspect if matches are empty
      const fs = require('fs');
      fs.writeFileSync('debug-page.html', html);
      console.log('No matches found. Wrote page HTML to debug-page.html');
      
      // Check other patterns (e.g. googleusercontent.com without /pw/)
      const generalRegex = /https:\/\/lh3\.googleusercontent\.com\/[a-zA-Z0-9\-_]{50,}/g;
      const generalMatches = html.match(generalRegex) || [];
      console.log('General googleusercontent matches:', generalMatches.length);
      console.log('First 5 general matches:', Array.from(new Set(generalMatches)).slice(0, 5));
    }
  })
  .catch((err) => {
    console.error('Error fetching:', err);
  });
