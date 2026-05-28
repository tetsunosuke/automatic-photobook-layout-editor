import type { PhotoData, PersonData, PageState, PhotoPlacement } from './db';
import { LAYOUT_TEMPLATES } from './layouts';
import type { LayoutDef } from './layouts';

// Convert aspect ratio to layout orientation
function getOrientation(width: number, height: number): 'landscape' | 'portrait' | 'square' {
  const ratio = width / height;
  if (ratio > 1.25) return 'landscape';
  if (ratio < 0.8) return 'portrait';
  return 'square';
}

// Calculate Euclidean distance / mismatch between photo orientation and slot orientation
function getOrientationMismatch(photoOrient: 'landscape' | 'portrait' | 'square', slotOrient: 'landscape' | 'portrait' | 'square'): number {
  if (photoOrient === slotOrient) return 0;
  if (photoOrient === 'square' || slotOrient === 'square') return 1; // minor mismatch
  return 3; // major mismatch (landscape photo in portrait slot, or vice versa)
}

// Calculate Smart Crop (pan and zoom) to ensure faces are centered and not cut off
export function calculateSmartCrop(
  photoWidth: number,
  photoHeight: number,
  slotWidthPct: number, // e.g. 45
  slotHeightPct: number, // e.g. 90
  faces: PhotoData['faces'],
  settingsAspectRatio: '1:1' | '4:3' | '3:4'
): { pan: { x: number; y: number }; zoom: number } {
  // 1. Calculate actual slot aspect ratio
  let pageW = 210;
  let pageH = 210;
  if (settingsAspectRatio === '4:3') {
    pageW = 297;
    pageH = 210;
  } else if (settingsAspectRatio === '3:4') {
    pageW = 210;
    pageH = 297;
  }
  
  const slotW = pageW * (slotWidthPct / 100);
  const slotH = pageH * (slotHeightPct / 100);
  const slotRatio = slotW / slotH;
  const photoRatio = photoWidth / photoHeight;

  let defaultZoom = 1.0;
  let panX = 0; // -50 to 50
  let panY = 0; // -50 to 50

  let visibleW = 1.0;
  let visibleH = 1.0;
  
  if (photoRatio > slotRatio) {
    visibleW = slotRatio / photoRatio;
  } else {
    visibleH = photoRatio / slotRatio;
  }

  // If we have faces, center the crop box around the faces
  if (faces && faces.length > 0) {
    let minX = 1.0, maxX = 0.0;
    let minY = 1.0, maxY = 0.0;

    for (const face of faces) {
      minX = Math.min(minX, face.box.x);
      maxX = Math.max(maxX, face.box.x + face.box.width);
      minY = Math.min(minY, face.box.y);
      maxY = Math.max(maxY, face.box.y + face.box.height);
    }

    const facesCenterX = (minX + maxX) / 2;
    const facesCenterY = (minY + maxY) / 2;
    const facesW = maxX - minX;
    const facesH = maxY - minY;

    if (photoRatio > slotRatio) {
      const maxOffset = (1 - visibleW) / 2;
      const targetOffset = facesCenterX - 0.5;
      const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, targetOffset));
      if (maxOffset > 0) {
        panX = (clampedOffset / maxOffset) * 50;
      }
    } else {
      const maxOffset = (1 - visibleH) / 2;
      const targetOffset = facesCenterY - 0.5;
      const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, targetOffset));
      if (maxOffset > 0) {
        panY = (clampedOffset / maxOffset) * 50;
      }
    }

    const maxFaceDim = Math.max(facesW / visibleW, facesH / visibleH);
    if (maxFaceDim < 0.25 && maxFaceDim > 0) {
      defaultZoom = Math.min(1.5, 0.25 / maxFaceDim);
    }
  }

  return {
    pan: { x: Math.round(panX), y: Math.round(panY) },
    zoom: parseFloat(defaultZoom.toFixed(2))
  };
}

// Generate the automatic layout for a custom page count
export function generateAutoLayout(
  allPhotos: PhotoData[],
  people: PersonData[],
  aspectRatio: '1:1' | '4:3' | '3:4',
  pageCount: number = 24
): PageState[] {
  if (allPhotos.length === 0) return [];

  // 1. Sort all photos chronologically
  const sortedPhotos = [...allPhotos].sort((a, b) => a.lastModified - b.lastModified);

  // 2. Determine target photos per page
  let photosPerPage = 3;
  if (sortedPhotos.length <= 24) {
    photosPerPage = 1;
  } else if (sortedPhotos.length <= 48) {
    photosPerPage = 2;
  } else if (sortedPhotos.length <= 72) {
    photosPerPage = 3;
  } else {
    photosPerPage = 4;
  }

  // 3. Selection & Balancing Algorithm
  const buckets: PhotoData[][] = Array.from({ length: pageCount }, () => []);
  const photosPerBucket = Math.ceil(sortedPhotos.length / pageCount);
  for (let i = 0; i < sortedPhotos.length; i++) {
    const bucketIdx = Math.min(pageCount - 1, Math.floor(i / photosPerBucket));
    buckets[bucketIdx].push(sortedPhotos[i]);
  }

  // Global tracker of how many pages each person has appeared in
  const personAppearances: Record<string, number> = {};
  people.forEach(p => {
    personAppearances[p.id] = 0;
  });

  const pages: PageState[] = [];

  for (let pNum = 1; pNum <= pageCount; pNum++) {
    const bucket = buckets[pNum - 1];
    if (bucket.length === 0) {
      pages.push({
        id: pNum,
        layoutId: '1-bleed',
        background: '#ffffff',
        placements: {}
      });
      continue;
    }

    let selectedPhotos: PhotoData[] = [];
    if (bucket.length <= photosPerPage) {
      selectedPhotos = [...bucket];
    } else {
      // Score candidates to select one best representative photo (main photo)
      // and fill the rest of the slots with chronological photos to keep the story flow.
      const candidates = bucket.map((photo, index) => {
        let score = 1.0;

        if (photo.faces.length > 0) score += 0.5;

        // Balance bonus: score based on appearances of people in this photo
        photo.faces.forEach(face => {
          const person = people.find(p => p.avatarPhotoId === photo.id && p.avatarFaceId === face.id);
          if (person) {
            const count = personAppearances[person.id] || 0;
            score += 1.0 / (1.0 + count);
          }
        });

        return { photo, score, originalIndex: index };
      });

      // Sort by score to find the best representative photo (highest score)
      candidates.sort((a, b) => b.score - a.score);
      const mainPhoto = candidates[0].photo;

      // Extract the rest and sort them back to original chronological order
      const remainingCandidates = candidates.slice(1);
      remainingCandidates.sort((a, b) => a.originalIndex - b.originalIndex);

      // Evenly sample the remaining count to fill the pages slots
      const neededCount = photosPerPage - 1;
      const sampledPhotos: PhotoData[] = [];

      if (neededCount > 0 && remainingCandidates.length > 0) {
        const step = remainingCandidates.length / neededCount;
        for (let i = 0; i < neededCount; i++) {
          const idx = Math.min(
            remainingCandidates.length - 1,
            Math.floor(i * step + step / 2)
          );
          sampledPhotos.push(remainingCandidates[idx].photo);
        }
      }

      // Combine main photo and sampled photos, then sort them chronologically
      const combined = [mainPhoto, ...sampledPhotos];
      combined.sort((a, b) => {
        const idxA = bucket.findIndex(p => p.id === a.id);
        const idxB = bucket.findIndex(p => p.id === b.id);
        return idxA - idxB;
      });

      selectedPhotos = combined;
    }

    // Update global appearance tracker for people in selected photos
    selectedPhotos.forEach(photo => {
      photo.faces.forEach(face => {
        const person = people.find(p => p.avatarPhotoId === photo.id && p.avatarFaceId === face.id);
        if (person) {
          personAppearances[person.id] = (personAppearances[person.id] || 0) + 1;
        }
      });
    });

    // 4. Select Layout Template and Slot Placement
    const count = selectedPhotos.length;
    const templates = LAYOUT_TEMPLATES[String(count)] || LAYOUT_TEMPLATES['1'];
    const photoOrients = selectedPhotos.map(p => getOrientation(p.width, p.height));

    let bestLayout: LayoutDef = templates[0];
    let bestPhotoMapping: number[] = Array.from({ length: count }, (_, i) => i);
    let minMismatch = Infinity;

    for (const tpl of templates) {
      const perms = getPermutations(Array.from({ length: count }, (_, i) => i));
      for (const perm of perms) {
        let mismatch = 0;

        // Apply penalty to overlapping or complex slanted layouts to keep auto-layout clean
        const overlappingLayoutIds = [
          '2-inset',
          '2-slanted',
          '2-diagonal',
          '3-offset-collage',
          '3-slanted',
          '4-collage'
        ];
        if (overlappingLayoutIds.includes(tpl.id)) {
          mismatch += 10;
        }

        for (let slotIdx = 0; slotIdx < tpl.slots.length; slotIdx++) {
          const photoIdx = perm[slotIdx];
          if (photoIdx !== undefined && photoIdx < photoOrients.length) {
            const pOrient = photoOrients[photoIdx];
            const sOrient = tpl.slots[slotIdx].orientation;
            mismatch += getOrientationMismatch(pOrient, sOrient);
          }
        }
        if (mismatch < minMismatch) {
          minMismatch = mismatch;
          bestLayout = tpl;
          bestPhotoMapping = perm;
        }
      }
    }

    // 5. Generate Placements with Smart Crop
    const placements: Record<string, PhotoPlacement> = {};
    bestLayout.slots.forEach((slot, slotIdx) => {
      const photoIdx = bestPhotoMapping[slotIdx];
      if (photoIdx !== undefined && photoIdx < selectedPhotos.length) {
        const photo = selectedPhotos[photoIdx];
        const slotWidthPct = parseFloat(slot.width);
        const slotHeightPct = parseFloat(slot.height);
        
        const crop = calculateSmartCrop(
          photo.width,
          photo.height,
          slotWidthPct,
          slotHeightPct,
          photo.faces,
          aspectRatio
        );
        
        placements[slot.id] = {
          photoId: photo.id,
          zoom: crop.zoom,
          pan: crop.pan
        };
      }
    });

    pages.push({
      id: pNum,
      layoutId: bestLayout.id,
      background: '#ffffff',
      placements
    });
  }

  return pages;
}

// Helper to get permutations of an array
function getPermutations(arr: number[]): number[][] {
  if (arr.length <= 1) return [arr];
  const perms: number[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const current = arr[i];
    const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
    const subPerms = getPermutations(remaining);
    for (const sub of subPerms) {
      perms.push([current, ...sub]);
    }
  }
  return perms;
}
