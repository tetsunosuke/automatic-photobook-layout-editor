const fs = require('fs');
const path = require('path');
const https = require('https');

const modelsDir = path.join(__dirname, 'public', 'models');

const manifests = [
  'tiny_face_detector_model-weights_manifest.json',
  'face_landmark_68_model-weights_manifest.json',
  'face_recognition_model-weights_manifest.json'
];

const baseUrl = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model/';

// Ensure models directory exists
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: Status code ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function downloadAll() {
  console.log('Starting Face-API models download...');
  
  for (const manifest of manifests) {
    const manifestDest = path.join(modelsDir, manifest);
    const manifestUrl = baseUrl + manifest;
    
    console.log(`Downloading manifest: ${manifest}...`);
    try {
      await downloadFile(manifestUrl, manifestDest);
      console.log(`Downloaded manifest ${manifest}`);
      
      // Read and parse manifest to get the bin/shard files
      const content = fs.readFileSync(manifestDest, 'utf8');
      const data = JSON.parse(content);
      
      // Get all paths
      const pathsToDownload = [];
      for (const group of data) {
        if (group.paths && Array.isArray(group.paths)) {
          pathsToDownload.push(...group.paths);
        }
      }
      
      console.log(`Manifest ${manifest} references paths:`, pathsToDownload);
      
      for (const binPath of pathsToDownload) {
        const binDest = path.join(modelsDir, binPath);
        const binUrl = baseUrl + binPath;
        console.log(`Downloading weights file: ${binPath} from ${binUrl}...`);
        await downloadFile(binUrl, binDest);
        console.log(`Downloaded weights file: ${binPath}`);
      }
      
    } catch (err) {
      console.error(`Error processing manifest ${manifest}:`, err.message);
      process.exit(1);
    }
  }
  
  console.log('All Face-API models and weights downloaded successfully!');
}

downloadAll();
