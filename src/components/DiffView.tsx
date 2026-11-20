import { FileDiff, FileMinus, FilePlus } from 'lucide-react';
import { useState } from 'react';
import { countChanges, diffLines, hunkHeader, hunks } from '../engine/diff';
import { firstLine, formatDate, getCommit, readBlob, short } from '../engine/repo';
import type { ObjectStore } from '../engine/types';
import { Badge, cx } from './ui';

export function DiffView({ before, after, className }: { before: string | null; after: string | null; className?: string }) {
  const ops = diffLines(before ?? '', after ?? '');
  const hs = hunks(ops, 3);
  if (!hs.length) return <p className="px-3 py-2 text-xs text-muted">Sin diferencias de contenido.</p>;
  return (
    <div className={cx('overflow-x-auto font-mono text-[12px] leading-[1.5]', className)}>
      {hs.map((h, i) => (
        <div key={i}>
          <div className="bg-gblue/10 px-3 py-0.5 text-gcyan">{hunkHeader(h)}</div>
          {h.ops.map((op, j) => (
            <div key={j} className={cx('flex whitespace-pre', op.type === 'add' && 'bg-ggreen/12', op.type === 'del' && 'bg-gred/12')}>
              <span className="w-10 shrink-0 select-none pr-1 text-right text-muted/70">{op.oldNo ?? ''}</span>
              <span className="w-10 shrink-0 select-none pr-1 text-right text-muted/70">{op.newNo ?? ''}</span>
              <span className={cx('w-4 shrink-0 select-none text-center', op.type === 'add' ? 'text-ggreen' : op.type === 'del' ? 'text-gred' : 'text-muted')}>
                {op.type === 'add' ? '+' : op.type === 'del' ? '-' : ' '}
              </span>
              <span className={cx('pr-4', op.type === 'add' ? 'text-ggreen' : op.type === 'del' ? 'text-gred' : 'text-fg-2')}>{op.text}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function FileChangeList({ files, defaultOpen = false }: { files: { path: string; before: string | null; after: string | null }[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!files.length) return <p className="px-3 py-2 text-xs text-muted">Este commit no cambia archivos.</p>;
  return (
    <div className="divide-y divide-line">
      {files.map((f) => {
        const c = countChanges(f.before ?? '', f.after ?? '');
        const isOpen = open[f.path] ?? defaultOpen;
        return (
          <div key={f.path}>
            <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-bg-3 cursor-pointer" onClick={() => setOpen((o) => ({ ...o, [f.path]: !isOpen }))}>
              {f.before === null ? <FilePlus size={13} className="text-ggreen" /> : f.after === null ? <FileMinus size={13} className="text-gred" /> : <FileDiff size={13} className="text-gyellow" />}
              <span className="truncate font-mono">{f.path}</span>
              <span className="ml-auto shrink-0 font-mono">
                <span className="text-ggreen">+{c.added}</span> <span className="text-gred">−{c.removed}</span>
              </span>
            </button>
            {isOpen && <DiffView before={f.before} after={f.after} className="border-t border-line bg-bg-1" />}
          </div>
        );
      })}
    </div>
  );
}

export function commitFiles(objects: ObjectStore, sha: string) {
  const c = objects.commits[sha];
  const parent = c.parents[0] ? objects.commits[c.parents[0]]?.tree ?? {} : {};
  return [...new Set([...Object.keys(parent), ...Object.keys(c.tree)])]
    .filter((p) => parent[p] !== c.tree[p])
    .sort()
    .map((p) => ({ path: p, before: p in parent ? readBlob(objects, parent[p]) : null, after: p in c.tree ? readBlob(objects, c.tree[p]) : null }));
}

export function CommitDetails({ objects, sha, branches }: { objects: ObjectStore; sha: string; branches?: string[] }) {
  const c = getCommit({ objects }, sha);
  if (!c) return null;
  const files = commitFiles(objects, sha);
  return (
    <div className="animate-in">
      <div className="space-y-1.5 border-b border-line px-3 py-3">
        <p className="text-sm font-semibold text-fg">{firstLine(c.message)}</p>
        {c.message.includes('\n') && <p className="whitespace-pre-wrap text-xs text-fg-2">{c.message.split('\n').slice(1).join('\n').trim()}</p>}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <Badge tone="yellow">
            <span className="font-mono">{short(c.sha)}</span>
          </Badge>
          {c.parents.length > 1 && <Badge tone="purple">merge · {c.parents.length} padres</Badge>}
          {!c.parents.length && <Badge tone="blue">commit raíz</Badge>}
          {branches?.map((b) => (
            <Badge key={b} tone="green">
              {b}
            </Badge>
          ))}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px]">
          <dt className="text-muted">Autor</dt>
          <dd className="truncate">
            {c.author.name} &lt;{c.author.email}&gt;
          </dd>
          <dt className="text-muted">Fecha</dt>
          <dd>{formatDate(c.timestamp)}</dd>
          <dt className="text-muted">SHA</dt>
          <dd className="break-all font-mono text-[10.5px] text-fg-2">{c.sha}</dd>
          <dt className="text-muted">Padres</dt>
          <dd className="font-mono text-[10.5px]">{c.parents.length ? c.parents.map(short).join(', ') : '— (primer commit)'}</dd>
        </dl>
      </div>
      <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{c.parents.length > 1 ? 'Cambios respecto al primer padre' : 'Cambios respecto al commit anterior'}</p>
      <FileChangeList files={files} defaultOpen={files.length <= 2} />
    </div>
  );
}
