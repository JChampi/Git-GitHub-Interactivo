/**
 * Entorno de trabajo reutilizable: explorador + editor + terminal +
 * visualizaciones (grafo, tres estados, remoto, GitHub). Todo conectado al
 * mismo laboratorio y al mismo motor.
 */
import { GitGraph, Layers, PanelLeftClose, PanelLeftOpen, Server } from 'lucide-react';
import { Github } from './icons';
import { lazy, type ReactNode, Suspense, useState } from 'react';
import { findRepo } from '../engine/repo';
import { useLab, useLabs } from '../store/labs';
import { CommitDetails } from './DiffView';
import { CommitGraph, refsForRepo } from './CommitGraph';
import { ConflictResolver } from './ConflictResolver';
import { FileExplorer } from './FileExplorer';
import { GitHubSim } from './github/GitHubSim';
import { RemoteView } from './RemoteView';
import { Terminal } from './Terminal';
import { ThreeStates } from './ThreeStates';
import { Modal, Tabs, cx } from './ui';
import { isFile } from '../engine/vfs';

const CodeEditor = lazy(() => import('./CodeEditor').then((m) => ({ default: m.CodeEditor })));

export type WorkspaceView = 'graph' | 'states' | 'remote' | 'github';

interface Props {
  labId: string;
  views?: WorkspaceView[];
  defaultView?: WorkspaceView;
  suggestions?: string[];
  explorer?: boolean;
  className?: string;
  terminalClass?: string;
  githubUrl?: string;
  welcome?: string;
  /** Contenido extra encima de las visualizaciones. */
  aside?: ReactNode;
  layout?: 'split' | 'stack';
  onCommand?: (input: string, ok: boolean) => void;
}

export function Workspace({ labId, views = ['graph', 'states'], defaultView, suggestions, explorer = true, className, terminalClass, githubUrl, welcome, aside, layout = 'split', onCommand }: Props) {
  const lab = useLab(labId);
  const reset = useLabs((s) => s.reset);
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<WorkspaceView>(defaultView ?? views[0]);
  const [showExplorer, setShowExplorer] = useState(explorer);
  const [mergePath, setMergePath] = useState<string | null>(null);
  const [selCommit, setSelCommit] = useState<string | null>(null);
  const repo = findRepo(lab.world);

  const openFile = (p: string) => {
    setSelected(p);
    if (isFile(lab.world.fs, p)) setOpen(p);
  };

  const viewTabs = views.map((v) => ({
    id: v,
    label: v === 'graph' ? 'Grafo de commits' : v === 'states' ? 'Tres estados' : v === 'remote' ? 'Local ↔ Remoto' : 'GitHub',
    icon: v === 'graph' ? <GitGraph size={13} /> : v === 'states' ? <Layers size={13} /> : v === 'remote' ? <Server size={13} /> : <Github size={13} />,
  }));

  const visual = (
    <div className="flex min-h-0 flex-col rounded-lg border border-line bg-bg-2">
      {views.length > 1 ? <Tabs tabs={viewTabs} value={view} onChange={setView} className="px-2" /> : <p className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-xs font-semibold">{viewTabs[0].icon} {viewTabs[0].label}</p>}
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {aside}
        {view === 'graph' &&
          (repo ? (
            <div className="grid gap-2 lg:grid-cols-[1fr_minmax(0,300px)]">
              <CommitGraph objects={repo.objects} refs={refsForRepo(repo)} selected={selCommit} onSelect={setSelCommit} className="max-h-[420px]" />
              <div className="rounded-md border border-line bg-bg-1 lg:max-h-[420px] lg:overflow-auto">
                {selCommit && repo.objects.commits[selCommit] ? (
                  <CommitDetails objects={repo.objects} sha={selCommit} branches={Object.entries(repo.heads).filter(([, s]) => s === selCommit).map(([b]) => b)} />
                ) : (
                  <p className="p-3 text-xs text-muted">Selecciona un commit para ver sus archivos y diferencias con el commit anterior.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="p-4 text-sm text-muted">No estás dentro de un repositorio. Usa git init, git clone o cd a un repositorio.</p>
          ))}
        {view === 'states' && <ThreeStates labId={labId} compact />}
        {view === 'remote' && <RemoteView labId={labId} />}
        {view === 'github' && <GitHubSim labId={labId} initialUrl={githubUrl} />}
      </div>
    </div>
  );

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      <div className={cx('grid gap-3', showExplorer ? 'lg:grid-cols-[220px_minmax(0,1fr)]' : 'grid-cols-1')}>
        {showExplorer && <FileExplorer labId={labId} onOpen={openFile} selected={selected} className="max-h-[260px] lg:max-h-none lg:h-[460px]" />}
        <div className="flex min-w-0 flex-col gap-3">
          {open && (
            <Suspense fallback={<div className="flex h-56 items-center justify-center rounded-lg border border-line text-xs text-muted">Cargando editor…</div>}>
              <CodeEditor key={open} labId={labId} path={open} onClose={() => setOpen(null)} onResolveConflict={setMergePath} className="h-56" />
            </Suspense>
          )}
          <div className="relative">
            {explorer && (
              <button
                className="absolute -left-1 -top-1 z-10 hidden rounded border border-line bg-bg-2 p-0.5 text-muted hover:text-fg lg:block cursor-pointer"
                title={showExplorer ? 'Ocultar explorador' : 'Mostrar explorador'}
                aria-label={showExplorer ? 'Ocultar explorador' : 'Mostrar explorador'}
                onClick={() => setShowExplorer((v) => !v)}
              >
                {showExplorer ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />}
              </button>
            )}
            <Terminal
              labId={labId}
              className={cx(open ? 'h-[220px]' : 'h-[300px] lg:h-[460px]', terminalClass)}
              suggestions={suggestions}
              onOpenFile={openFile}
              onMergetool={setMergePath}
              onReset={() => {
                reset(labId);
                setOpen(null);
                setSelCommit(null);
              }}
              welcome={welcome}
              onCommand={onCommand}
            />
          </div>
        </div>
      </div>
      {layout === 'split' && views.length > 0 && visual}
      <Modal open={!!mergePath} onClose={() => setMergePath(null)} title="Editor de conflictos (git mergetool)" wide>
        {mergePath && <ConflictResolver labId={labId} path={mergePath} onDone={() => setMergePath(null)} />}
      </Modal>
    </div>
  );
}
