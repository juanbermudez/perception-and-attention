// Order diffs for block lists: which ids can stay put when a list is reordered. Pure.

/** Longest common subsequence of two id lists: the blocks that can stay where they are. */
export function stayingIds(before: readonly string[], after: readonly string[]): Set<string> {
  const rows = before.length;
  const cols = after.length;
  const table = Array.from({ length: rows + 1 }, () => new Uint16Array(cols + 1));
  for (let i = rows - 1; i >= 0; i--)
    for (let j = cols - 1; j >= 0; j--) table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const stay = new Set<string>();
  for (let i = 0, j = 0; i < rows && j < cols; ) {
    if (before[i] === after[j]) {
      stay.add(before[i]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return stay;
}
