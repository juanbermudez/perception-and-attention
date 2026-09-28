import { clamp } from "math";

export interface LabelLayout {
  anchorX: number;
  anchorY: number;
  labelX: number;
  labelY: number;
  labelWidth: number;
  labelHeight: number;
  targetX: number;
  targetY: number;
  side: number;
  initialized: boolean;
  /** 0→1 fade-in after a label is placed or changes sides. */
  fade: number;
}
/** Projected extent of the head, in stage pixels. */
export interface Silhouette {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
/** The band labels may occupy, in stage pixels. */
export interface CalloutBounds {
  width: number;
  top: number;
  bottom: number;
  margin: number;
}

const GAP_X = 22; // clearance between the silhouette and a label column
const GAP_Y = 14; // preferred vertical space between stacked labels
const MIN_GAP_Y = 4; // a crowded column squeezes down to this before it overflows
const MIN_RUN = 12; // shortest horizontal run into a label
const FAN = 1.3; // labels spread vertically this much further from the head's centre than their regions
const SWITCH = 28; // hysteresis before a label changes sides while orbiting

interface Cluster {
  items: LabelLayout[];
  top: number;
  size: number;
}

// One-dimensional placement: keep labels in anchor order, merge any that would
// overlap into a cluster, and centre each cluster on the mean of its preferred heights.
// This settles in a few passes and never reorders labels, so leaders don't cross.
// With a `middle`, each label prefers a height fanned out from it, so leaders
// leave their regions at an angle instead of running flat.
export function stackColumn(items: LabelLayout[], top: number, bottom: number, middle?: number) {
  if (!items.length) return;
  items.sort((a, b) => a.anchorY - b.anchorY);
  const preferred = (item: LabelLayout) => (middle === undefined ? item.anchorY : middle + (item.anchorY - middle) * FAN);
  // Use the preferred spacing when the column has room; shrink it only as far as needed to fit.
  let heights = 0;
  for (const item of items) heights += item.labelHeight;
  const gap = clamp((bottom - top - heights) / Math.max(1, items.length - 1), MIN_GAP_Y, GAP_Y);
  const clusters: Cluster[] = [];
  for (const item of items) {
    const size = item.labelHeight + gap;
    clusters.push({ items: [item], top: preferred(item) - size / 2, size });
    while (clusters.length > 1) {
      const b = clusters[clusters.length - 1],
        a = clusters[clusters.length - 2];
      if (a.top + a.size <= b.top) break;
      clusters.pop();
      a.items.push(...b.items);
      a.size += b.size;
      let offset = 0,
        sum = 0;
      for (const member of a.items) {
        const s = member.labelHeight + gap;
        sum += preferred(member) - offset - s / 2;
        offset += s;
      }
      a.top = sum / a.items.length;
    }
  }
  // Fit the whole column inside the band, pushing clusters up from the bottom.
  let limit = bottom + gap / 2;
  for (let i = clusters.length - 1; i >= 0; i--) {
    const c = clusters[i];
    c.top = Math.min(c.top, limit - c.size);
    limit = c.top;
  }
  let floor = top - gap / 2;
  for (const c of clusters) {
    c.top = Math.max(c.top, floor);
    floor = c.top + c.size;
  }
  for (const c of clusters) {
    let y = c.top;
    for (const item of c.items) {
      const s = item.labelHeight + gap;
      item.targetY = y + s / 2;
      y += s;
    }
  }
}

const previousSides: number[] = [];

export function layoutCallouts(labels: LabelLayout[], count: number, head: Silhouette, bounds: CalloutBounds, dt: number, reducedMotion = false) {
  const centre = (head.left + head.right) / 2;
  const left: LabelLayout[] = [],
    right: LabelLayout[] = [];
  for (let i = 0; i < count; i++) {
    const label = labels[i],
      preferred = label.anchorX < centre ? -1 : 1;
    previousSides[i] = label.side;
    if (label.side === 0 || (label.side !== preferred && Math.abs(label.anchorX - centre) > SWITCH)) label.side = preferred;
    (label.side < 0 ? left : right).push(label);
  }
  // If one column would overflow, hand its most central labels to the other side.
  const rowHeight = (labels[0]?.labelHeight ?? 26) + GAP_Y,
    capacity = Math.max(1, Math.floor((bounds.bottom - bounds.top) / rowHeight));
  const balance = (from: LabelLayout[], to: LabelLayout[], side: number) => {
    if (from.length <= capacity || to.length >= capacity) return;
    from.sort((a, b) => Math.abs(a.anchorX - centre) - Math.abs(b.anchorX - centre));
    while (from.length > capacity && to.length < capacity) {
      const moved = from.shift()!;
      moved.side = side;
      to.push(moved);
    }
  };
  balance(left, right, 1);
  balance(right, left, -1);
  // Even out lopsided columns, but only with labels anchored near the middle,
  // so no leader has to cross the whole head.
  const reach = (head.right - head.left) * 0.24;
  const even = (from: LabelLayout[], to: LabelLayout[], side: number) => {
    while (from.length - to.length > 1 && to.length < capacity) {
      let pick = -1,
        best = Infinity;
      for (let i = 0; i < from.length; i++) {
        const d = Math.abs(from[i].anchorX - centre);
        if (d < best && d <= reach) {
          best = d;
          pick = i;
        }
      }
      if (pick < 0) break;
      const [moved] = from.splice(pick, 1);
      moved.side = side;
      to.push(moved);
    }
  };
  even(left, right, 1);
  even(right, left, -1);
  for (const label of left) {
    const half = label.labelWidth / 2;
    label.targetX = clamp(head.left - GAP_X - half, bounds.margin + half, Math.max(bounds.margin + half, bounds.width - bounds.margin - half));
  }
  for (const label of right) {
    const half = label.labelWidth / 2;
    label.targetX = clamp(head.right + GAP_X + half, bounds.margin + half, Math.max(bounds.margin + half, bounds.width - bounds.margin - half));
  }
  const middle = (head.top + head.bottom) / 2;
  stackColumn(left, bounds.top, bounds.bottom, middle);
  stackColumn(right, bounds.top, bounds.bottom, middle);

  // A label restarts only when its final side differs from last frame's. Comparing
  // final sides stops a balanced label from being reset every frame when its
  // preferred side and the balancing step disagree.
  for (let i = 0; i < count; i++) if (previousSides[i] !== 0 && labels[i].side !== previousSides[i]) labels[i].initialized = false;

  // Glide toward the solved slot. A label that changes sides jumps and fades in
  // rather than sliding across the head.
  const seconds = clamp(dt, 0, 0.05),
    blend = reducedMotion ? 1 : 1 - Math.exp(-seconds * 12),
    maxMove = 900 * seconds;
  for (let i = 0; i < count; i++) {
    const label = labels[i];
    label.fade = reducedMotion ? 1 : Math.min(1, label.fade + seconds * 5);
    if (!label.initialized) {
      label.labelX = label.targetX;
      label.labelY = label.targetY;
      label.initialized = true;
      label.fade = reducedMotion ? 1 : 0;
      continue;
    }
    const dx = (label.targetX - label.labelX) * blend,
      dy = (label.targetY - label.labelY) * blend,
      distance = Math.hypot(dx, dy);
    const scale = reducedMotion || distance <= maxMove || distance === 0 ? 1 : maxMove / distance;
    label.labelX += dx * scale;
    label.labelY += dy * scale;
  }
}

/**
 * Anchor → 45° segment → horizontal run into the label's near edge.
 * The bend sits next to the region, so leaders stay apart at their labels'
 * heights until they reach it. When the label is far above or below, the
 * angled segment steepens to leave a short horizontal run.
 */
export function leaderPath(label: LabelLayout): string {
  const toward = label.labelX < label.anchorX ? -1 : 1;
  const edgeX = label.labelX - (toward * label.labelWidth) / 2;
  const reach = (edgeX - label.anchorX) * toward;
  const start = `M${label.anchorX.toFixed(1)},${label.anchorY.toFixed(1)}`;
  const end = `L${edgeX.toFixed(1)},${label.labelY.toFixed(1)}`;
  if (reach <= MIN_RUN) return start + end;
  const elbowX = label.anchorX + toward * Math.min(Math.abs(label.labelY - label.anchorY), reach - MIN_RUN);
  return `${start}L${elbowX.toFixed(1)},${label.labelY.toFixed(1)}${end}`;
}
