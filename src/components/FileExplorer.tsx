/**
 * Explorador de archivos estilo VS Code sobre el sistema de archivos virtual.
 * Muestra el estado Git de cada archivo y permite crear, renombrar, editar y
 * eliminar. Los cambios se reflejan inmediatamente en git status.
 */
import { ChevronDown, ChevronRight, FilePlus2, FileText, Folder, FolderGit2, FolderOpen, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { computeStatus, currentBranch, headSha, short } from '../engine/repo';
import type { World } from '../engine/types';
import { basename, dirname, exists, isDir, isInside, join, listDir, mkdirp, move, relative, remove, writeFile } from '../engine/vfs';
import { useLab, useLabs } from '../store/labs';
import { ConfirmDialog, cx } from './ui';

type Mark = { letter: string; className: string; title: string };

function statusMap(world: World) {
  const marks = new Map<string, Mark>();
  const deleted: string[] = [];
  for (const repo of Object.values(world.repos)) {
    const st = computeStatus(world, repo);
    const abs = (p: string) => join(repo.root, p);
    for (const p of st.untracked) marks.set(abs(p), { letter: 'U', className: 'text-ggreen', title: 'Untracked: Git aún no lo rastrea' });
    for (const p of st.ignored) marks.set(abs(p), { letter: 'I', className: 'text-muted', title: 'Ignorado por .gitignore' });
    for (const c of st.staged) marks.set(abs(c.path), { letter: c.kind === 'added' ? 'A' : c.kind === 'deleted' ? 'D' : c.kind === 'renamed' ? 'R' : 'M', className: 'text-ggreen', title: 'Preparado (staged) para el próximo commit' });
    for (const c of st.unstaged) {
      const prev = marks.get(abs(c.path));
      marks.set(abs(c.path), {
        letter: (prev ? prev.letter : '') + (c.kind === 'deleted' ? 'D' : 'M'),
        className: prev ? 'text-gyellow' : 'text-gyellow',
        title: prev ? 'Preparado, y con más cambios sin preparar' : 'Modificado sin preparar',
      });
      if (c.kind === 'deleted') deleted.push(abs(c.path));
    }
    for (const c of st.staged) if (c.kind === 'deleted') deleted.push(abs(c.path));
    for (const p of st.unmerged) marks.set(abs(p), { letter: '!', className: 'text-gred', title: 'Conflicto sin resolver' });
  }
  return { marks, deleted };
}

interface Props {
  labId: string;
  onOpen: (path: string) => void;
  selected?: string | null;
  className?: string;
  /** Carpeta raíz mostrada (por defecto, la carpeta personal). */
  root?: string;
}

export function FileExplorer({ labId, onOpen, selected, className, root }: Props) {
  const lab = useLab(labId);
  const mutate = useLabs((s) => s.mutate);
  const world = lab.world;
  const base = root ?? world.home;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState<{ dir: string; type: 'file' | 'dir' } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { marks, deleted } = useMemo(() => statusMap(world), [world]);

  const targetDir = () => {
    if (selected && isDir(world.fs, selected)) return selected;
    if (selected && exists(world.fs, selected)) return dirname(selected);
    return isInside(base, world.cwd) ? world.cwd : base;
  };

  const notice = (text: string) => ({ kind: 'notice' as const, text: `[explorador] ${text}`, tone: 'info' as const });

  const validName = (name: string) => /^[^/\\:*?"<>|\s][^/\\:*?"<>|]*$/.test(name) && name !== '.' && name !== '..';

  const create = (name: string) => {
    if (!creating) return;
    const n = name.trim();
    setCreating(null);
    if (!n) return;
    const parts = n.split('/').filter(Boolean);
    if (!parts.every(validName)) {
      setError(`Nombre no válido: "${n}"`);
      return;
    }
    const path = join(creating.dir, ...parts);
    if (exists(world.fs, path)) {
      setError(`Ya existe "${n}"`);
      return;
    }
    setError(null);
    mutate(labId, (w) => (creating.type === 'file' ? writeFile(w.fs, path, '') : mkdirp(w.fs, path)), notice(`${creating.type === 'file' ? 'Archivo' : 'Carpeta'} creado: ${relative(world.home, path)}`));
    if (creating.type === 'file') onOpen(path);
  };

  const rename = (path: string, name: string) => {
    setRenaming(null);
    const n = name.trim();
    if (!n || n === basename(path)) return;
    if (!validName(n)) {
      setError(`Nombre no válido: "${n}"`);
      return;
    }
    const dest = join(dirname(path), n);
    if (exists(world.fs, dest)) {
      setError(`Ya existe "${n}"`);
      return;
    }
    setError(null);
    mutate(labId, (w) => move(w.fs, path, dest), notice(`Renombrado: ${basename(path)} → ${n} (Git lo verá como un archivo eliminado y otro nuevo hasta que hagas git add)`));
  };

  const doDelete = (path: string) => {
    setToDelete(null);
    mutate(labId, (w) => {
      if (w.repos[path]) delete w.repos[path];
      remove(w.fs, path);
      if (isInside(path, w.cwd)) w.cwd = dirname(path);
    }, notice(`Eliminado: ${relative(world.home, path)}`));
  };

  const renderDir = (dir: string, depth: number): React.ReactNode => {
    const entries = listDir(world.fs, dir);
    // Archivos rastreados eliminados del disco (se muestran tachados).
    const ghost = deleted.filter((d) => dirname(d) === dir && !exists(world.fs, d));
    return (
      <>
        {creating && creating.dir === dir && (
          <NameInput depth={depth} icon={creating.type === 'file' ? <FileText size={14} /> : <Folder size={14} />} onDone={create} onCancel={() => setCreating(null)} />
        )}
        {entries.map((e) => {
          const isRepo = !!world.repos[e.path];
          const open = !collapsed[e.path];
          const mark = marks.get(e.path);
          const dirMark = e.type === 'dir' && [...marks.keys()].some((k) => k.startsWith(e.path + '/') && marks.get(k)!.letter !== 'I');
          if (renaming === e.path) {
            return <NameInput key={e.path} depth={depth} initial={e.name} icon={<FileText size={14} />} onDone={(n) => rename(e.path, n)} onCancel={() => setRenaming(null)} />;
          }
          return (
            <div key={e.path}>
              <div
                className={cx(
                  'group flex cursor-pointer items-center gap-1 rounded-sm py-[3px] pr-1 text-[13px] hover:bg-bg-3',
                  selected === e.path && 'bg-gblue/15 text-fg',
                  mark?.letter === 'I' && 'opacity-50',
                )}
                style={{ paddingLeft: 6 + depth * 12 }}
                onClick={() => {
                  if (e.type === 'dir') setCollapsed((c) => ({ ...c, [e.path]: open }));
                  onOpen(e.path);
                }}
                title={mark?.title}
              >
                {e.type === 'dir' ? (open ? <ChevronDown size={13} className="shrink-0 text-muted" /> : <ChevronRight size={13} className="shrink-0 text-muted" />) : <span className="w-[13px]" />}
                {e.type === 'dir' ? (
                  isRepo ? <FolderGit2 size={14} className="shrink-0 text-accent" /> : open ? <FolderOpen size={14} className="shrink-0 text-gblue" /> : <Folder size={14} className="shrink-0 text-gblue" />
                ) : (
                  <FileText size={14} className="shrink-0 text-muted" />
                )}
                <span className={cx('truncate', mark && mark.letter !== 'I' && mark.className, dirMark && !mark && 'text-gyellow/90')}>{e.name}</span>
                {isRepo && <RepoBadge world={world} path={e.path} />}
                <span className="ml-auto flex items-center gap-0.5">
                  <span className="hidden gap-0.5 group-hover:flex">
                    <IconBtn label="Renombrar" onClick={() => setRenaming(e.path)}>
                      <Pencil size={12} />
                    </IconBtn>
                    <IconBtn label="Eliminar" onClick={() => setToDelete(e.path)}>
                      <Trash2 size={12} />
                    </IconBtn>
                  </span>
                  {mark && <span className={cx('w-5 text-right font-mono text-[11px] font-semibold', mark.className)}>{mark.letter}</span>}
                  {!mark && dirMark && <span className="h-1.5 w-1.5 rounded-full bg-gyellow/80" />}
                </span>
              </div>
              {e.type === 'dir' && open && renderDir(e.path, depth + 1)}
            </div>
          );
        })}
        {ghost.map((g) => (
          <div key={g} className="flex items-center gap-1 py-[3px] text-[13px] text-gred/80 line-through" style={{ paddingLeft: 6 + depth * 12 + 13 }} title="Archivo rastreado eliminado del disco (git status lo muestra como deleted)">
            <FileText size={14} className="shrink-0" />
            <span className="truncate">{basename(g)}</span>
            <span className="ml-auto w-5 text-right font-mono text-[11px] font-semibold no-underline">D</span>
          </div>
        ))}
      </>
    );
  };

  return (
    <div className={cx('flex min-h-0 flex-col rounded-lg border border-line bg-bg-1', className)}>
      <div className="flex items-center justify-between border-b border-line px-2 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Explorador</span>
        <div className="flex gap-0.5">
          <IconBtn label="Nuevo archivo" onClick={() => setCreating({ dir: targetDir(), type: 'file' })}>
            <FilePlus2 size={14} />
          </IconBtn>
          <IconBtn label="Nueva carpeta" onClick={() => setCreating({ dir: targetDir(), type: 'dir' })}>
            <FolderPlus size={14} />
          </IconBtn>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1 font-[450]">
        <div className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-fg-2">
          <FolderOpen size={13} className="text-gblue" /> {base === world.home ? '~' : relative(world.home, base)}
        </div>
        {renderDir(base, 1)}
      </div>
      {error && <p className="border-t border-line px-2 py-1 text-[11px] text-gred">{error}</p>}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-t border-line px-2 py-1.5 text-[10.5px] text-muted">
        <span><b className="text-ggreen">U</b> nuevo</span>
        <span><b className="text-ggreen">A/M</b> staged</span>
        <span><b className="text-gyellow">M</b> modificado</span>
        <span><b className="text-gred">D</b> eliminado</span>
        <span><b className="text-gred">!</b> conflicto</span>
      </div>
      <ConfirmDialog open={!!toDelete} title="Eliminar del disco" danger confirmLabel="Eliminar" onCancel={() => setToDelete(null)} onConfirm={() => toDelete && doDelete(toDelete)}>
        <p>
          ¿Eliminar <b className="text-fg">{toDelete && relative(world.home, toDelete)}</b>?
        </p>
        {toDelete && world.repos[toDelete] && <p className="text-gred">Esta carpeta es un repositorio: se perderá todo su historial (.git).</p>}
        {toDelete && marks.get(toDelete)?.letter === 'U' && <p className="text-gred">El archivo no está en ningún commit: no se podrá recuperar.</p>}
        <p className="text-muted">Equivale a usar rm en la terminal. Git verá el archivo como "deleted" si estaba rastreado.</p>
      </ConfirmDialog>
    </div>
  );
}

function RepoBadge({ world, path }: { world: World; path: string }) {
  const repo = world.repos[path];
  const b = currentBranch(repo) ?? short(headSha(repo) ?? '');
  return <span className="ml-1 shrink-0 rounded bg-accent/15 px-1 font-mono text-[10px] text-accent">{b}</span>;
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="rounded p-1 text-muted hover:bg-bg-4 hover:text-fg cursor-pointer"
    >
      {children}
    </button>
  );
}

function NameInput({ depth, initial = '', icon, onDone, onCancel }: { depth: number; initial?: string; icon: React.ReactNode; onDone: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <div className="flex items-center gap-1 py-[2px] pr-1" style={{ paddingLeft: 6 + depth * 12 + 13 }}>
      <span className="text-muted">{icon}</span>
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onDone(v);
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => onDone(v)}
        aria-label="Nombre"
        className="min-w-0 flex-1 rounded border border-gblue bg-bg-0 px-1 text-[13px] outline-none"
      />
    </div>
  );
}
