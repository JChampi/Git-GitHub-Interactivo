import { CheckCircle2, Package, Tag, XCircle } from 'lucide-react';
import { useState } from 'react';
import { firstLine, short } from '../../engine/repo';
import { createRelease, serverCommit, personFor } from '../../engine/server';
import { renderMarkdown } from '../../lib/markdown';
import { Badge, Button, cx } from '../ui';
import { type GhCtx, Input, Select, SimNote, TextArea, timeAgo } from './shared';

const SAMPLE_WORKFLOW = `name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Instalar dependencias
        run: npm ci
      - name: Ejecutar tests
        run: npm test
`;

export function Actions({ ctx }: { ctx: GhCtx }) {
  const { server, me, act } = ctx;
  const [sel, setSel] = useState<number | null>(null);
  const run = server.runs.find((r) => r.id === sel);
  const hasWorkflow = Object.values(server.heads).some((h) => Object.keys(server.objects.commits[h].tree).some((p) => p.startsWith('.github/workflows/')));
  return (
    <div className="space-y-3">
      <SimNote>
        Runner simulado: valida la estructura del workflow (on, jobs, runs-on, steps) y considera que un paso de "test" falla si el repositorio no tiene pruebas (tests/ o *.test.*). En GitHub real se ejecuta en máquinas virtuales.
      </SimNote>
      {!hasWorkflow && (
        <div className="rounded-md border border-line p-3 text-sm">
          <p className="font-semibold">Empieza con GitHub Actions</p>
          <p className="mt-1 text-xs text-fg-2">Los workflows son archivos YAML en .github/workflows/. Se ejecutan automáticamente con cada push o pull request.</p>
          <pre className="mt-2 overflow-auto rounded bg-bg-1 p-2 font-mono text-[11.5px]">{SAMPLE_WORKFLOW}</pre>
          <p className="mt-2 text-xs text-fg-2">Puedes crearlo en tu repositorio local (mkdir -p .github/workflows, edita ci.yml, commit y push) o directamente desde la web:</p>
          <Button size="sm" className="mt-2" onClick={() => act((w, s) => void serverCommit(w, s, { branch: s.defaultBranch, author: personFor(me), message: 'ci: añade workflow de integración continua', changes: { '.github/workflows/ci.yml': SAMPLE_WORKFLOW } }), 'Workflow ci.yml creado desde la web (commit nuevo en el remoto: haz git pull para tenerlo en local)')}>
            Crear .github/workflows/ci.yml (commit web)
          </Button>
        </div>
      )}
      <div className="overflow-hidden rounded-md border border-line">
        {server.runs.map((r) => (
          <button key={r.id} onClick={() => setSel(r.id === sel ? null : r.id)} className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-bg-2 cursor-pointer">
            {r.status === 'success' ? <CheckCircle2 size={15} className="text-ggreen" /> : <XCircle size={15} className="text-gred" />}
            <span className="font-semibold">{r.workflow}</span>
            <span className="truncate text-xs text-muted">
              #{r.id} · {r.event} · <span className="font-mono">{r.branch}</span> · {firstLine(server.objects.commits[r.sha]?.message ?? '')}
            </span>
            <span className="ml-auto shrink-0 text-xs text-muted">{timeAgo(r.timestamp)}</span>
          </button>
        ))}
        {!server.runs.length && <p className="p-5 text-center text-sm text-muted">Todavía no se ha ejecutado ningún workflow.</p>}
      </div>
      {run && (
        <div className="rounded-md border border-line">
          <p className="border-b border-line px-3 py-1.5 text-xs font-semibold">
            {run.workflow} · {run.file} · commit {short(run.sha)}
          </p>
          {run.steps.map((s, i) => (
            <div key={i} className="flex items-start gap-2 border-b border-line px-3 py-1.5 text-xs last:border-0">
              {s.ok ? <CheckCircle2 size={14} className="text-ggreen" /> : <XCircle size={14} className="text-gred" />}
              <span className="font-medium">{s.name}</span>
              <span className="ml-auto font-mono text-muted">{s.log}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Releases({ ctx }: { ctx: GhCtx }) {
  const { server, me, act } = ctx;
  const [creating, setCreating] = useState(false);
  const [tag, setTag] = useState('v1.0.0');
  const [target, setTarget] = useState(server.defaultBranch);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [pre, setPre] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-fg-2">
          <Tag size={13} className="inline" /> {Object.keys(server.tags).length} etiquetas: {Object.keys(server.tags).join(', ') || '—'}
        </span>
        <Button size="sm" variant="success" className="ml-auto" disabled={!Object.keys(server.heads).length} onClick={() => setCreating((v) => !v)}>
          Crear release
        </Button>
      </div>
      {creating && (
        <div className="space-y-2 rounded-md border border-line p-3">
          <div className="flex flex-wrap gap-2">
            <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Etiqueta (v1.0.0)" aria-label="Etiqueta" className="max-w-[160px]" />
            <Select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Rama destino">
              {Object.keys(server.heads).map((h) => (
                <option key={h}>{h}</option>
              ))}
            </Select>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título de la release" aria-label="Título" className="min-w-[160px] flex-1" />
          </div>
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Notas: novedades, correcciones…" aria-label="Notas" />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={pre} onChange={(e) => setPre(e.target.checked)} /> Pre-release
          </label>
          {error && <p className="text-xs text-gred">{error}</p>}
          <Button
            size="sm"
            variant="success"
            onClick={() => {
              let err: string | null = null;
              act((w, s) => {
                err = createRelease(w, s, { tag, title, notes, target, author: me, prerelease: pre });
              }, `Release ${tag} publicada (la etiqueta se creó en GitHub: tráela con git fetch --tags o git fetch)`);
              setError(err);
              if (!err) setCreating(false);
            }}
          >
            Publicar release
          </Button>
          <p className="text-[11px] text-muted">Si la etiqueta no existe, GitHub la crea sobre el último commit de la rama elegida. También puedes crearla en local (git tag -a) y subirla (git push --tags).</p>
        </div>
      )}
      {server.releases.map((r) => (
        <div key={r.tag} className="rounded-md border border-line p-3">
          <p className="flex flex-wrap items-center gap-2">
            <Package size={15} className="text-ggreen" /> <b>{r.title}</b> <Badge tone="green">{r.tag}</Badge>
            {r.prerelease && <Badge tone="yellow">Pre-release</Badge>}
            <span className="ml-auto text-xs text-muted">
              {r.author} · {timeAgo(r.timestamp)} · {short(r.target)}
            </span>
          </p>
          {r.notes && <div className="md mt-2 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(r.notes) }} />}
        </div>
      ))}
      {!server.releases.length && !creating && <p className="text-center text-sm text-muted">No hay releases. Una release publica una versión (etiqueta + notas + archivos descargables).</p>}
    </div>
  );
}

const COLS = [
  { id: 'todo', label: 'Por hacer' },
  { id: 'doing', label: 'En progreso' },
  { id: 'done', label: 'Hecho' },
] as const;

export function ProjectBoard({ ctx }: { ctx: GhCtx }) {
  const { server, act } = ctx;
  const col = (n: number, closed: boolean) => (closed ? 'done' : server.project?.[n] ?? 'todo');
  return (
    <div className="space-y-3">
      <SimNote>GitHub Projects organiza issues y PRs en tableros. Aquí cada issue es una tarjeta; muévela entre columnas. Cerrar el issue la lleva a "Hecho".</SimNote>
      <div className="grid gap-3 md:grid-cols-3">
        {COLS.map((c) => (
          <div key={c.id} className="rounded-md border border-line bg-bg-1">
            <p className="border-b border-line px-3 py-1.5 text-xs font-semibold">
              {c.label} <span className="text-muted">{server.issues.filter((i) => col(i.number, i.state === 'closed') === c.id).length}</span>
            </p>
            <div className="min-h-24 space-y-2 p-2">
              {server.issues
                .filter((i) => col(i.number, i.state === 'closed') === c.id)
                .map((i) => (
                  <div key={i.number} className={cx('rounded-md border border-line bg-bg-2 p-2 text-xs', i.state === 'closed' && 'opacity-70')}>
                    <p className="font-medium">
                      #{i.number} {i.title}
                    </p>
                    <div className="mt-1.5 flex gap-1">
                      {COLS.filter((x) => x.id !== c.id && i.state === 'open').map((x) => (
                        <button
                          key={x.id}
                          onClick={() =>
                            act((_, s) => {
                              s.project = { ...(s.project ?? {}), [i.number]: x.id };
                              if (x.id === 'done') s.issues.find((y) => y.number === i.number)!.state = 'closed';
                            })
                          }
                          className="rounded border border-line px-1.5 py-0.5 text-[10.5px] text-fg-2 hover:bg-bg-4 cursor-pointer"
                        >
                          → {x.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
      {!server.issues.length && <p className="text-center text-sm text-muted">Crea issues en la pestaña Issues para verlos en el tablero.</p>}
    </div>
  );
}
