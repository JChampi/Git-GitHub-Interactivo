/**
 * Editor interactivo de conflictos: muestra versión original, cambios de
 * cada lado, el conflicto generado y permite decidir qué conservar.
 */
import { Check, GitMerge, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { findRepo, getCommit, headSha, mergeBase, readBlob } from '../engine/repo';
import { relative } from '../engine/vfs';
import { useLab, useLabs } from '../store/labs';
import { useProgress } from '../store/progress';
import { DiffView } from './DiffView';
import { Badge, Button, Tabs, cx } from './ui';

type Part = { kind: 'text'; lines: string[] } | { kind: 'conflict'; ours: string[]; theirs: string[]; oursLabel: string; theirsLabel: string };
type Choice = 'ours' | 'theirs' | 'both' | 'both-rev' | 'custom';

export function parseConflicts(content: string): Part[] {
  const lines = content.replace(/\n$/, '').split('\n');
  const parts: Part[] = [];
  let buf: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<< ')) {
      if (buf.length) parts.push({ kind: 'text', lines: buf });
      buf = [];
      const oursLabel = lines[i].slice(8);
      const ours: string[] = [];
      const theirs: string[] = [];
      i++;
      while (i < lines.length && lines[i] !== '=======') ours.push(lines[i++]);
      i++;
      while (i < lines.length && !lines[i].startsWith('>>>>>>> ')) theirs.push(lines[i++]);
      const theirsLabel = (lines[i] ?? '>>>>>>> ').slice(8);
      i++;
      parts.push({ kind: 'conflict', ours, theirs, oursLabel, theirsLabel });
    } else buf.push(lines[i++]);
  }
  if (buf.length) parts.push({ kind: 'text', lines: buf });
  return parts;
}

function resolve(parts: Part[], choices: Choice[], custom: string[]): string {
  let k = 0;
  const out: string[] = [];
  for (const p of parts) {
    if (p.kind === 'text') out.push(...p.lines);
    else {
      const c = choices[k];
      if (c === 'ours') out.push(...p.ours);
      else if (c === 'theirs') out.push(...p.theirs);
      else if (c === 'both') out.push(...p.ours, ...p.theirs);
      else if (c === 'both-rev') out.push(...p.theirs, ...p.ours);
      else out.push(...(custom[k] ?? '').split('\n'));
      k++;
    }
  }
  return out.join('\n') + '\n';
}

export function ConflictResolver({ labId, path, onDone }: { labId: string; path: string; onDone?: () => void }) {
  const lab = useLab(labId);
  const mutate = useLabs((s) => s.mutate);
  const run = useLabs((s) => s.run);
  const record = useProgress((s) => s.recordCommands);
  const world = lab.world;
  const content = world.fs.files[path] ?? '';
  const parts = useMemo(() => parseConflicts(content), [content]);
  const blocks = parts.filter((p) => p.kind === 'conflict') as Extract<Part, { kind: 'conflict' }>[];
  const [choices, setChoices] = useState<Choice[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [view, setView] = useState<'resolve' | 'versions'>('resolve');
  useEffect(() => {
    setChoices(blocks.map(() => 'ours'));
    setCustom(blocks.map((b) => [...b.ours, ...b.theirs].join('\n')));
  }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

  const repo = findRepo(world, path);
  const rel = repo ? relative(repo.root, path) : path;
  const versions = useMemo(() => {
    if (!repo || !repo.operation) return null;
    const op = repo.operation;
    const ours = headSha(repo);
    const theirs = op.theirs;
    let base: string | null = null;
    if (op.kind === 'merge' && ours) base = mergeBase(repo.objects, ours, theirs);
    else base = getCommit(repo, theirs)?.parents[0] ?? null;
    const get = (sha: string | null) => (sha && getCommit(repo, sha)?.tree[rel] ? readBlob(repo.objects, getCommit(repo, sha).tree[rel]) : null);
    return { base: get(base), ours: get(ours), theirs: get(theirs), theirsLabel: op.theirsLabel, kind: op.kind };
  }, [repo, rel]);

  const result = resolve(parts, choices, custom);
  const isConflicted = repo?.operation?.conflicts.includes(rel);

  const save = () => {
    mutate(labId, (w) => {
      w.fs.files[path] = result;
    }, { kind: 'notice', text: `[conflictos] ${rel} guardado sin marcadores. Márcalo como resuelto con git add ${rel}`, tone: 'success' });
  };

  if (!blocks.length) {
    return (
      <div className="space-y-3 p-1 text-sm">
        <p className="flex items-center gap-2 text-ggreen">
          <Check size={16} /> {rel} no contiene marcadores de conflicto.
        </p>
        {isConflicted ? (
          <>
            <p className="text-fg-2">Git todavía lo considera en conflicto: márcalo como resuelto.</p>
            <Button
              variant="primary"
              onClick={() => {
                const r = run(labId, `git add ${rel}`);
                record(r.records);
              }}
            >
              git add {rel}
            </Button>
          </>
        ) : (
          <p className="text-fg-2">Cuando no queden archivos en conflicto, completa la operación con <code className="font-mono text-accent">git commit</code>.</p>
        )}
        {onDone && <Button onClick={onDone}>Cerrar</Button>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Tabs
        value={view}
        onChange={setView}
        tabs={[
          { id: 'resolve', label: `Resolver (${blocks.length} bloque${blocks.length > 1 ? 's' : ''})`, icon: <GitMerge size={13} /> },
          { id: 'versions', label: 'Versiones: original, A y B' },
        ]}
      />
      {view === 'versions' && versions && (
        <div className="grid gap-2 lg:grid-cols-3">
          <VersionBox title="Versión original (ancestro común)" content={versions.base} tone="neutral" />
          <VersionBox title="Cambios de A — HEAD (tu rama)" content={versions.ours} tone="blue" diffFrom={versions.base} />
          <VersionBox title={`Cambios de B — ${versions.theirsLabel}`} content={versions.theirs} tone="purple" diffFrom={versions.base} />
        </div>
      )}
      {view === 'resolve' && (
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="space-y-3">
            {blocks.map((b, k) => (
              <div key={k} className="rounded-lg border border-gred/40 bg-bg-1">
                <p className="flex items-center justify-between border-b border-line px-3 py-1.5 text-xs">
                  <span className="font-semibold text-gred">Conflicto {k + 1}</span>
                  <span className="text-muted">Elige qué conservar</span>
                </p>
                <div className="grid gap-px bg-line sm:grid-cols-2">
                  <pre className="overflow-x-auto bg-gblue/8 p-2 font-mono text-[12px] text-fg"><span className="mb-1 block font-sans text-[10.5px] font-semibold text-gblue">A · {b.oursLabel}</span>{b.ours.join('\n') || '(vacío)'}</pre>
                  <pre className="overflow-x-auto bg-gpurple/8 p-2 font-mono text-[12px] text-fg"><span className="mb-1 block font-sans text-[10.5px] font-semibold text-gpurple">B · {b.theirsLabel}</span>{b.theirs.join('\n') || '(vacío)'}</pre>
                </div>
                <div className="flex flex-wrap gap-1 p-2" role="radiogroup" aria-label={`Resolución del conflicto ${k + 1}`}>
                  {(
                    [
                      ['ours', 'Conservar A'],
                      ['theirs', 'Conservar B'],
                      ['both', 'Ambos (A y luego B)'],
                      ['both-rev', 'Ambos (B y luego A)'],
                      ['custom', 'Editar a mano'],
                    ] as [Choice, string][]
                  ).map(([c, label]) => (
                    <button
                      key={c}
                      role="radio"
                      aria-checked={choices[k] === c}
                      onClick={() => setChoices((cs) => cs.map((x, i) => (i === k ? c : x)))}
                      className={cx('rounded-md border px-2 py-1 text-xs cursor-pointer', choices[k] === c ? 'border-accent bg-accent/15 text-fg' : 'border-line text-fg-2 hover:bg-bg-3')}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {choices[k] === 'custom' && (
                  <textarea
                    value={custom[k]}
                    onChange={(e) => setCustom((cs) => cs.map((x, i) => (i === k ? e.target.value : x)))}
                    rows={Math.max(3, (custom[k] ?? '').split('\n').length + 1)}
                    aria-label="Contenido personalizado"
                    className="m-2 mt-0 block w-[calc(100%-1rem)] rounded border border-line bg-bg-0 p-2 font-mono text-[12px] outline-none focus:border-gblue"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border border-line bg-bg-1">
              <p className="border-b border-line px-3 py-1.5 text-xs font-semibold">Conflicto generado por Git (archivo actual)</p>
              <pre className="max-h-48 overflow-auto p-2 font-mono text-[12px]">
                {content.split('\n').map((l, i) => (
                  <div key={i} className={cx(l.startsWith('<<<<<<<') || l.startsWith('>>>>>>>') || l === '=======' ? 'font-bold text-gred' : 'text-fg-2')}>
                    {l || ' '}
                  </div>
                ))}
              </pre>
            </div>
            <div className="rounded-lg border border-ggreen/40 bg-bg-1">
              <p className="flex items-center justify-between border-b border-line px-3 py-1.5 text-xs">
                <span className="font-semibold text-ggreen">Resultado final</span>
                <Badge tone="green">sin marcadores</Badge>
              </p>
              <pre className="max-h-48 overflow-auto p-2 font-mono text-[12px] text-fg">{result}</pre>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<Save size={14} />} onClick={save}>
                Guardar resolución
              </Button>
              <p className="w-full text-xs text-muted">Después de guardar: <code className="font-mono">git add {rel}</code> y <code className="font-mono">git commit</code> (o el --continue de la operación).</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VersionBox({ title, content, tone, diffFrom }: { title: string; content: string | null; tone: 'neutral' | 'blue' | 'purple'; diffFrom?: string | null }) {
  return (
    <div className={cx('rounded-lg border bg-bg-1', tone === 'blue' ? 'border-gblue/40' : tone === 'purple' ? 'border-gpurple/40' : 'border-line')}>
      <p className="border-b border-line px-3 py-1.5 text-xs font-semibold">{title}</p>
      {diffFrom !== undefined && diffFrom !== null && content !== null ? (
        <DiffView before={diffFrom} after={content} />
      ) : (
        <pre className="overflow-auto p-2 font-mono text-[12px] text-fg-2">{content ?? '(el archivo no existe en esta versión)'}</pre>
      )}
    </div>
  );
}
