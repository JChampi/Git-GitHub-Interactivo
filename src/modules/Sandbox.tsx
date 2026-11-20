import { Box, History, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Workspace } from '../components/Workspace';
import { Button, Callout, Card, ConfirmDialog, PageHeader, cx } from '../components/ui';
import { useLab, useLabs } from '../store/labs';
import { useActiveLab } from './common';

export default function Sandbox() {
  const sandboxes = useLabs((s) => s.sandboxes);
  const active = useLabs((s) => s.activeSandbox);
  const { createSandbox, renameSandbox, deleteSandbox, setActiveSandbox, reset, setPendingInput } = useLabs.getState();
  const current = sandboxes.find((s) => s.id === active) ?? sandboxes[0];
  useActiveLab(current.id);
  const lab = useLab(current.id);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'reset' | 'delete'; id: string } | null>(null);
  const [wsKey, setWsKey] = useState(0);

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Modo libre"
        icon={<Box size={22} />}
        title="Sandbox: experimenta sin límites"
        subtitle="Sin instrucciones ni validaciones. Crea repositorios, ramas y commits, rompe cosas, prueba operaciones destructivas o crea repos en el GitHub simulado (gh repo create). Puedes guardar varias sesiones."
      />
      <Card title="Sesiones de práctica" actions={<Button size="sm" icon={<Plus size={13} />} onClick={() => createSandbox()}>Nueva sesión</Button>}>
        <div className="flex flex-wrap gap-2 p-3">
          {sandboxes.map((s) => (
            <div key={s.id} className={cx('flex items-center gap-1 rounded-md border px-1 py-0.5', s.id === current.id ? 'border-accent bg-accent/10' : 'border-line')}>
              {editing === s.id ? (
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { renameSandbox(s.id, name); setEditing(null); }
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  onBlur={() => { renameSandbox(s.id, name); setEditing(null); }}
                  aria-label="Nombre de la sesión"
                  className="w-32 rounded bg-bg-0 px-1 text-sm outline-none"
                />
              ) : (
                <button className="px-2 py-1 text-sm cursor-pointer" onClick={() => setActiveSandbox(s.id)}>{s.name}</button>
              )}
              <button aria-label="Renombrar sesión" title="Renombrar" className="rounded p-1 text-muted hover:text-fg cursor-pointer" onClick={() => { setEditing(s.id); setName(s.name); }}>
                <Pencil size={12} />
              </button>
              <button aria-label="Eliminar sesión" title="Eliminar" className="rounded p-1 text-muted hover:text-gred cursor-pointer" onClick={() => setConfirm({ kind: 'delete', id: s.id })}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_280px]">
        <Workspace key={`${current.id}-${wsKey}`} labId={current.id} views={['graph', 'states', 'remote', 'github']} welcome="Modo libre: haz lo que quieras. Ideas: git init · gh repo create demo --public · git remote add origin https://github.com/estudiante/demo.git" />
        <div className="space-y-4">
          <Button variant="danger" className="w-full" icon={<RotateCcw size={14} />} onClick={() => setConfirm({ kind: 'reset', id: current.id })}>
            Reiniciar entorno
          </Button>
          <Card title="Historial de comandos" icon={<History size={15} className="text-accent" />}>
            <ul className="max-h-[420px] overflow-auto py-1">
              {[...lab.history].reverse().map((h, i) => (
                <li key={i}>
                  <button className="w-full truncate px-3 py-1 text-left font-mono text-[11.5px] text-fg-2 hover:bg-bg-3 hover:text-fg cursor-pointer" title="Escribir de nuevo en la terminal" onClick={() => setPendingInput(current.id, h)}>
                    {h}
                  </button>
                </li>
              ))}
              {!lab.history.length && <li className="px-3 py-3 text-xs text-muted">Aún no has ejecutado comandos en esta sesión.</li>}
            </ul>
          </Card>
          <Callout tone="info">Cada sesión tiene su propio sistema de archivos, repositorios y GitHub simulado. Se guardan automáticamente en este navegador.</Callout>
        </div>
      </div>
      <ConfirmDialog
        open={!!confirm}
        danger
        title={confirm?.kind === 'delete' ? 'Eliminar sesión' : 'Reiniciar entorno'}
        confirmLabel={confirm?.kind === 'delete' ? 'Eliminar' : 'Reiniciar'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === 'delete') deleteSandbox(confirm.id);
          else {
            reset(confirm.id);
            setWsKey((k) => k + 1);
          }
          setConfirm(null);
        }}
      >
        <p>{confirm?.kind === 'delete' ? 'Se eliminará la sesión con todos sus archivos, repositorios e historial.' : 'Se borrará el estado actual de esta sesión (archivos, commits, ramas, remotos y terminal).'}</p>
        <p>Tu progreso y logros no se ven afectados.</p>
      </ConfirmDialog>
    </div>
  );
}
