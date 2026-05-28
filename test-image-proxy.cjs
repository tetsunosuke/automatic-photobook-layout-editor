const https = require('https');

const imageUrl = 'https://lh3.googleusercontent.com/pw/AP1GczM6ew1jajQchI8cYAUKIFQ2J_gNop58Y4l7U5q6-F4XQY9SZUZFjE3fPzjGwNV2W9V54UuDErNKasTzkU2j5PVfhoq6qVMTv1fU4YYI-zNbk27lhb4=w1600';

console.log('Fetching image from CDN...');
https.get(imageUrl, (res) => {
  console.log('Status code:', res.statusCode);
  console.log('Headers:', res.headers);
  
  if (res.statusCode !== 200) {
    console.error('Failed with status:', res.statusCode);
    process.exit(1);
  }
  
  let size = 0;
  res.on('data', (chunk) => {
    size += chunk.length;
  });
  
  res.on('end', () => {
    console.log('Image download completed successfully. Total bytes:', size);
    process.exit(0);
  });
}).on('error', (err) => {
  console.error('Error fetching image:', err);
  process.exit(1);
});
