console.log('Testing Node native fetch...');
const albumUrl = 'https://photos.app.goo.gl/cio5SYUadCJCBpfy6';

async function run() {
  try {
    console.log('Fetching', albumUrl);
    const response = await fetch(albumUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response redirected:', response.redirected);
    console.log('Response URL:', response.url);
    
    const html = await response.text();
    console.log('HTML Loaded. Length:', html.length);
    
    const regex = /https:\/\/lh3\.googleusercontent\.com\/pw\/[a-zA-Z0-9\-_]{50,}/g;
    const matches = html.match(regex) || [];
    console.log('Unique matches:', new Set(matches).size);
    process.exit(0);
  } catch (err) {
    console.error('Error with native fetch:', err);
    process.exit(1);
  }
}

run();
