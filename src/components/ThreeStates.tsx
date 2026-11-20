/**
 * Visualización de los tres estados de Git sobre el repositorio real del
 * laboratorio: Working Directory → Staging Area → Repositorio (HEAD).
 * Los botones ejecutan comandos reales en la terminal del laboratorio.
 */
import { ArrowRight, Database, FileText, FolderOpen, Layers } from 'lucide-react';
import { useMemo, useState } from 'react';
import { hashBlob } from '../engine/sha1';
import { findRepo, headTree, readBlob, worktree, ignoreRules, short, headSha } from '../engine/repo';
import { isIgnored } from '../engine/ignore';
import { useLab, useLabs } from '../store/labs';
import { useProgress } from '../store/progress';
import { useUI } from '../store/ui';
import { DiffView } from './DiffView';
import { Badge, Button, cx } from './ui';

type Cell = { content: string | null; sha: string | null };

export function ThreeStates({ labId, compact }: { labId: string; compact?: boolean }) {
  const lab = useLab(labId);
  const run = useLabs((s) => s.run);
  const record = useProgress((s) => s.recordCommands);
  const setTopic = useUI((s) => s.setTopic);
  const world = lab.world;
  const repo = findRepo(world);
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const rows = useMemo(() => {
    if (!repo) return [];
    const work = worktree(world, repo);
    const head = headTree(repo);
    const rules = ignoreRules(world, repo);
    const paths = [...new Set([...Object.keys(work), ...Object.keys(repo.index), ...Object.keys(head)])].filter((p) => !(isIgnored(rules, p) && !(p in repo.index))).sort();
    return paths.map((p) => {
      const w: Cell = { content: work[p] ?? null, sha: p in work ? hashBlob(work[p]) : null };
      const i: Cell = { content: p in repo.index ? readBlob(repo.objects, repo.index[p]) : null, sha: repo.index[p] ?? null };
      const h: Cell = { content: p in head ? readBlob(repo.objects, head[p]) : null, sha: head[p] ?? null };
      return { path: p, w, i, h };
    });
  }, [world, repo]);

  if (!repo) {
    return (
      <div className="rounded-lg border border-dashed border-line-2 p-6 text-center text-sm text-muted">
        Esta carpeta todavía no es un repositorio. Ejecuta <code className="font-mono text-accent">git init</code> en la terminal para crear las tres áreas.
      </div>
    );
  }

  const exec = (cmd: string) => {
    const r = run(labId, cmd);
    record(r.records);
    if (r.topic) setTopic(r.topic);
  };

  const current = rows.find((r) => r.path === sel) ?? null;
  const stagedCount = rows.filter((r) => r.i.sha !== r.h.sha).length;

  const state = (r: (typeof rows)[number]) => {
    if (r.w.sha === null && r.i.sha === null) return { wd: 'eliminado', st: 'eliminación preparada', tone: 'red' as const };
    if (r.i.sha === null) return { wd: 'sin rastrear', st: '—', tone: 'green' as const };
    return null;
  };

  return (
    <div className="space-y-3">
      <div className={cx('grid gap-2', compact ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 md:grid-cols-3')}>
        {(
          [
            { key: 'w', title: 'Working Directory', sub: 'Tus archivos en disco', icon: <FolderOpen size={15} />, color: 'text-gyellow' },
            { key: 'i', title: 'Staging Area', sub: 'Lo que irá en el próximo commit', icon: <Layers size={15} />, color: 'text-ggreen' },
            { key: 'h', title: 'Repositorio', sub: headSha(repo) ? `Último commit (HEAD ${short(headSha(repo)!)})` : 'Sin commits todavía', icon: <Database size={15} />, color: 'text-gblue' },
          ] as const
        ).map((col, ci) => (
          <div key={col.key} className="relative rounded-lg border border-line bg-bg-1">
            <div className="border-b border-line px-3 py-2">
              <p className={cx('flex items-center gap-1.5 text-sm font-semibold', col.color)}>
                {col.icon} {col.title}
              </p>
              <p className="text-[11px] text-muted">{col.sub}</p>
            </div>
            <ul className="max-h-56 min-h-16 overflow-auto p-1.5">
              {rows.map((r) => {
                const cell = r[col.key];
                const prev = col.key === 'w' ? null : col.key === 'i' ? r.w : r.i;
                const differs = col.key === 'w' ? r.w.sha !== r.i.sha : col.key === 'i' ? r.i.sha !== r.h.sha : false;
                if (cell.sha === null && !(col.key === 'w' && r.i.sha)) return null;
                const s = state(r);
                return (
                  <li key={r.path}>
                    <button
                      onClick={() => setSel(r.path)}
                      className={cx('flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[12.5px] cursor-pointer', sel === r.path ? 'bg-gblue/15' : 'hover:bg-bg-3', cell.sha === null && 'line-through opacity-60')}
                    >
                      <FileText size={13} className="shrink-0 text-muted" />
                      <span className="truncate font-mono">{r.path}</span>
                      <span className="ml-auto shrink-0">
                        {col.key === 'w' && s && <Badge tone={s.tone}>{s.wd}</Badge>}
                        {col.key === 'w' && !s && differs && <Badge tone="yellow">modificado</Badge>}
                        {col.key === 'i' && differs && <Badge tone="green">{r.h.sha === null ? 'nuevo' : 'preparado'}</Badge>}
                        {col.key === 'h' && <span className="font-mono text-[10px] text-muted">{short(cell.sha ?? '')}</span>}
                      </span>
                    </button>
                    {void prev}
                  </li>
                );
              })}
              {!rows.length && <li className="px-2 py-3 text-center text-xs text-muted">Vacío</li>}
            </ul>
            {ci < 2 && (
              <span className="absolute -right-3.5 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-bg-3 text-accent md:flex">
                <ArrowRight size={14} />
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-bg-1 px-3 py-2">
        <span className="text-xs text-muted">Acciones (se ejecutan en la terminal):</span>
        <Button size="sm" disabled={!current || current.w.sha === current.i.sha} onClick={() => current && exec(`git add ${current.path}`)}>
          git add {current?.path ?? '<archivo>'}
        </Button>
        <Button size="sm" disabled={!current || current.i.sha === current.h.sha || !headSha(repo)} onClick={() => current && exec(`git restore --staged ${current.path}`)}>
          git restore --staged
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Mensaje del commit" aria-label="Mensaje del commit" className="min-w-0 flex-1 rounded-md border border-line bg-bg-0 px-2 py-1 text-xs outline-none focus:border-gblue" />
          <Button
            size="sm"
            variant="primary"
            disabled={!stagedCount || !msg.trim()}
            onClick={() => {
              exec(`git commit -m "${msg.replace(/"/g, '\\"')}"`);
              setMsg('');
            }}
          >
            git commit
          </Button>
        </div>
      </div>

      {current && (
        <div className="rounded-lg border border-line bg-bg-1 animate-in">
          <p className="border-b border-line px-3 py-2 text-xs">
            <span className="font-mono font-semibold">{current.path}</span>
            <span className="ml-2 text-muted">
              {current.w.sha === current.i.sha && current.i.sha === current.h.sha
                ? 'Las tres versiones son idénticas: el archivo está confirmado y sin cambios.'
                : current.i.sha === null
                  ? 'Solo existe en el working directory: usa git add para que Git lo rastree.'
                  : current.w.sha !== current.i.sha
                    ? 'El working directory tiene cambios que aún no están en staging.'
                    : 'Staging contiene cambios que todavía no están en ningún commit.'}
            </span>
          </p>
          <div className="grid gap-px bg-line md:grid-cols-2">
            <div className="bg-bg-1">
              <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Staging → Working Directory (git diff)</p>
              <DiffView before={current.i.content} after={current.w.content} />
            </div>
            <div className="bg-bg-1">
              <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">HEAD → Staging (git diff --staged)</p>
              <DiffView before={current.h.content} after={current.i.content} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
