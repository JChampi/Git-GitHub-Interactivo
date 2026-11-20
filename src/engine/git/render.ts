/**
 * Renderizado de diffs, estadísticas y commits con formato de Git.
 */
import { countChanges, diffLines, hunkHeader, hunks } from '../diff';
import type { Out } from '../output';
import { formatDate, readBlob, short } from '../repo';
import type { Commit, ObjectStore, Tree } from '../types';
import { plural } from './context';

export interface FileDelta {
  path: string;
  oldContent: string | null;
  newContent: string | null;
  oldSha?: string;
  newSha?: string;
}

export function treeDeltas(
  objects: ObjectStore,
  oldTree: Tree,
  newContents: Record<string, string> | Tree,
  newIsTree = true,
  filter?: (p: string) => boolean,
): FileDelta[] {
  const deltas: FileDelta[] = [];
  const newTree = newContents as Record<string, string>;
  for (const p of [...new Set([...Object.keys(oldTree), ...Object.keys(newTree)])].sort()) {
    if (filter && !filter(p)) continue;
    const oldC = p in oldTree ? readBlob(objects, oldTree[p]) : null;
    const newC = p in newTree ? (newIsTree ? readBlob(objects, newTree[p]) : newTree[p]) : null;
    if (oldC === newC) continue;
    deltas.push({ path: p, oldContent: oldC, newContent: newC, oldSha: oldTree[p], newSha: newIsTree ? newTree[p] : undefined });
  }
  return deltas;
}

export function renderUnifiedDiff(out: Out, deltas: FileDelta[], hashFn: (c: string) => string): void {
  for (const d of deltas) {
    const oldSha = d.oldContent === null ? '0000000' : short(d.oldSha ?? hashFn(d.oldContent));
    const newSha = d.newContent === null ? '0000000' : short(d.newSha ?? hashFn(d.newContent));
    out.line([`diff --git a/${d.path} b/${d.path}`, 'bold']);
    if (d.oldContent === null) out.line(['new file mode 100644', 'bold']);
    if (d.newContent === null) out.line(['deleted file mode 100644', 'bold']);
    out.line([`index ${oldSha}..${newSha}${d.oldContent !== null && d.newContent !== null ? ' 100644' : ''}`, 'bold']);
    out.line([d.oldContent === null ? '--- /dev/null' : `--- a/${d.path}`, 'bold']);
    out.line([d.newContent === null ? '+++ /dev/null' : `+++ b/${d.path}`, 'bold']);
    const ops = diffLines(d.oldContent ?? '', d.newContent ?? '');
    for (const h of hunks(ops)) {
      out.line([hunkHeader(h), 'cyan']);
      for (const op of h.ops) {
        if (op.type === 'add') out.line(['+' + op.text, 'green']);
        else if (op.type === 'del') out.line(['-' + op.text, 'red']);
        else out.line(' ' + op.text);
      }
    }
  }
}

export function renderStat(out: Out, deltas: FileDelta[], withSummary = true): { files: number; ins: number; del: number } {
  let ins = 0;
  let del = 0;
  const width = Math.max(0, ...deltas.map((d) => d.path.length));
  for (const d of deltas) {
    const c = countChanges(d.oldContent ?? '', d.newContent ?? '');
    ins += c.added;
    del += c.removed;
    const total = c.added + c.removed;
    const scale = total > 40 ? 40 / total : 1;
    out.line(
      ` ${d.path.padEnd(width)} | ${String(total).padStart(3)} `,
      ['+'.repeat(Math.round(c.added * scale)), 'green'],
      ['-'.repeat(Math.round(c.removed * scale)), 'red'],
    );
  }
  if (withSummary) out.line(' ' + statSummary(deltas.length, ins, del));
  return { files: deltas.length, ins, del };
}

export function statSummary(files: number, ins: number, del: number): string {
  const parts = [plural(files, 'file changed', 'files changed')];
  if (ins || !del) parts.push(`${ins} insertion${ins === 1 ? '' : 's'}(+)`);
  if (del) parts.push(`${del} deletion${del === 1 ? '' : 's'}(-)`);
  return parts.join(', ');
}

export function commitSummary(objects: ObjectStore, parentTree: Tree, tree: Tree): { line: string; modes: string[] } {
  const deltas = treeDeltas(objects, parentTree, tree);
  let ins = 0;
  let del = 0;
  const modes: string[] = [];
  for (const d of deltas) {
    const c = countChanges(d.oldContent ?? '', d.newContent ?? '');
    ins += c.added;
    del += c.removed;
    if (d.oldContent === null) modes.push(` create mode 100644 ${d.path}`);
    if (d.newContent === null) modes.push(` delete mode 100644 ${d.path}`);
  }
  return { line: ' ' + statSummary(deltas.length, ins, del), modes };
}

export function renderCommitHeader(out: Out, c: Commit, deco?: string[]): void {
  out.line(['commit ' + c.sha, 'yellow'], ...decoSegs(deco));
  if (c.parents.length > 1) out.line('Merge: ' + c.parents.map(short).join(' '));
  out.line(`Author: ${c.author.name} <${c.author.email}>`);
  out.line(`Date:   ${formatDate(c.timestamp)}`);
  out.blank();
  for (const l of c.message.split('\n')) out.line('    ' + l);
}

export function decoSegs(deco?: string[]): [string, 'yellow' | 'cyan' | 'green' | 'red' | 'bold' | undefined][] {
  if (!deco || !deco.length) return [];
  const segs: [string, 'yellow' | 'cyan' | 'green' | 'red' | 'bold' | undefined][] = [[' (', 'yellow']];
  deco.forEach((d, i) => {
    if (i) segs.push([', ', 'yellow']);
    if (d.startsWith('HEAD -> ')) {
      segs.push(['HEAD -> ', 'cyan'], [d.slice(8), 'green']);
    } else if (d === 'HEAD') segs.push(['HEAD', 'cyan']);
    else if (d.startsWith('tag: ')) segs.push([d, 'yellow']);
    else if (d.includes('/')) segs.push([d, 'red']);
    else segs.push([d, 'green']);
  });
  segs.push([')', 'yellow']);
  return segs;
}
