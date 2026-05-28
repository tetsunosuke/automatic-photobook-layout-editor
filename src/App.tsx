import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  BookOpen,
  Sparkles,
  Printer,
  RefreshCw,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Settings,
  X,
  User,
  Users,
  Grid,
  Maximize2,
  Minimize2
} from 'lucide-react';

import type {
  PhotoData,
  PersonData,
  ProjectState,
  PageState,
  PhotoPlacement
} from './utils/db';

import {
  savePhoto,
  getAllPhotos,
  deletePhoto,
  clearAllPhotos,
  saveProject,
  getProject,
  saveAllPeople,
  getAllPeople,
  clearAllPeople
} from './utils/db';

import type { FaceItem } from './utils/faceDetector';
import {
  detectFaces,
  clusterFaces,
  blobToImage,
  loadFaceApiModels
} from './utils/faceDetector';

import {
  generateAutoLayout,
  calculateSmartCrop
} from './utils/autoLayout';

import {
  LAYOUT_TEMPLATES,
  getLayoutById
} from './utils/layouts';

const PROJECT_ID = 'default-project';

function App() {
  // App States
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [people, setPeople] = useState<PersonData[]>([]);
  const [project, setProject] = useState<ProjectState | null>(null);
  
  // Navigation
  const [currentSpreadIndex, setCurrentSpreadIndex] = useState(0); // 0 to 12
  const [activePageId, setActivePageId] = useState<number>(1);
  
  // Statuses
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState({ current: 0, total: 0 });
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  // Google Photos states
  const [albumUrl, setAlbumUrl] = useState('');
  const [albumError, setAlbumError] = useState<string | null>(null);
  const [importLimit, setImportLimit] = useState<number>(50);
  
  // Drag & Drop state
  const [draggedPhotoId, setDraggedPhotoId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ pageId: number; slotId: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Project & DB
  useEffect(() => {
    async function init() {
      try {
        // Load AI Models
        await loadFaceApiModels();
        setModelsLoading(false);
      } catch (err) {
        console.error(err);
        setModelsError('顔認識モデルの読み込みに失敗しました。再読み込みしてください。');
        setModelsLoading(false);
      }

      // Load Photos
      const storedPhotos = await getAllPhotos();
      const photosWithUrls = storedPhotos.map(p => ({
        ...p,
        url: URL.createObjectURL(p.blob)
      }));
      setPhotos(photosWithUrls);

      // Load People
      const storedPeople = await getAllPeople();
      setPeople(storedPeople);

      // Load Project
      let storedProj = await getProject(PROJECT_ID);
      if (storedProj) {
        let needsUpdate = false;
        if (!storedProj.settings) {
          storedProj.settings = {
            aspectRatio: '1:1',
            showBleed: true,
            pageCount: storedProj.pages.length || 24
          };
          needsUpdate = true;
        } else if (storedProj.settings.pageCount === undefined) {
          storedProj.settings.pageCount = storedProj.pages.length || 24;
          needsUpdate = true;
        }
        if (needsUpdate) {
          await saveProject(storedProj);
        }
      } else {
        storedProj = {
          id: PROJECT_ID,
          name: 'マイ・フォトブック',
          pages: Array.from({ length: 24 }, (_, i) => ({
            id: i + 1,
            layoutId: '1-bleed',
            background: '#ffffff',
            placements: {}
          })),
          settings: {
            aspectRatio: '1:1',
            showBleed: true,
            pageCount: 24
          },
          createdAt: Date.now()
        };
        await saveProject(storedProj);
      }
      setProject(storedProj);
    }
    init();
  }, []);

  // Sync Project to DB on state change
  const updateProject = async (updated: ProjectState) => {
    setProject(updated);
    await saveProject(updated);
  };

  // Change page count dynamically
  const handleChangePageCount = async (count: number) => {
    if (!project) return;
    
    let nextPages = [...project.pages];
    if (count < nextPages.length) {
      nextPages = nextPages.slice(0, count);
    } else if (count > nextPages.length) {
      const additional = Array.from(
        { length: count - nextPages.length },
        (_, i) => ({
          id: nextPages.length + i + 1,
          layoutId: '1-bleed',
          background: '#ffffff',
          placements: {}
        })
      );
      nextPages = [...nextPages, ...additional];
    }
    
    // Reset view position to start
    setCurrentSpreadIndex(0);
    setActivePageId(1);
    
    await updateProject({
      ...project,
      pages: nextPages,
      settings: {
        ...project.settings,
        pageCount: count
      }
    });
  };

  // Fetch photos from Google Photos Shared Album
  const handleImportAlbum = async () => {
    if (!albumUrl) return;
    
    setIsAnalyzing(true);
    setAlbumError(null);
    setAnalyzeProgress({ current: 0, total: 0 });

    try {
      // 1. Fetch album list of image URLs from server
      const res = await fetch(`/api/fetch-album?url=${encodeURIComponent(albumUrl)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `アルバムデータの取得に失敗しました (ステータス: ${res.status})`);
      }

      const { urls } = await res.json();
      if (!urls || urls.length === 0) {
        throw new Error('公開アルバム内に写真が見つかりませんでした。アルバムが「共有」に設定されているか確認してください。');
      }

      // Slice to user-defined limit (e.g. 50 photos)
      const urlsToFetch = urls.slice(0, importLimit);

      setAnalyzeProgress({ current: 0, total: urlsToFetch.length });

      const newPhotos: PhotoData[] = [];
      const photosList = [...photos];

      // 2. Stagger and download each photo through proxy
      for (let i = 0; i < urlsToFetch.length; i++) {
        const imgUrl = urlsToFetch[i];
        try {
          const imgRes = await fetch(`/api/proxy-image?url=${encodeURIComponent(imgUrl)}`);
          if (!imgRes.ok) {
            console.error(`Failed to proxy image ${i}:`, imgRes.statusText);
            continue;
          }

          const blob = await imgRes.blob();
          const imgElement = await blobToImage(blob);
          const detectedFaces = await detectFaces(imgElement);

          const photo: PhotoData = {
            id: `photo_gp_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`,
            name: `google_photo_${i + 1}.jpg`,
            blob: blob,
            width: imgElement.naturalWidth || imgElement.width,
            height: imgElement.naturalHeight || imgElement.height,
            lastModified: Date.now() - (urlsToFetch.length - i) * 60000, // chronological mock ordering
            faces: detectedFaces
          };

          await savePhoto(photo);
          const photoWithUrl = { ...photo, url: URL.createObjectURL(photo.blob) };
          newPhotos.push(photoWithUrl);
          photosList.push(photoWithUrl);
        } catch (e) {
          console.error(`Failed to download and process image ${i}:`, e);
        }
        
        setAnalyzeProgress(prev => ({ ...prev, current: i + 1 }));
      }

      setPhotos(photosList);

      // 3. Cluster faces to identify characters
      let updatedPeople: PersonData[] = [];
      if (photosList.length > 0) {
        updatedPeople = await runFaceClustering(photosList);
      }

      setIsAnalyzing(false);
      setAlbumUrl('');

      // 4. Auto Layout if project is blank
      if (project && Object.keys(project.pages[0].placements).length === 0) {
        handleAutoLayout(photosList, updatedPeople);
      }
    } catch (err: any) {
      console.error(err);
      setAlbumError(err.message || 'アルバム読み込み中に想定外のエラーが発生しました。');
      setIsAnalyzing(false);
    }
  };

  // Upload and Process Photos from Local Computer
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsAnalyzing(true);
    setAnalyzeProgress({ current: 0, total: files.length });

    const newPhotos: PhotoData[] = [];
    const photosList = [...photos];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        // 1. Convert to Image Element to get dimensions & detect faces
        const blob = new Blob([file], { type: file.type });
        const img = await blobToImage(blob);
        
        // 2. Run Face Detection
        const detectedFaces = await detectFaces(img);
        
        const photo: PhotoData = {
          id: `photo_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`,
          name: file.name,
          blob: blob,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          lastModified: file.lastModified || Date.now(),
          faces: detectedFaces
        };

        await savePhoto(photo);
        const photoWithUrl = { ...photo, url: URL.createObjectURL(photo.blob) };
        newPhotos.push(photoWithUrl);
        photosList.push(photoWithUrl);

        setAnalyzeProgress(prev => ({ ...prev, current: i + 1 }));
      } catch (err) {
        console.error('Error processing file:', file.name, err);
      }
    }

    setPhotos(photosList);
    
    // 3. Re-run Clustering on ALL faces to identify people
    let updatedPeople: PersonData[] = [];
    if (photosList.length > 0) {
      updatedPeople = await runFaceClustering(photosList);
    }

    setIsAnalyzing(false);
    
    // Auto layout if it's the first batch and project is blank
    if (project && Object.keys(project.pages[0].placements).length === 0) {
      handleAutoLayout(photosList, updatedPeople);
    }
  };

  // Run Clustering
  const runFaceClustering = async (currentPhotos: PhotoData[]): Promise<PersonData[]> => {
    // Collect all faces across all photos
    const faceItems: FaceItem[] = [];
    currentPhotos.forEach(p => {
      p.faces.forEach(f => {
        faceItems.push({
          photoId: p.id,
          faceId: f.id,
          descriptor: f.descriptor
        });
      });
    });

    if (faceItems.length === 0) {
      setPeople([]);
      await saveAllPeople([]);
      return [];
    }

    // Cluster faces with 0.55 distance threshold
    const clusters = clusterFaces(faceItems, 0.55);

    // Keep existing names if possible
    const existingPeople = await getAllPeople();
    
    const newPeople: PersonData[] = clusters.map((cluster, index) => {
      // Find if we have an existing person that shares faces with this cluster
      const existing = existingPeople.find(ep => 
        cluster.faces.some(cf => cf.photoId === ep.avatarPhotoId && cf.faceId === ep.avatarFaceId)
      );

      // Find representative face (e.g. first face in cluster)
      const rep = cluster.faces[0];
      
      return {
        id: cluster.id,
        name: existing ? existing.name : `人物 ${index + 1}`,
        avatarPhotoId: rep.photoId,
        avatarFaceId: rep.faceId
      };
    });

    setPeople(newPeople);
    await saveAllPeople(newPeople);
    return newPeople;
  };

  // AI Auto Layout trigger
  const handleAutoLayout = (currentPhotos = photos, currentPeople = people) => {
    if (!project || currentPhotos.length === 0) return;
    
    const autoPages = generateAutoLayout(
      currentPhotos,
      currentPeople,
      project.settings.aspectRatio,
      project.settings.pageCount
    );
    if (autoPages.length > 0) {
      updateProject({
        ...project,
        pages: autoPages
      });
      // Jump to first spread
      setCurrentSpreadIndex(0);
      setActivePageId(1);
    }
  };

  // Update placement settings (zoom / pan)
  const updatePlacement = (pageId: number, slotId: string, placement: PhotoPlacement | null) => {
    if (!project) return;
    
    const nextPages = project.pages.map(page => {
      if (page.id === pageId) {
        const nextPlacements = { ...page.placements };
        if (placement === null) {
          delete nextPlacements[slotId];
        } else {
          nextPlacements[slotId] = placement;
        }
        return { ...page, placements: nextPlacements };
      }
      return page;
    });

    updateProject({ ...project, pages: nextPages });
  };

  // Change page layout template
  const handleLayoutChange = (pageId: number, layoutId: string) => {
    if (!project) return;
    
    const layout = getLayoutById(layoutId);
    if (!layout) return;

    const nextPages = project.pages.map(page => {
      if (page.id === pageId) {
        // Keep placements that can fit in the new layout slots
        const nextPlacements: Record<string, PhotoPlacement> = {};
        const oldPlacementValues = Object.values(page.placements);
        
        layout.slots.forEach((slot, idx) => {
          if (oldPlacementValues[idx]) {
            // Re-use photo, but recalculate smart crop for new slot size
            const photoId = oldPlacementValues[idx].photoId;
            const photo = photos.find(p => p.id === photoId);
            if (photo) {
              const crop = calculateSmartCrop(
                photo.width,
                photo.height,
                parseFloat(slot.width),
                parseFloat(slot.height),
                photo.faces,
                project.settings.aspectRatio
              );
              nextPlacements[slot.id] = {
                photoId,
                zoom: crop.zoom,
                pan: crop.pan
              };
            } else {
              nextPlacements[slot.id] = oldPlacementValues[idx];
            }
          }
        });

        return {
          ...page,
          layoutId,
          placements: nextPlacements
        };
      }
      return page;
    });

    updateProject({ ...project, pages: nextPages });
  };

  // Drag and Drop handlers
  const handleDragStart = (_e: React.DragEvent, photoId: string) => {
    setDraggedPhotoId(photoId);
  };

  const handleDragOver = (e: React.DragEvent, _pageId: number, _slotId: string) => {
    e.preventDefault();
    setDragOverSlot({ pageId: _pageId, slotId: _slotId });
  };

  const handleDragLeave = () => {
    setDragOverSlot(null);
  };

  const handleDrop = (e: React.DragEvent, pageId: number, slotId: string) => {
    e.preventDefault();
    setDragOverSlot(null);

    const activePage = project?.pages.find(p => p.id === pageId);
    if (!activePage || !project) return;

    if (draggedPhotoId) {
      // Placing from library pool
      const photo = photos.find(p => p.id === draggedPhotoId);
      const layout = getLayoutById(activePage.layoutId);
      const slot = layout?.slots.find(s => s.id === slotId);

      if (photo && slot) {
        const crop = calculateSmartCrop(
          photo.width,
          photo.height,
          parseFloat(slot.width),
          parseFloat(slot.height),
          photo.faces,
          project.settings.aspectRatio
        );
        updatePlacement(pageId, slotId, {
          photoId: draggedPhotoId,
          zoom: crop.zoom,
          pan: crop.pan
        });
      }
    }
  };

  // Pan interaction logic
  const handlePanStart = (e: React.MouseEvent, pageId: number, slotId: string) => {
    e.preventDefault();
    if (!project) return;
    const placement = project.pages[pageId - 1].placements[slotId];
    if (!placement) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startPan = { ...placement.pan };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      // Adjust panning sensitivity relative to zoom
      const sensitivity = 0.25 / placement.zoom;
      const nextPanX = startPan.x + dx * sensitivity;
      const nextPanY = startPan.y + dy * sensitivity;

      const clampedX = Math.max(-100, Math.min(100, nextPanX));
      const clampedY = Math.max(-100, Math.min(100, nextPanY));

      const nextPages = project.pages.map(page => {
        if (page.id === pageId) {
          return {
            ...page,
            placements: {
              ...page.placements,
              [slotId]: {
                ...placement,
                pan: { x: Math.round(clampedX), y: Math.round(clampedY) }
              }
            }
          };
        }
        return page;
      });
      setProject({ ...project, pages: nextPages });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      // Save state to DB
      if (project) {
        saveProject(project);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Change Person Name
  const handlePersonNameChange = (id: string, name: string) => {
    const nextPeople = people.map(p => p.id === id ? { ...p, name } : p);
    setPeople(nextPeople);
    saveAllPeople(nextPeople);
  };

  // Delete Photo
  const handleDeletePhoto = async (id: string) => {
    if (!confirm('この写真を削除しますか？ページに配置されているデータも削除されます。')) return;
    
    await deletePhoto(id);
    setPhotos(photos.filter(p => p.id !== id));

    // Clear placements of deleted photo
    if (project) {
      const nextPages = project.pages.map(page => {
        const nextPlacements = { ...page.placements };
        Object.keys(nextPlacements).forEach(key => {
          if (nextPlacements[key].photoId === id) {
            delete nextPlacements[key];
          }
        });
        return { ...page, placements: nextPlacements };
      });
      updateProject({ ...project, pages: nextPages });
    }
  };

  // Export HTML-to-PDF by triggering print dialog with exact settings
  const handleExportPDF = () => {
    // Inject dynamic print styling to override @page size dynamically
    const styleId = 'print-page-size-style';
    let styleTag = document.getElementById(styleId);
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
    }
    
    let sizeStr = '210mm 210mm';
    if (project?.settings.aspectRatio === '4:3') {
      sizeStr = '297mm 210mm';
    } else if (project?.settings.aspectRatio === '3:4') {
      sizeStr = '210mm 297mm';
    }

    styleTag.innerHTML = `@media print { @page { size: ${sizeStr}; margin: 0 !important; } }`;

    window.print();
  };

  // Clear workspace
  const handleReset = async () => {
    if (!confirm('アップロードした写真、人物データ、編集データすべてを消去して初期化しますか？')) return;
    
    await clearAllPhotos();
    await clearAllPeople();
    
    const currentPageCount = project?.settings.pageCount || 24;
    const currentAspectRatio = project?.settings.aspectRatio || '1:1';
    
    const defaultProj: ProjectState = {
      id: PROJECT_ID,
      name: 'マイ・フォトブック',
      pages: Array.from({ length: currentPageCount }, (_, i) => ({
        id: i + 1,
        layoutId: '1-bleed',
        background: '#ffffff',
        placements: {}
      })),
      settings: {
        aspectRatio: currentAspectRatio,
        showBleed: true,
        pageCount: currentPageCount
      },
      createdAt: Date.now()
    };
    
    await saveProject(defaultProj);
    setPhotos([]);
    setPeople([]);
    setProject(defaultProj);
    setCurrentSpreadIndex(0);
    setActivePageId(1);
  };

  // Get photo use count in book
  const getPhotoUseCount = (photoId: string) => {
    if (!project) return 0;
    let count = 0;
    project.pages.forEach(p => {
      Object.values(p.placements).forEach(place => {
        if (place.photoId === photoId) count++;
      });
    });
    return count;
  };

  // Spread viewport page boundaries
  // Spread 0: P1 (Right Cover)
  // Spread 1: P2 (Left) & P3 (Right)
  // Spread maxSpreadIndex: Left page only if page count is even (Back Cover)
  const getPagesInSpread = (spreadIdx: number): PageState[] => {
    if (!project) return [];
    const totalPages = project.pages.length;
    const maxSpread = Math.floor(totalPages / 2);
    
    if (spreadIdx === 0) {
      return [project.pages[0]]; // P1
    }
    if (spreadIdx === maxSpread && totalPages % 2 === 0) {
      return [project.pages[totalPages - 1]]; // Back Cover
    }
    
    const leftIdx = (spreadIdx - 1) * 2 + 1; // P2 is index 1
    const rightIdx = leftIdx + 1;
    
    const pages: PageState[] = [];
    if (leftIdx < totalPages) {
      pages.push(project.pages[leftIdx]);
    }
    if (rightIdx < totalPages) {
      pages.push(project.pages[rightIdx]);
    }
    return pages;
  };

  // Filtered Photo List
  const filteredPhotos = selectedPersonId
    ? photos.filter(p => {
        const person = people.find(pe => pe.id === selectedPersonId);
        if (!person) return false;
        // Check if photo is avatar or if it contains face belonging to cluster
        return p.id === person.avatarPhotoId || p.faces.some(f => f.avatarDataUrl && f.id === person.avatarFaceId);
      })
    : photos;

  // Active page inspector state
  const activePage = project?.pages.find(p => p.id === activePageId);
  const totalPages = project?.pages.length || 24;
  const maxSpreadIndex = Math.floor(totalPages / 2);

  // loading view
  if (modelsLoading || modelsError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-slate-950 text-white">
        {modelsError ? (
          <div className="text-center p-8 max-w-md bg-slate-900 border border-rose-950/40 rounded-2xl">
            <X className="w-12 h-12 text-rose-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2 text-rose-400">エラーが発生しました</h2>
            <p className="text-slate-400 text-sm">{modelsError}</p>
          </div>
        ) : (
          <>
            <div className="relative flex items-center justify-center mb-6">
              <Sparkles className="w-12 h-12 text-violet-500 animate-pulse" />
              <div className="absolute inset-0 w-16 h-16 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <h2 className="text-xl font-semibold mb-2">AIフォトブックデザイナー起動中</h2>
            <p className="text-slate-400 text-sm">ローカル顔認識モデルをロードしています。少々お待ちください...</p>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-screen w-screen bg-[#090d16] text-slate-100 overflow-hidden no-print">
      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-4 glass-panel border-b border-white/5 z-30">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-violet-500" />
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white leading-tight">AI Photobook Creator</h1>
            <p className="text-[10px] text-violet-400/80 font-medium">Smart AI Auto-Layout Engine</p>
          </div>
        </div>

        {/* Top Controls */}
        <div className="flex items-center gap-4">
          {/* Page Count Picker */}
          <div className="flex items-center bg-slate-900/60 rounded-lg p-1 border border-white/5" title="ページ数の変更">
            {[3, 12, 24, 48].map((count) => (
              <button
                key={count}
                onClick={() => project && handleChangePageCount(count)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-all ${project?.settings.pageCount === count ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {count}P{count === 3 ? ' (テスト)' : ''}
              </button>
            ))}
          </div>

          {/* Aspect Ratio Picker */}
          <div className="flex items-center bg-slate-900/60 rounded-lg p-1 border border-white/5">
            <button
              onClick={() => project && updateProject({ ...project, settings: { ...project.settings, aspectRatio: '1:1' } })}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${project?.settings.aspectRatio === '1:1' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              スクエア (1:1)
            </button>
            <button
              onClick={() => project && updateProject({ ...project, settings: { ...project.settings, aspectRatio: '4:3' } })}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${project?.settings.aspectRatio === '4:3' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              横型 A4 (4:3)
            </button>
            <button
              onClick={() => project && updateProject({ ...project, settings: { ...project.settings, aspectRatio: '3:4' } })}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${project?.settings.aspectRatio === '3:4' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              縦型 A4 (3:4)
            </button>
          </div>

          {/* Safe bleed guide */}
          <button
            onClick={() => project && updateProject({ ...project, settings: { ...project.settings, showBleed: !project.settings.showBleed } })}
            className={`p-2 rounded-lg border transition-all ${project?.settings.showBleed ? 'bg-violet-950/40 border-violet-800 text-violet-400' : 'bg-slate-900 border-white/5 text-slate-400 hover:bg-slate-800'}`}
            title="裁ち落とし線（ガイド）の表示/非表示"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* AI Auto Layout */}
          <button
            onClick={() => handleAutoLayout()}
            disabled={photos.length === 0}
            className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white px-4 py-2 rounded-lg font-semibold text-sm shadow-lg shadow-violet-900/20 transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            AI自動配置
          </button>

          {/* PDF Print */}
          <button
            onClick={handleExportPDF}
            disabled={photos.length === 0}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-slate-100 border border-white/10 px-4 py-2 rounded-lg font-semibold text-sm transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
            PDF出力
          </button>

          {/* Reset button */}
          <button
            onClick={handleReset}
            className="p-2 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-950/20 hover:border-rose-900/30 border border-transparent transition-all"
            title="すべて初期化"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      {photos.length === 0 ? (
        /* Empty Dashboard Upload */
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#090d16]">
          <div className="max-w-xl w-full text-center glass-panel p-10 rounded-2xl border border-white/5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500"></div>
            
            <div className="mx-auto w-16 h-16 bg-violet-600/10 border border-violet-500/20 rounded-2xl flex items-center justify-center mb-6">
              <Upload className="w-8 h-8 text-violet-500" />
            </div>
            
            <h2 className="text-2xl font-bold mb-3 text-white">AIフォトブックデザイナー</h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              Googleフォトなどからダウンロードした旅行やイベントの写真をアップロードしてください。<br/>
              AIが「写っている人物」を自動分析・識別し、全員が均等に登場するようストーリー（時系列）順で指定されたページ数分をかっこよくレイアウトします。
            </p>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoUpload}
              multiple
              accept="image/*"
              className="hidden"
            />
            
            <div className="flex flex-col gap-4 max-w-md mx-auto">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl font-semibold shadow-lg shadow-violet-900/30 hover:shadow-violet-900/40 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                パソコンから写真をアップロード
              </button>

              <div className="flex items-center gap-3 text-slate-500 text-xs my-2">
                <span className="flex-1 h-px bg-white/10"></span>
                <span>または</span>
                <span className="flex-1 h-px bg-white/10"></span>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={albumUrl}
                    onChange={(e) => setAlbumUrl(e.target.value)}
                    placeholder="Googleフォトの共有アルバムURLを入力..."
                    className="flex-1 px-4 py-2.5 text-xs bg-slate-900/80 border border-white/10 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-violet-500 transition-all"
                  />
                  <div className="flex items-center gap-1 bg-slate-900 border border-white/10 rounded-lg px-2 text-xs text-slate-400">
                    <span className="text-[10px] whitespace-nowrap">上限:</span>
                    <input
                      type="number"
                      min={10}
                      max={500}
                      value={importLimit}
                      onChange={(e) => setImportLimit(Number(e.target.value))}
                      className="w-12 bg-transparent text-center text-slate-100 focus:outline-none font-bold"
                    />
                    <span className="text-[10px]">枚</span>
                  </div>
                  <button
                    onClick={handleImportAlbum}
                    disabled={!albumUrl}
                    className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold text-xs rounded-lg transition-all cursor-pointer disabled:cursor-not-allowed"
                  >
                    読み込む
                  </button>
                </div>
                {albumError && <p className="text-[10px] text-rose-400 mt-1 text-left">{albumError}</p>}
              </div>
            </div>
            
            <p className="text-[10px] text-slate-500 mt-6">
              ※アップロードされた写真およびAI認識データは、ブラウザのローカルDB（IndexedDB）にのみ保存されます。
            </p>
          </div>
        </div>
      ) : (
        /* Workspace Editor */
        <div className="flex-1 flex overflow-hidden">
          
          {/* LEFT SIDEBAR: PHOTO POOL & PEOPLE FILTER */}
          <aside className="w-80 glass-panel border-r border-white/5 flex flex-col z-20">
            {/* Upload Area inside pool */}
            <div className="p-4 border-b border-white/5 flex flex-col gap-2">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center py-3 border border-dashed border-white/10 rounded-lg hover:border-violet-500/50 hover:bg-violet-950/10 transition-all cursor-pointer group"
              >
                <Upload className="w-4 h-4 text-slate-400 group-hover:text-violet-500 mb-0.5" />
                <span className="text-[10px] font-medium text-slate-300 group-hover:text-slate-100">PCから写真を追加</span>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                  multiple
                  accept="image/*"
                  className="hidden"
                />
              </div>

              <div className="flex flex-col gap-1.5 mt-1.5">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={albumUrl}
                    onChange={(e) => setAlbumUrl(e.target.value)}
                    placeholder="Googleフォト共有URL..."
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-[10px] bg-slate-950 border border-white/5 rounded-md text-slate-200 placeholder:text-slate-650 focus:outline-none focus:border-violet-500 transition-all"
                  />
                  <input
                    type="number"
                    min={10}
                    max={500}
                    value={importLimit}
                    onChange={(e) => setImportLimit(Number(e.target.value))}
                    className="w-10 bg-slate-950 text-center text-[10px] text-slate-200 border border-white/5 rounded-md focus:outline-none font-medium"
                    title="取得上限枚数"
                  />
                  <button
                    onClick={handleImportAlbum}
                    disabled={!albumUrl}
                    className="px-2.5 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold text-[10px] rounded-md transition-all cursor-pointer disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    読込
                  </button>
                </div>
                {albumError && <p className="text-[9px] text-rose-400 mt-0.5">{albumError}</p>}
              </div>
            </div>

            {/* AI People List */}
            {people.length > 0 && (
              <div className="px-4 py-3 border-b border-white/5 bg-slate-900/30">
                <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <Users className="w-3.5 h-3.5 text-violet-400" />
                  <span>登場人物一覧 (AI認識)</span>
                </div>
                
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                  {/* Reset filter button */}
                  <button
                    onClick={() => setSelectedPersonId(null)}
                    className={`flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-medium transition-all ${!selectedPersonId ? 'bg-violet-500/20 text-violet-300 border border-violet-500/20' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}
                  >
                    <span>すべての写真</span>
                    <span className="bg-slate-800 text-[10px] px-1.5 py-0.5 rounded-full text-slate-400">{photos.length}</span>
                  </button>

                  {people.map(p => {
                    // Count how many photos of this person exist
                    const count = photos.filter(photo => 
                      photo.id === p.avatarPhotoId || photo.faces.some(f => f.avatarDataUrl && f.id === p.avatarFaceId)
                    ).length;

                    // Get avatar photo url
                    const avatarPhoto = photos.find(ph => ph.id === p.avatarPhotoId);
                    const face = avatarPhoto?.faces.find(f => f.id === p.avatarFaceId);
                    
                    return (
                      <div 
                        key={p.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-all ${selectedPersonId === p.id ? 'bg-violet-500/20 border border-violet-500/20' : 'border border-transparent hover:bg-white/5'}`}
                      >
                        {/* Avatar thumbnail */}
                        <div 
                          onClick={() => setSelectedPersonId(p.id)}
                          className="w-8 h-8 rounded-full overflow-hidden border border-white/10 bg-slate-800 flex-shrink-0 cursor-pointer"
                        >
                          {face?.avatarDataUrl ? (
                            <img src={face.avatarDataUrl} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><User className="w-4 h-4 text-slate-500" /></div>
                          )}
                        </div>

                        {/* Name Input */}
                        <input
                          type="text"
                          value={p.name}
                          onChange={(e) => handlePersonNameChange(p.id, e.target.value)}
                          className="flex-1 min-w-0 bg-transparent text-xs font-medium border-b border-transparent hover:border-white/20 focus:border-violet-500 focus:outline-none py-0.5"
                          title="クリックして名前を変更"
                        />

                        {/* Filter click handler and Count */}
                        <span 
                          onClick={() => setSelectedPersonId(p.id)}
                          className="bg-slate-800/80 text-[10px] px-1.5 py-0.5 rounded-full text-slate-400 cursor-pointer"
                        >
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Photo Pool Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                写真ライブラリ
              </div>
              <div className="grid grid-cols-2 gap-3">
                {filteredPhotos.map(photo => {
                  const url = photo.url || URL.createObjectURL(photo.blob);
                  const useCount = getPhotoUseCount(photo.id);
                  return (
                    <div 
                      key={photo.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, photo.id)}
                      className="group relative aspect-square rounded-lg overflow-hidden bg-slate-900 border border-white/5 hover:border-violet-500/40 transition-all cursor-grab active:cursor-grabbing"
                    >
                      <img src={url} alt={photo.name} className="w-full h-full object-cover" />
                      
                      {/* Badge count */}
                      {useCount > 0 && (
                        <div className="absolute top-1 left-1 bg-violet-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow">
                          {useCount}回使用
                        </div>
                      )}

                      {/* Photo details tooltip */}
                      {photo.faces.length > 0 && (
                        <div className="absolute bottom-1 right-1 bg-slate-950/80 text-white text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 border border-white/5">
                          <Users className="w-2.5 h-2.5 text-violet-400" />
                          <span>{photo.faces.length}人</span>
                        </div>
                      )}

                      {/* Delete button */}
                      <button
                        onClick={() => handleDeletePhoto(photo.id)}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 bg-slate-950/80 text-slate-400 hover:text-rose-400 rounded transition-all"
                        title="写真を削除"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* CENTER VIEWPORT: THE ACTIVE SPREAD */}
          <main className="flex-1 flex flex-col bg-[#05070c] relative overflow-hidden z-10">
            {/* Viewport content */}
            <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
              
              {/* Spreads Render */}
              <div className="flex items-center gap-1">
                {/* Previous Spread Indicator (Blank space for cover) */}
                {currentSpreadIndex === 0 && (
                  <div className={`hidden md:block opacity-30 border border-dashed border-white/5 rounded-xl flex items-center justify-center ${project?.settings.aspectRatio === '1:1' ? 'w-[500px] h-[500px]' : project?.settings.aspectRatio === '4:3' ? 'w-[707px] h-[500px]' : 'w-[375px] h-[530px]'}`}>
                    <div className="text-center text-xs text-slate-500">
                      <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-25" />
                      <span>表表紙（右面のみ）</span>
                    </div>
                  </div>
                )}

                {/* Actual Pages in active spread */}
                {getPagesInSpread(currentSpreadIndex).map((page, sideIdx) => {
                  const isLeftPage = currentSpreadIndex > 0 && sideIdx === 0;
                  const isRightPage = currentSpreadIndex === 0 || (currentSpreadIndex > 0 && sideIdx === 1);
                  const isSingleCover = currentSpreadIndex === 0 || currentSpreadIndex === 12;
                  
                  const layout = getLayoutById(page.layoutId) || LAYOUT_TEMPLATES['1'][0];
                  
                  return (
                    <div 
                      key={page.id}
                      onClick={() => setActivePageId(page.id)}
                      className={`relative select-none ${activePageId === page.id ? 'ring-2 ring-violet-500 ring-offset-2 ring-offset-[#05070c]' : 'ring-1 ring-white/10'} 
                        ${project?.settings.aspectRatio === '1:1' ? 'page-container-aspect-1-1' : project?.settings.aspectRatio === '4:3' ? 'page-container-aspect-4-3' : 'page-container-aspect-3-4'}`}
                      style={{ backgroundColor: page.background }}
                    >
                      {/* Bleed guide overlay */}
                      {project?.settings.showBleed && (
                        <div className="bleed-guide">
                          <span className="bleed-label">Bleed (3mm)</span>
                        </div>
                      )}

                      {/* Binding shadows for spread look */}
                      {isLeftPage && <div className="spread-binding-left"></div>}
                      {isRightPage && !isSingleCover && <div className="spread-binding-right"></div>}

                      {/* Render slots based on selected layout */}
                      {layout.slots.map(slot => {
                        const placement = page.placements[slot.id];
                        const isOver = dragOverSlot?.pageId === page.id && dragOverSlot?.slotId === slot.id;
                        
                        return (
                          <div
                            key={slot.id}
                            onDragOver={(e) => handleDragOver(e, page.id, slot.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, page.id, slot.id)}
                            className={`photo-slot ${placement ? 'has-image' : ''} ${isOver ? 'drag-over' : ''}`}
                            style={{
                              top: slot.top,
                              left: slot.left,
                              width: slot.width,
                              height: slot.height,
                              clipPath: slot.clipPath,
                              WebkitClipPath: slot.clipPath
                            }}
                          >
                            {placement ? (
                              /* Photo Placement inside Slot */
                              <div className="slot-image-container">
                                {/* Pan overlay */}
                                <div 
                                  onMouseDown={(e) => handlePanStart(e, page.id, slot.id)}
                                  className="slot-image-pan-overlay"
                                  title="ドラッグして写真の位置を微調整"
                                />

                                {/* Render Image */}
                                {(() => {
                                  const photo = photos.find(p => p.id === placement.photoId);
                                  if (!photo) return <div className="absolute inset-0 bg-rose-950/20 text-rose-400 text-xs flex items-center justify-center">画像がありません</div>;
                                  const url = photo.url || URL.createObjectURL(photo.blob);
                                  
                                  return (
                                    <img
                                      src={url}
                                      alt={photo.name}
                                      className="slot-image"
                                      style={{
                                        transform: `scale(${placement.zoom})`,
                                        objectPosition: `${50 + placement.pan.x}% ${50 + placement.pan.y}%`
                                      }}
                                    />
                                  );
                                })()}

                                {/* Hover actions */}
                                <div className="photo-slot-actions">
                                  {/* Zoom out */}
                                  <button
                                    onClick={() => updatePlacement(page.id, slot.id, { ...placement, zoom: Math.max(1.0, placement.zoom - 0.1) })}
                                    className="slot-btn"
                                    title="ズームアウト"
                                  >
                                    <Minimize2 className="w-3.5 h-3.5" />
                                  </button>
                                  {/* Zoom in */}
                                  <button
                                    onClick={() => updatePlacement(page.id, slot.id, { ...placement, zoom: Math.min(3.0, placement.zoom + 0.1) })}
                                    className="slot-btn"
                                    title="ズームイン"
                                  >
                                    <Maximize2 className="w-3.5 h-3.5" />
                                  </button>
                                  {/* Delete photo */}
                                  <button
                                    onClick={() => updatePlacement(page.id, slot.id, null)}
                                    className="slot-btn"
                                    title="写真をクリア"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* Empty Placeholder */
                              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-slate-50/50 hover:bg-slate-100/80 transition-colors">
                                <Upload className="w-5 h-5 text-slate-400 mb-1" />
                                <span className="text-[10px] text-slate-400 font-semibold">写真をドラッグ＆ドロップ</span>
                              </div>
                            )}

                            {/* Render Polaroid style text if active and polaroid layout */}
                            {page.layoutId === '1-polaroid' && slot.id === 'slot-0' && (
                              <div className="polaroid-text-area">
                                <input
                                  type="text"
                                  value={page.title || ''}
                                  placeholder="タイトルを入力..."
                                  onChange={(e) => {
                                    if (project) {
                                      const nextPages = project.pages.map(p => p.id === page.id ? { ...p, title: e.target.value } : p);
                                      updateProject({ ...project, pages: nextPages });
                                    }
                                  }}
                                  className="polaroid-title bg-transparent text-center focus:outline-none"
                                />
                                <input
                                  type="text"
                                  value={page.caption || ''}
                                  placeholder="キャプションを入力..."
                                  onChange={(e) => {
                                    if (project) {
                                      const nextPages = project.pages.map(p => p.id === page.id ? { ...p, caption: e.target.value } : p);
                                      updateProject({ ...project, pages: nextPages });
                                    }
                                  }}
                                  className="polaroid-caption bg-transparent text-center focus:outline-none"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Page number badge */}
                      <span className="absolute bottom-2 right-4 text-[10px] text-slate-400 font-bold z-10">
                        P.{page.id}
                      </span>
                    </div>
                  );
                })}

                {/* Next Spread Indicator (Blank space for cover) */}
                {currentSpreadIndex === maxSpreadIndex && totalPages % 2 === 0 && (
                  <div className={`hidden md:block opacity-30 border border-dashed border-white/5 rounded-xl flex items-center justify-center ${project?.settings.aspectRatio === '1:1' ? 'w-[500px] h-[500px]' : project?.settings.aspectRatio === '4:3' ? 'w-[707px] h-[500px]' : 'w-[375px] h-[530px]'}`}>
                    <div className="text-center text-xs text-slate-500">
                      <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-25" />
                      <span>裏表紙（左面のみ）</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Pagination spread controls */}
            <div className="py-4 border-t border-white/5 bg-[#090d16]/80 flex items-center justify-center gap-6 z-20">
              <button
                disabled={currentSpreadIndex === 0}
                onClick={() => {
                  setCurrentSpreadIndex(prev => prev - 1);
                  setActivePageId(prev => Math.max(1, prev - 2));
                }}
                className="p-2 rounded-lg bg-slate-900 border border-white/5 text-slate-300 disabled:opacity-40 disabled:hover:bg-slate-900 hover:bg-slate-800 transition-all cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              <span className="text-xs font-semibold tracking-wider text-slate-400">
                {currentSpreadIndex === 0 
                  ? '表紙' 
                  : (currentSpreadIndex === maxSpreadIndex && totalPages % 2 === 0) 
                    ? '裏表紙' 
                    : `${(currentSpreadIndex - 1) * 2 + 2} - ${Math.min(totalPages, (currentSpreadIndex - 1) * 2 + 3)} ページ / 見開き ${currentSpreadIndex}`}
              </span>
              
              <button
                disabled={currentSpreadIndex === maxSpreadIndex}
                onClick={() => {
                  setCurrentSpreadIndex(prev => prev + 1);
                  setActivePageId(prev => Math.min(totalPages, prev + 2));
                }}
                className="p-2 rounded-lg bg-slate-900 border border-white/5 text-slate-300 disabled:opacity-40 disabled:hover:bg-slate-900 hover:bg-slate-800 transition-all cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </main>

          {/* RIGHT SIDEBAR: PAGE MANAGER & ACTIVE INSPECTOR */}
          <aside className="w-72 glass-panel border-l border-white/5 flex flex-col z-20">
            {/* Inspector Panel for active page */}
            {activePage && (
              <div className="p-4 border-b border-white/5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  <Grid className="w-3.5 h-3.5 text-violet-400" />
                  <span>P.{activePageId} 編集パネル</span>
                </div>

                {/* Layout Template Selector */}
                <div className="mb-4">
                  <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wide">レイアウトテンプレート</label>
                  <div className="flex flex-col gap-1.5">
                    {/* Groups by slot size */}
                    {['1', '2', '3', '4'].map(count => (
                      <div key={count}>
                        <div className="text-[9px] text-slate-500 font-semibold mb-1">{count}枚用レイアウト</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {LAYOUT_TEMPLATES[count].map(tpl => (
                            <button
                              key={tpl.id}
                              onClick={() => handleLayoutChange(activePageId, tpl.id)}
                              className={`px-2 py-1.5 text-[10px] text-left font-medium rounded-md border transition-all truncate ${activePage.layoutId === tpl.id ? 'bg-violet-600 border-violet-500 text-white font-semibold' : 'bg-slate-900 border-white/5 text-slate-400 hover:text-slate-200'}`}
                            >
                              {tpl.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Page Background */}
                <div className="mb-2">
                  <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wide">ページ背景色</label>
                  <div className="flex items-center gap-2">
                    {[
                      { hex: '#ffffff', label: '白' },
                      { hex: '#fafaf9', label: '生成' },
                      { hex: '#1e293b', label: '濃炭' },
                      { hex: '#000000', label: '黒' }
                    ].map(color => (
                      <button
                        key={color.hex}
                        onClick={() => {
                          if (project) {
                            const nextPages = project.pages.map(p => p.id === activePageId ? { ...p, background: color.hex } : p);
                            updateProject({ ...project, pages: nextPages });
                          }
                        }}
                        className={`w-6 h-6 rounded-full border transition-all ${activePage.background === color.hex ? 'ring-2 ring-violet-500 border-white' : 'border-white/10 hover:scale-105'}`}
                        style={{ backgroundColor: color.hex }}
                        title={color.label}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Quick pages navigator (thumb list) */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                全 {totalPages} ページ一覧
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {project?.pages.map(page => {
                  const isSelected = activePageId === page.id;
                  const pageLayout = getLayoutById(page.layoutId);
                  
                  return (
                    <div
                      key={page.id}
                      onClick={() => {
                        setActivePageId(page.id);
                        // Navigate current spread to match this page
                        if (page.id === 1) setCurrentSpreadIndex(0);
                        else if (page.id === totalPages && totalPages % 2 === 0) setCurrentSpreadIndex(maxSpreadIndex);
                        else setCurrentSpreadIndex(Math.floor((page.id - 2) / 2) + 1);
                      }}
                      className={`relative aspect-[1/1] rounded-lg overflow-hidden border transition-all cursor-pointer ${isSelected ? 'ring-2 ring-violet-500 border-transparent shadow-lg' : 'border-white/5 hover:border-white/20'}`}
                      style={{ backgroundColor: page.background }}
                    >
                      {/* Mini Layout Slots Preview */}
                      {pageLayout?.slots.map(slot => {
                        const placement = page.placements[slot.id];
                        const photo = placement ? photos.find(p => p.id === placement.photoId) : null;
                        
                        return (
                          <div
                            key={slot.id}
                            className="absolute bg-slate-200/50 border border-slate-300/40 overflow-hidden"
                            style={{
                              top: slot.top,
                              left: slot.left,
                              width: slot.width,
                              height: slot.height,
                              clipPath: slot.clipPath,
                              WebkitClipPath: slot.clipPath
                            }}
                          >
                            {photo && (
                              <img
                                src={photo.url || URL.createObjectURL(photo.blob)}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                        );
                      })}
                      
                      {/* Page number */}
                      <span className="absolute bottom-1 right-2 text-[9px] bg-slate-950/80 text-slate-400 font-bold px-1.5 py-0.5 rounded">
                        P.{page.id}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>

        </div>
      )}

      {/* ANALYSIS PROGRESS SCREEN */}
      {isAnalyzing && (
        <div className="fixed inset-0 bg-slate-950/90 flex flex-col items-center justify-center z-50">
          <div className="max-w-md w-full text-center p-8 bg-slate-900 border border-white/5 rounded-2xl shadow-2xl">
            <Sparkles className="w-12 h-12 text-violet-500 animate-pulse mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">AIで写真を分析中...</h3>
            <p className="text-slate-400 text-xs mb-6">
              写真の人物と顔の位置を識別して、自動レイアウトを準備しています。
            </p>
            
            {/* Progress bar */}
            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden mb-2">
              <div 
                className="bg-gradient-to-r from-violet-500 to-indigo-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${(analyzeProgress.current / analyzeProgress.total) * 100}%` }}
              />
            </div>
            
            <div className="flex justify-between text-[10px] text-slate-400 font-bold">
              <span>進行状況</span>
              <span>{analyzeProgress.current} / {analyzeProgress.total} 枚完了</span>
            </div>
          </div>
        </div>
      )}

      </div> {/* Close the no-print div wrapper */}

      {/* PRINT-ONLY CONTAINER (HIDDEN ON SCREEN, RENDERED IN PRINT DIALOG) */}
      <div className="print-only-container">
        {project?.pages.map(page => {
          const layout = getLayoutById(page.layoutId) || LAYOUT_TEMPLATES['1'][0];
          
          return (
            <div 
              key={page.id}
              className={`print-page-wrapper print-size-${project.settings.aspectRatio === '1:1' ? '1-1' : project.settings.aspectRatio === '4:3' ? '4-3' : '3-4'}`}
              style={{ backgroundColor: page.background }}
            >
              {layout.slots.map(slot => {
                const placement = page.placements[slot.id];
                if (!placement) return null;
                const photo = photos.find(p => p.id === placement.photoId);
                if (!photo) return null;
                const url = photo.url || URL.createObjectURL(photo.blob);

                return (
                  <div
                    key={slot.id}
                    className="print-photo-slot"
                    style={{
                      top: slot.top,
                      left: slot.left,
                      width: slot.width,
                      height: slot.height,
                      clipPath: slot.clipPath,
                      WebkitClipPath: slot.clipPath
                    }}
                  >
                    <div className="print-slot-image-container">
                      <img
                        src={url}
                        alt=""
                        className="print-slot-image"
                        style={{
                          transform: `scale(${placement.zoom})`,
                          objectPosition: `${50 + placement.pan.x}% ${50 + placement.pan.y}%`
                        }}
                      />
                    </div>

                    {/* Print text if polaroid */}
                    {page.layoutId === '1-polaroid' && slot.id === 'slot-0' && (
                      <div className="polaroid-text-area">
                        <div className="polaroid-title" style={{ fontSize: '20px' }}>{page.title || ''}</div>
                        <div className="polaroid-caption" style={{ fontSize: '12px' }}>{page.caption || ''}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

export default App;
