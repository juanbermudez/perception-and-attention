// Window geometry (spec §8): named slots and sizes resolved against the stage, constraining,
// cascading and arranging. Pure numbers, so it is tested in Node; `ui/windows.ts` applies it.

export const SLOTS = ["left", "right", "center", "top-left", "top-right", "bottom-left", "bottom-right"] as const;
export type Slot = (typeof SLOTS)[number];
export const SIZES = ["s", "m", "l"] as const;
export type SizeName = (typeof SIZES)[number];
export const LAYOUTS = ["tile", "stack"] as const;
export type Layout = (typeof LAYOUTS)[number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface StageSize {
  width: number;
  height: number;
}

/** At least this much of a window stays inside the stage, so it can always be dragged back. */
export const MIN_VISIBLE = 48;
export const MARGIN = 16;
/** Room for the topic dock along the top of the stage. */
export const TOP_INSET = 80;
export const MIN_SIZE = { w: 260, h: 180 };
/** Below this viewport width windows become bottom sheets, one at a time. */
export const MOBILE_WIDTH = 720;
export const MAX_OPEN = 8;
const CASCADE = 28;
const GAP = 12;

/** `s` 320×380, `m` 440×540, `l` 600×min(760, stage − 40), each shrunk to fit the stage. */
export function sizeFor(name: SizeName, stage: StageSize): { w: number; h: number } {
  const wanted = name === "s" ? { w: 320, h: 380 } : name === "m" ? { w: 440, h: 540 } : { w: 600, h: Math.min(760, stage.height - 40) };
  return fit(wanted, stage);
}

function fit(size: { w: number; h: number }, stage: StageSize) {
  const maxW = Math.max(MIN_SIZE.w, stage.width - 2 * MARGIN);
  const maxH = Math.max(MIN_SIZE.h, stage.height - TOP_INSET - MARGIN);
  return { w: Math.round(Math.min(Math.max(size.w, MIN_SIZE.w), maxW)), h: Math.round(Math.min(Math.max(size.h, MIN_SIZE.h), maxH)) };
}

/** Where a window of this size sits in a named slot. */
export function slotRect(slot: Slot, size: { w: number; h: number }, stage: StageSize): Rect {
  const { w, h } = fit(size, stage);
  const top = TOP_INSET;
  const bottom = stage.height - MARGIN - h;
  const middleY = Math.max(top, Math.round(top + (stage.height - top - MARGIN - h) / 2));
  const left = MARGIN;
  const right = stage.width - MARGIN - w;
  const centerX = Math.round((stage.width - w) / 2);
  const at: Record<Slot, [number, number]> = {
    left: [left, middleY],
    right: [right, middleY],
    center: [centerX, middleY],
    "top-left": [left, top],
    "top-right": [right, top],
    "bottom-left": [left, Math.max(top, bottom)],
    "bottom-right": [right, Math.max(top, bottom)],
  };
  const [x, y] = at[slot];
  return constrain({ x, y, w, h }, stage);
}

/** Keeps a window's size sane and at least 48 px of it (and its whole header row) inside the stage. */
export function constrain(rect: Rect, stage: StageSize): Rect {
  const w = Math.round(Math.max(MIN_SIZE.w, Math.min(rect.w, Math.max(MIN_SIZE.w, stage.width))));
  const h = Math.round(Math.max(MIN_SIZE.h, Math.min(rect.h, Math.max(MIN_SIZE.h, stage.height))));
  const x = Math.round(Math.min(Math.max(rect.x, MIN_VISIBLE - w), stage.width - MIN_VISIBLE));
  const y = Math.round(Math.min(Math.max(rect.y, 0), Math.max(0, stage.height - MIN_VISIBLE)));
  return { x, y, w, h };
}

/** Moves a new window down and right until its corner is clear of the others'. */
export function cascade(rect: Rect, others: readonly Rect[], stage: StageSize): Rect {
  let next = rect;
  for (let step = 0; step < 12; step++) {
    if (!others.some((other) => Math.abs(other.x - next.x) < 8 && Math.abs(other.y - next.y) < 8)) return next;
    const moved = constrain({ ...next, x: next.x - CASCADE, y: next.y + CASCADE }, stage);
    if (moved.x === next.x && moved.y === next.y) return next;
    next = moved;
  }
  return next;
}

/** Rects for `count` windows: `tile` splits the free area into a grid; `stack` cascades them. */
export function arrange(layout: Layout, count: number, stage: StageSize): Rect[] {
  if (count <= 0) return [];
  const area = { x: MARGIN, y: TOP_INSET, w: Math.max(MIN_SIZE.w, stage.width - 2 * MARGIN), h: Math.max(MIN_SIZE.h, stage.height - TOP_INSET - MARGIN) };
  if (layout === "stack") {
    const size = sizeFor("m", stage);
    const start = slotRect("center", size, stage);
    return Array.from({ length: count }, (_, index) =>
      constrain({ x: start.x - (count - 1 - index) * CASCADE, y: start.y - (count - 1 - index) * CASCADE, ...size }, stage),
    );
  }
  const cols = count <= 3 ? count : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const w = (area.w - GAP * (cols - 1)) / cols;
  const h = (area.h - GAP * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return constrain({ x: area.x + col * (w + GAP), y: area.y + row * (h + GAP), w, h }, stage);
  });
}

/** The slot whose position (for a window of this size) is closest to the rect's. */
export function nearestSlot(rect: Rect, stage: StageSize): Slot {
  let best: Slot = "center";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const slot of SLOTS) {
    const at = slotRect(slot, rect, stage);
    const distance = Math.hypot(at.x - rect.x, at.y - rect.y);
    if (distance < bestDistance) {
      best = slot;
      bestDistance = distance;
    }
  }
  return best;
}

export const isMobile = (viewportWidth: number) => viewportWidth < MOBILE_WIDTH;
