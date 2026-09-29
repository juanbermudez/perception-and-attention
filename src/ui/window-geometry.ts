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
/** Windows keep the same margin from the top of the stage as from its other edges (the rail is beside the stage). */
export const TOP_INSET = MARGIN;
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

const finiteOr = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

/** Keeps a window's size sane and at least 48 px of it (and its whole header row) inside the stage. */
export function constrain(rect: Rect, stage: StageSize): Rect {
  const w = Math.round(Math.max(MIN_SIZE.w, Math.min(finiteOr(rect.w, MIN_SIZE.w), Math.max(MIN_SIZE.w, stage.width))));
  const h = Math.round(Math.max(MIN_SIZE.h, Math.min(finiteOr(rect.h, MIN_SIZE.h), Math.max(MIN_SIZE.h, stage.height))));
  const x = Math.round(Math.min(Math.max(finiteOr(rect.x, MARGIN), MIN_VISIBLE - w), stage.width - MIN_VISIBLE));
  const y = Math.round(Math.min(Math.max(finiteOr(rect.y, TOP_INSET), 0), Math.max(0, stage.height - MIN_VISIBLE)));
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

/**
 * A cascade of medium windows, the front one in the center slot. When the stage has too little room
 * for 28 px steps, the steps shrink and the cascade shifts, so every window stays inside the stage.
 */
function stack(count: number, stage: StageSize): Rect[] {
  const size = sizeFor("m", stage);
  const center = slotRect("center", size, stage);
  const slackX = stage.width - 2 * MARGIN - size.w;
  const slackY = stage.height - TOP_INSET - MARGIN - size.h;
  const step = count > 1 ? Math.max(0, Math.min(CASCADE, slackX / (count - 1), slackY / (count - 1))) : 0;
  const span = step * (count - 1);
  const front = {
    x: Math.min(Math.max(center.x, MARGIN + span), stage.width - MARGIN - size.w),
    y: Math.min(Math.max(center.y, TOP_INSET + span), stage.height - MARGIN - size.h),
  };
  return Array.from({ length: count }, (_, index) =>
    constrain({ x: front.x - (count - 1 - index) * step, y: front.y - (count - 1 - index) * step, ...size }, stage),
  );
}

/**
 * The grid for tiling `count` windows in the free area: side by side up to three, then about square.
 * When that grid's cells would be smaller than `MIN_SIZE`, the grid whose cells are roomiest
 * (relative to `MIN_SIZE`) wins; null when no grid fits.
 */
function tileGrid(count: number, area: { w: number; h: number }): { cols: number; rows: number } | null {
  const cell = (cols: number) => {
    const rows = Math.ceil(count / cols);
    return { cols, rows, w: (area.w - GAP * (cols - 1)) / cols, h: (area.h - GAP * (rows - 1)) / rows };
  };
  const fits = (grid: { w: number; h: number }) => grid.w >= MIN_SIZE.w && grid.h >= MIN_SIZE.h;
  const preferred = cell(count <= 3 ? count : Math.ceil(Math.sqrt(count)));
  if (fits(preferred)) return preferred;
  const room = (grid: { w: number; h: number }) => Math.min(grid.w / MIN_SIZE.w, grid.h / MIN_SIZE.h);
  const options = Array.from({ length: count }, (_, index) => cell(index + 1)).filter(fits);
  return options.sort((a, b) => room(b) - room(a))[0] ?? null;
}

/** Rects for `count` windows: `tile` splits the free area into a grid (or stacks when the stage is too small for one); `stack` cascades them. */
export function arrange(layout: Layout, count: number, stage: StageSize): Rect[] {
  if (count <= 0) return [];
  const area = { x: MARGIN, y: TOP_INSET, w: stage.width - 2 * MARGIN, h: stage.height - TOP_INSET - MARGIN };
  const grid = layout === "tile" ? tileGrid(count, area) : null;
  if (!grid) return stack(count, stage);
  const w = (area.w - GAP * (grid.cols - 1)) / grid.cols;
  const h = (area.h - GAP * (grid.rows - 1)) / grid.rows;
  return Array.from({ length: count }, (_, index) => {
    const col = index % grid.cols;
    const row = Math.floor(index / grid.cols);
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
