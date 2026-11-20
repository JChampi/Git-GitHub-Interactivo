/**
 * Fusión de tres vías (diff3) por líneas y fusión de árboles.
 */
import { lcsMatches, splitLines } from './diff';

export interface TextMergeResult {
  clean: boolean;
  content: string;
  conflictCount: number;
}

function eq(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Fusiona `ours` y `theirs` tomando `base` como ancestro común.
 * Cuando ambos lados cambian la misma zona de forma distinta se generan
 * marcadores de conflicto como los de Git.
 */
export function mergeText(
  base: string,
  ours: string,
  theirs: string,
  oursLabel = 'HEAD',
  theirsLabel = 'theirs',
): TextMergeResult {
  if (ours === theirs) return { clean: true, content: ours, conflictCount: 0 };
  if (base === ours) return { clean: true, content: theirs, conflictCount: 0 };
  if (base === theirs) return { clean: true, content: ours, conflictCount: 0 };

  const o = splitLines(base);
  const a = splitLines(ours);
  const b = splitLines(theirs);
  const mA = lcsMatches(o, a);
  const mB = lcsMatches(o, b);

  const out: string[] = [];
  let conflicts = 0;
  let iO = 0;
  let iA = 0;
  let iB = 0;

  while (true) {
    // Siguiente línea de la base presente en los tres lados.
    let k = iO;
    while (k < o.length && (mA[k] === -1 || mB[k] === -1 || mA[k] < iA || mB[k] < iB)) k++;
    const found = k < o.length;
    const endA = found ? mA[k] : a.length;
    const endB = found ? mB[k] : b.length;

    if (found && k === iO && endA === iA && endB === iB) {
      out.push(o[k]);
      iO++;
      iA++;
      iB++;
      continue;
    }

    const oc = o.slice(iO, k);
    const ac = a.slice(iA, endA);
    const bc = b.slice(iB, endB);
    if (oc.length || ac.length || bc.length) {
      if (eq(ac, oc)) out.push(...bc);
      else if (eq(bc, oc)) out.push(...ac);
      else if (eq(ac, bc)) out.push(...ac);
      else {
        conflicts++;
        out.push(`<<<<<<< ${oursLabel}`, ...ac, '=======', ...bc, `>>>>>>> ${theirsLabel}`);
      }
    }
    iO = k;
    iA = endA;
    iB = endB;
    if (!found) break;
  }

  const trailing = ours.endsWith('\n') || theirs.endsWith('\n') || (ours === '' && theirs === '');
  const content = out.length ? out.join('\n') + (trailing ? '\n' : '') : '';
  return { clean: conflicts === 0, content, conflictCount: conflicts };
}

export function hasConflictMarkers(content: string): boolean {
  return /^<<<<<<< /m.test(content) && /^=======$/m.test(content) && /^>>>>>>> /m.test(content);
}

export type ConflictKind = 'content' | 'modify/delete' | 'add/add';

export interface TreeMergeEntry {
  path: string;
  /** Contenido resultante (con marcadores si hay conflicto) o null si se elimina. */
  content: string | null;
  conflict?: ConflictKind;
  /** Quién eliminó el archivo en un conflicto modify/delete. */
  deletedBy?: 'ours' | 'theirs';
}

/**
 * Fusiona tres árboles expresados como ruta → contenido.
 */
export function mergeTrees(
  base: Record<string, string>,
  ours: Record<string, string>,
  theirs: Record<string, string>,
  oursLabel: string,
  theirsLabel: string,
): TreeMergeEntry[] {
  const paths = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
  const result: TreeMergeEntry[] = [];
  for (const path of [...paths].sort()) {
    const b = base[path];
    const o = ours[path];
    const t = theirs[path];
    if (o === t) {
      result.push({ path, content: o ?? null });
    } else if (b === o) {
      result.push({ path, content: t ?? null });
    } else if (b === t) {
      result.push({ path, content: o ?? null });
    } else if (o === undefined || t === undefined) {
      // Un lado eliminó y el otro modificó.
      result.push({
        path,
        content: (o ?? t) as string,
        conflict: 'modify/delete',
        deletedBy: o === undefined ? 'ours' : 'theirs',
      });
    } else {
      const merged = mergeText(b ?? '', o, t, oursLabel, theirsLabel);
      result.push(
        merged.clean
          ? { path, content: merged.content }
          : { path, content: merged.content, conflict: b === undefined ? 'add/add' : 'content' },
      );
    }
  }
  return result;
}
