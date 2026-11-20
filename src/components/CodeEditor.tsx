/**
 * Editor de código (CodeMirror 6) para archivos del sistema virtual.
 */
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import CodeMirror from '@uiw/react-codemirror';
import { GitMerge, Save, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { hasConflictMarkers } from '../engine/merge';
import { basename, relative } from '../engine/vfs';
import { useLab, useLabs } from '../store/labs';
import { useUI } from '../store/ui';
import { Button, cx } from './ui';

function langFor(path: string) {
  if (/\.(m?js|jsx|ts|tsx|json)$/.test(path)) return [javascript({ jsx: true, typescript: /\.tsx?$/.test(path) })];
  if (/\.html?$/.test(path)) return [html()];
  if (/\.css$/.test(path)) return [css()];
  if (/\.(md|markdown)$/.test(path)) return [markdown()];
  return [];
}

interface Props {
  labId: string;
  path: string;
  onClose?: () => void;
  onResolveConflict?: (path: string) => void;
  className?: string;
}

export function CodeEditor({ labId, path, onClose, onResolveConflict, className }: Props) {
  const lab = useLab(labId);
  const mutate = useLabs((s) => s.mutate);
  const theme = useUI((s) => s.theme);
  const saved = lab.world.fs.files[path];
  const [draft, setDraft] = useState(saved ?? '');
  const [loadedFor, setLoadedFor] = useState(path);
  const exists = saved !== undefined;
  const dirty = exists && draft !== saved;

  // Si cambia el archivo desde fuera (terminal) y no hay cambios locales, recarga.
  useEffect(() => {
    if (loadedFor !== path) {
      setDraft(saved ?? '');
      setLoadedFor(path);
    }
  }, [path, saved, loadedFor]);
  const [lastSaved, setLastSaved] = useState(saved);
  useEffect(() => {
    if (saved !== lastSaved) {
      if (draft === lastSaved) setDraft(saved ?? '');
      setLastSaved(saved);
    }
  }, [saved, lastSaved, draft]);

  const save = () => {
    if (!exists) return;
    mutate(labId, (w) => {
      w.fs.files[path] = draft;
    }, { kind: 'notice', text: `[editor] Guardado ${relative(lab.world.home, path)} — revisa el cambio con git status o git diff`, tone: 'info' });
    setLastSaved(draft);
  };

  const extensions = useMemo(() => langFor(path), [path]);
  const conflict = hasConflictMarkers(draft);

  return (
    <div className={cx('flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-bg-1', className)}>
      <div className="flex items-center gap-2 border-b border-line bg-bg-2 px-2 py-1">
        <span className="truncate font-mono text-xs text-fg-2" title={path}>
          {basename(path)}
          {dirty && <span className="ml-1 text-accent">●</span>}
        </span>
        <span className="hidden truncate text-[11px] text-muted sm:inline">{relative(lab.world.home, path)}</span>
        <div className="ml-auto flex items-center gap-1">
          {conflict && onResolveConflict && (
            <Button size="sm" variant="secondary" icon={<GitMerge size={12} />} onClick={() => onResolveConflict(path)}>
              Resolver conflicto
            </Button>
          )}
          <Button size="sm" variant={dirty ? 'primary' : 'ghost'} disabled={!dirty} icon={<Save size={12} />} onClick={save} title="Guardar (Ctrl+S)">
            Guardar
          </Button>
          {onClose && (
            <button aria-label="Cerrar editor" onClick={onClose} className="rounded p-1 text-muted hover:bg-bg-3 hover:text-fg cursor-pointer">
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      {!exists ? (
        <p className="p-4 text-sm text-muted">El archivo ya no existe en el disco.</p>
      ) : (
        <div
          className="min-h-0 flex-1 overflow-hidden"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              save();
            }
          }}
        >
          <CodeMirror value={draft} onChange={setDraft} extensions={extensions} theme={theme === 'dark' ? oneDark : 'light'} height="100%" basicSetup={{ foldGutter: false, highlightActiveLine: true }} />
        </div>
      )}
    </div>
  );
}
