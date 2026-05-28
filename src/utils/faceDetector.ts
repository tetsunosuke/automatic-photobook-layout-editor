import * as faceapi from '@vladmandic/face-api';

let modelsLoaded = false;

// Load Face-API models from /models directory
export async function loadFaceApiModels(): Promise<void> {
  if (modelsLoaded) return;
  const MODEL_URL = '/models';
  
  try {
    // Load TinyFaceDetector, Landmarks and Recognition models
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    modelsLoaded = true;
    console.log('FaceAPI models loaded successfully.');
  } catch (error) {
    console.error('Failed to load FaceAPI models:', error);
    throw error;
  }
}

export interface DetectedFace {
  id: string;
  box: { x: number; y: number; width: number; height: number }; // relative [0..1]
  descriptor: number[];
  avatarDataUrl?: string; // base64 thumbnail of the cropped face
}

// Helper to convert Blob to HTMLImageElement
export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

// Detect all faces in an HTMLImageElement
export async function detectFaces(image: HTMLImageElement): Promise<DetectedFace[]> {
  await loadFaceApiModels();

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 512, // 512 gives higher accuracy for small/multiple faces
    scoreThreshold: 0.5
  });

  const detections = await faceapi.detectAllFaces(image, options)
    .withFaceLandmarks()
    .withFaceDescriptors();

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  return detections.map((det, index) => {
    const box = det.detection.box;
    
    // Crop face to data URL for avatar
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    let avatarDataUrl = '';
    if (ctx) {
      // Add slight padding to face box for a better looking crop
      const padW = box.width * 0.15;
      const padH = box.height * 0.15;
      const sx = Math.max(0, box.x - padW);
      const sy = Math.max(0, box.y - padH);
      const sw = Math.min(width - sx, box.width + padW * 2);
      const sh = Math.min(height - sy, box.height + padH * 2);
      
      try {
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, 96, 96);
        avatarDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      } catch (e) {
        console.error('Failed to crop face avatar:', e);
      }
    }

    return {
      id: `face_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
      box: {
        x: Math.max(0, box.x / width),
        y: Math.max(0, box.y / height),
        width: Math.min(1, box.width / width),
        height: Math.min(1, box.height / height)
      },
      descriptor: Array.from(det.descriptor),
      avatarDataUrl
    };
  });
}

// Calculate Euclidean distance between two vectors
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export interface FaceItem {
  photoId: string;
  faceId: string;
  descriptor: number[];
}

export interface ClusterGroup {
  id: string; // "person_0", "person_1" etc.
  faces: { photoId: string; faceId: string }[];
  descriptors: number[][];
  averageDescriptor: number[];
}

// Cluster faces based on descriptor distance
// Standard threshold for face-recognition-net is 0.6. A distance <= 0.55 means same person.
export function clusterFaces(faces: FaceItem[], threshold: number = 0.55): ClusterGroup[] {
  const clusters: ClusterGroup[] = [];

  for (const face of faces) {
    let bestCluster: ClusterGroup | null = null;
    let minDistance = Infinity;

    // Find the closest cluster
    for (const cluster of clusters) {
      const dist = euclideanDistance(face.descriptor, cluster.averageDescriptor);
      if (dist < minDistance) {
        minDistance = dist;
        bestCluster = cluster;
      }
    }

    // If close enough, add to cluster
    if (bestCluster && minDistance <= threshold) {
      bestCluster.faces.push({ photoId: face.photoId, faceId: face.faceId });
      bestCluster.descriptors.push(face.descriptor);
      
      // Re-calculate average descriptor
      const len = bestCluster.descriptors.length;
      const dim = face.descriptor.length;
      const avg = new Array(dim).fill(0);
      for (let i = 0; i < dim; i++) {
        let sum = 0;
        for (let j = 0; j < len; j++) {
          sum += bestCluster.descriptors[j][i];
        }
        avg[i] = sum / len;
      }
      bestCluster.averageDescriptor = avg;
    } else {
      // Create new cluster
      const clusterId = `person_${Date.now()}_${clusters.length}_${Math.random().toString(36).substr(2, 5)}`;
      clusters.push({
        id: clusterId,
        faces: [{ photoId: face.photoId, faceId: face.faceId }],
        descriptors: [face.descriptor],
        averageDescriptor: [...face.descriptor]
      });
    }
  }

  return clusters;
}
