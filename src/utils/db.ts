// IndexedDB database manager for the Photobook Creator

const DB_NAME = 'photobook-creator-db';
const DB_VERSION = 1;

export interface FaceData {
  id: string; // generated ID for this face instance
  box: { x: number; y: number; width: number; height: number }; // normalized 0..1 coordinates relative to image size
  descriptor: number[]; // 128-dimensional face embedding
  avatarDataUrl?: string; // base64 face crop avatar
}

export interface PhotoData {
  id: string; // uuid
  name: string;
  blob: Blob;
  width: number;
  height: number;
  lastModified: number; // for chronological sorting
  faces: FaceData[];
  url?: string; // transient Object URL (not saved to IndexedDB)
}

export interface PersonData {
  id: string; // cluster ID (e.g. "person_0")
  name: string; // custom name (e.g. "Dad", "Mom")
  avatarPhotoId: string; // photo containing the representative face
  avatarFaceId: string; // face ID in that photo
}

export interface PhotoPlacement {
  photoId: string;
  zoom: number; // default 1
  pan: { x: number; y: number }; // offset percentage {x: 0, y: 0}
}

export interface PageState {
  id: number; // 1-indexed, 1 to 24
  layoutId: string; // layout template ID
  background: string; // background color, e.g. '#ffffff'
  placements: Record<string, PhotoPlacement>; // key is slot ID (e.g. 'slot-0')
  title?: string;
  caption?: string;
}

export interface ProjectSettings {
  aspectRatio: '1:1' | '4:3' | '3:4'; // Square, Landscape, Portrait
  showBleed: boolean;
  pageCount: number; // Page count (e.g. 3, 12, 24, 48)
}

export interface ProjectState {
  id: string;
  name: string;
  pages: PageState[];
  settings: ProjectSettings;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('photos')) {
        db.createObjectStore('photos', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('people')) {
        db.createObjectStore('people', { keyPath: 'id' });
      }
    };
  });
}

// Photo Operations
export async function savePhoto(photo: PhotoData): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('photos', 'readwrite');
    const store = transaction.objectStore('photos');
    const request = store.put(photo);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAllPhotos(): Promise<PhotoData[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('photos', 'readonly');
    const store = transaction.objectStore('photos');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('photos', 'readwrite');
    const store = transaction.objectStore('photos');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllPhotos(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('photos', 'readwrite');
    const store = transaction.objectStore('photos');
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Project Operations
export async function saveProject(project: ProjectState): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite');
    const store = transaction.objectStore('projects');
    const request = store.put(project);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getProject(id: string): Promise<ProjectState | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readonly');
    const store = transaction.objectStore('projects');
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllProjects(): Promise<ProjectState[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readonly');
    const store = transaction.objectStore('projects');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite');
    const store = transaction.objectStore('projects');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// People Operations
export async function savePerson(person: PersonData): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('people', 'readwrite');
    const store = transaction.objectStore('people');
    const request = store.put(person);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAllPeople(): Promise<PersonData[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('people', 'readonly');
    const store = transaction.objectStore('people');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAllPeople(people: PersonData[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('people', 'readwrite');
    const store = transaction.objectStore('people');
    const request = store.clear();
    request.onsuccess = () => {
      if (people.length === 0) {
        resolve();
        return;
      }
      let completed = 0;
      people.forEach((person) => {
        const putReq = store.put(person);
        putReq.onsuccess = () => {
          completed++;
          if (completed === people.length) resolve();
        };
        putReq.onerror = () => reject(putReq.error);
      });
    };
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllPeople(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('people', 'readwrite');
    const store = transaction.objectStore('people');
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
