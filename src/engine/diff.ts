/**
 * Algoritmos de diferencias por líneas (LCS) y formato "unified diff".
 */

export function splitLines(content: string): string[] {
  if (content === '') return [];
  const lines = content.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Para cada línea de `a` devuelve el índice de la línea emparejada en `b`
 * (o -1) según la subsecuencia común más larga.
 */
export function lcsMatches(a: string[], b: string[]): number[] {
  const n = a.length;
  const m = b.length;
  // Recorta prefijo y sufijo comunes para reducir la tabla.
  let start = 0;
  while (start < n && start < m && a[start] === b[start]) start++;
  let endA = n;
  let endB = m;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const result = new Array<number>(n).fill(-1);
  for (let i = 0; i < start; i++) result[i] = i;
  for (let i = 0; i < n - endA; i++) result[endA + i] = endB + i;

  const rows = endA - start;
  const cols = endB - start;
  if (rows > 0 && cols > 0) {
    const dp: Uint32Array[] = [];
    for (let i = 0; i <= rows; i++) dp.push(new Uint32Array(cols + 1));
    for (let i = rows - 1; i >= 0; i--) {
      for (let j = cols - 1; j >= 0; j--) {
        dp[i][j] =
          a[start + i] === b[start + j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < rows && j < cols) {
      if (a[start + i] === b[start + j]) {
        result[start + i] = start + j;
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
  }
  return result;
}

export type DiffOp = { type: 'equal' | 'add' | 'del'; text: string; oldNo?: number; newNo?: number };

export function diffLines(oldContent: string, newContent: string): DiffOp[] {
  const a = splitLines(oldContent);
  const b = splitLines(newContent);
  const matches = lcsMatches(a, b);
  const ops: DiffOp[] = [];
  let j = 0;
  for (let i = 0; i < a.length; i++) {
    const mj = matches[i];
    if (mj === -1) {
      ops.push({ type: 'del', text: a[i], oldNo: i + 1 });
      continue;
    }
    while (j < mj) {
      ops.push({ type: 'add', text: b[j], newNo: j + 1 });
      j++;
    }
    ops.push({ type: 'equal', text: a[i], oldNo: i + 1, newNo: j + 1 });
    j++;
  }
  while (j < b.length) {
    ops.push({ type: 'add', text: b[j], newNo: j + 1 });
    j++;
  }
  return ops;
}

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  ops: DiffOp[];
}

export function hunks(ops: DiffOp[], context = 3): Hunk[] {
  const changeIdx = ops.map((o, i) => (o.type === 'equal' ? -1 : i)).filter((i) => i >= 0);
  if (changeIdx.length === 0) return [];
  const groups: [number, number][] = [];
  let gs = Math.max(0, changeIdx[0] - context);
  let ge = Math.min(ops.length - 1, changeIdx[0] + context);
  for (const idx of changeIdx.slice(1)) {
    if (idx - context <= ge + 1) ge = Math.min(ops.length - 1, idx + context);
    else {
      groups.push([gs, ge]);
      gs = Math.max(0, idx - context);
      ge = Math.min(ops.length - 1, idx + context);
    }
  }
  groups.push([gs, ge]);

  return groups.map(([s, e]) => {
    const slice = ops.slice(s, e + 1);
    // Número de línea inicial: busca hacia atrás la última referencia conocida.
    let oldStart = 0;
    let newStart = 0;
    for (let k = 0; k < s; k++) {
      if (ops[k].type !== 'add') oldStart++;
      if (ops[k].type !== 'del') newStart++;
    }
    const oldLines = slice.filter((o) => o.type !== 'add').length;
    const newLines = slice.filter((o) => o.type !== 'del').length;
    return {
      oldStart: oldLines === 0 ? oldStart : oldStart + 1,
      oldLines,
      newStart: newLines === 0 ? newStart : newStart + 1,
      newLines,
      ops: slice,
    };
  });
}

export function hunkHeader(h: Hunk): string {
  const o = h.oldLines === 1 ? `${h.oldStart}` : `${h.oldStart},${h.oldLines}`;
  const n = h.newLines === 1 ? `${h.newStart}` : `${h.newStart},${h.newLines}`;
  return `@@ -${o} +${n} @@`;
}

export function countChanges(oldContent: string, newContent: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const op of diffLines(oldContent, newContent)) {
    if (op.type === 'add') added++;
    else if (op.type === 'del') removed++;
  }
  return { added, removed };
}
