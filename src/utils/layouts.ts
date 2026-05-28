// Page Layout Templates Definition

export interface LayoutSlotDef {
  id: string; // slot-0, slot-1, etc.
  top: string; // e.g. '5%'
  left: string; // e.g. '5%'
  width: string; // e.g. '42.5%'
  height: string; // e.g. '90%'
  orientation: 'landscape' | 'portrait' | 'square';
  clipPath?: string; // CSS clip-path value
}

export interface LayoutDef {
  id: string;
  name: string;
  slotsCount: number;
  slots: LayoutSlotDef[];
}

export const LAYOUT_TEMPLATES: Record<string, LayoutDef[]> = {
  // 1 Photo Layouts
  '1': [
    {
      id: '1-bleed',
      name: '全面フルブリード',
      slotsCount: 1,
      slots: [
        { id: 'slot-0', top: '0%', left: '0%', width: '100%', height: '100%', orientation: 'square' }
      ]
    },
    {
      id: '1-fine-art',
      name: 'ファインアート（中央余白）',
      slotsCount: 1,
      slots: [
        { id: 'slot-0', top: '10%', left: '10%', width: '80%', height: '80%', orientation: 'square' }
      ]
    },
    {
      id: '1-polaroid',
      name: 'ポラロイド風',
      slotsCount: 1,
      slots: [
        { id: 'slot-0', top: '8%', left: '10%', width: '80%', height: '68%', orientation: 'landscape' }
      ]
    }
  ],

  // 2 Photo Layouts
  '2': [
    {
      id: '2-split-v',
      name: '左右2分割',
      slotsCount: 2,
      slots: [
        { id: 'slot-0', top: '5%', left: '5%', width: '42.5%', height: '90%', orientation: 'portrait' },
        { id: 'slot-1', top: '5%', left: '52.5%', width: '42.5%', height: '90%', orientation: 'portrait' }
      ]
    },
    {
      id: '2-split-h',
      name: '上下2分割',
      slotsCount: 2,
      slots: [
        { id: 'slot-0', top: '5%', left: '5%', width: '90%', height: '42.5%', orientation: 'landscape' },
        { id: 'slot-1', top: '52.5%', left: '5%', width: '90%', height: '42.5%', orientation: 'landscape' }
      ]
    },
    {
      id: '2-asymmetric',
      name: '非対称左右分割',
      slotsCount: 2,
      slots: [
        { id: 'slot-0', top: '5%', left: '5%', width: '55%', height: '90%', orientation: 'portrait' },
        { id: 'slot-1', top: '20%', left: '65%', width: '30%', height: '60%', orientation: 'portrait' }
      ]
    },
    {
      id: '2-inset',
      name: 'メイン ＋ インセット重ね',
      slotsCount: 2,
      slots: [
        { id: 'slot-0', top: '5%', left: '5%', width: '75%', height: '75%', orientation: 'landscape' },
        { id: 'slot-1', top: '50%', left: '50%', width: '45%', height: '45%', orientation: 'square' }
      ]
    },
    {
      id: '2-slanted',
      name: '斜めスリット2分割',
      slotsCount: 2,
      slots: [
        { id: 'slot-0', top: '0%', left: '0%', width: '60%', height: '100%', orientation: 'portrait', clipPath: 'polygon(0 0, 100% 0, 66% 100%, 0 100%)' },
        { id: 'slot-1', top: '0%', left: '40%', width: '60%', height: '100%', orientation: 'portrait', clipPath: 'polygon(34% 0, 100% 0, 100% 100%, 0 100%)' }
      ]
    },
    {
      id: '2-diagonal',
      name: '対角線斜め2分割',
      slotsCount: 2,
      slots: [
        { id: 'slot-0', top: '0%', left: '0%', width: '100%', height: '100%', orientation: 'square', clipPath: 'polygon(0 0, 100% 0, 0 100%)' },
        { id: 'slot-1', top: '0%', left: '0%', width: '100%', height: '100%', orientation: 'square', clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }
      ]
    }
  ],

  // 3 Photo Layouts
  '3': [
    {
      id: '3-grid-l1-r2',
      name: '左大1 ＋ 右小2',
      slotsCount: 3,
      slots: [
        { id: 'slot-0', top: '5%', left: '5%', width: '44%', height: '90%', orientation: 'portrait' },
        { id: 'slot-1', top: '5%', left: '51%', width: '44%', height: '43.5%', orientation: 'landscape' },
        { id: 'slot-2', top: '51.5%', left: '51%', width: '44%', height: '43.5%', orientation: 'landscape' }
      ]
    },
    {
      id: '3-grid-t1-b2',
      name: '上大1 ＋ 下小2',
      slotsCount: 3,
      slots: [
        { id: 'slot-0', top: '5%', left: '5%', width: '90%', height: '44%', orientation: 'landscape' },
        { id: 'slot-1', top: '51.5%', left: '5%', width: '44%', height: '43.5%', orientation: 'portrait' },
        { id: 'slot-2', top: '51.5%', left: '51%', width: '44%', height: '43.5%', orientation: 'portrait' }
      ]
    },
    {
      id: '3-col',
      name: '3列縦分割',
      slotsCount: 3,
      slots: [
        { id: 'slot-0', top: '5%', left: '5%', width: '28%', height: '90%', orientation: 'portrait' },
        { id: 'slot-1', top: '5%', left: '36%', width: '28%', height: '90%', orientation: 'portrait' },
        { id: 'slot-2', top: '5%', left: '67%', width: '28%', height: '90%', orientation: 'portrait' }
      ]
    },
    {
      id: '3-offset-collage',
      name: 'オフセット・コラージュ',
      slotsCount: 3,
      slots: [
        { id: 'slot-0', top: '5%', left: '5%', width: '50%', height: '50%', orientation: 'landscape' },
        { id: 'slot-1', top: '45%', left: '45%', width: '50%', height: '50%', orientation: 'landscape' },
        { id: 'slot-2', top: '25%', left: '30%', width: '40%', height: '40%', orientation: 'square' }
      ]
    },
    {
      id: '3-slanted',
      name: '斜めスリット3分割',
      slotsCount: 3,
      slots: [
        { id: 'slot-0', top: '0%', left: '0%', width: '45%', height: '100%', orientation: 'portrait', clipPath: 'polygon(0 0, 100% 0, 55% 100%, 0 100%)' },
        { id: 'slot-1', top: '0%', left: '25%', width: '50%', height: '100%', orientation: 'portrait', clipPath: 'polygon(45% 0, 100% 0, 55% 100%, 0 100%)' },
        { id: 'slot-2', top: '0%', left: '55%', width: '45%', height: '100%', orientation: 'portrait', clipPath: 'polygon(45% 0, 100% 0, 100% 100%, 0 100%)' }
      ]
    }
  ],

  // 4 Photo Layouts
  '4': [
    {
      id: '4-grid-2x2',
      name: '2x2 グリッド',
      slotsCount: 4,
      slots: [
        { id: 'slot-0', top: '5%', left: '5%', width: '43.5%', height: '43.5%', orientation: 'square' },
        { id: 'slot-1', top: '5%', left: '51.5%', width: '43.5%', height: '43.5%', orientation: 'square' },
        { id: 'slot-2', top: '51.5%', left: '5%', width: '43.5%', height: '43.5%', orientation: 'square' },
        { id: 'slot-3', top: '51.5%', left: '51.5%', width: '43.5%', height: '43.5%', orientation: 'square' }
      ]
    },
    {
      id: '4-grid-l1-r3',
      name: '左大1 ＋ 右小3',
      slotsCount: 4,
      slots: [
        { id: 'slot-0', top: '5%', left: '5%', width: '50%', height: '90%', orientation: 'portrait' },
        { id: 'slot-1', top: '5%', left: '58%', width: '37%', height: '28%', orientation: 'landscape' },
        { id: 'slot-2', top: '36%', left: '58%', width: '37%', height: '28%', orientation: 'landscape' },
        { id: 'slot-3', top: '67%', left: '58%', width: '37%', height: '28%', orientation: 'landscape' }
      ]
    },
    {
      id: '4-grid-t1-b3',
      name: '上大1 ＋ 下小3',
      slotsCount: 4,
      slots: [
        { id: 'slot-0', top: '5%', left: '5%', width: '90%', height: '45%', orientation: 'landscape' },
        { id: 'slot-1', top: '53%', left: '5%', width: '28%', height: '42%', orientation: 'portrait' },
        { id: 'slot-2', top: '53%', left: '36%', width: '28%', height: '42%', orientation: 'portrait' },
        { id: 'slot-3', top: '53%', left: '67%', width: '28%', height: '42%', orientation: 'portrait' }
      ]
    },
    {
      id: '4-collage',
      name: '重ね合わせコラージュ',
      slotsCount: 4,
      slots: [
        { id: 'slot-0', top: '5%', left: '5%', width: '45%', height: '45%', orientation: 'landscape' },
        { id: 'slot-1', top: '5%', left: '50%', width: '45%', height: '45%', orientation: 'portrait' },
        { id: 'slot-2', top: '50%', left: '5%', width: '45%', height: '45%', orientation: 'portrait' },
        { id: 'slot-3', top: '50%', left: '50%', width: '45%', height: '45%', orientation: 'landscape' }
      ]
    }
  ]
};

export function getLayoutById(id: string): LayoutDef | undefined {
  for (const count of Object.keys(LAYOUT_TEMPLATES)) {
    const found = LAYOUT_TEMPLATES[count].find(tpl => tpl.id === id);
    if (found) return found;
  }
  return undefined;
}

export function getDefaultLayout(slotsCount: number): LayoutDef {
  const list = LAYOUT_TEMPLATES[String(slotsCount)];
  if (list && list.length > 0) return list[0];
  // Fallback to a single photo bleed
  return LAYOUT_TEMPLATES['1'][0];
}
