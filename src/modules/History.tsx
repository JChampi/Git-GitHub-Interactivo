import { GitCommitHorizontal, GitCompare } from 'lucide-react';
import { useMemo, useState } from 'react';
import { decorations, findRepo, firstLine, formatDate, logOrder, readBlob, short } from '../engine/repo';
import { CommitDetails, FileChangeList } from '../components/DiffView';
import { CommitGraph, refsForRepo } from '../components/CommitGraph';
import { Terminal } from '../components/Terminal';
import { Badge, Callout, Card, PageHeader, cx } from '../components/ui';
import { commitCount, repoAt, used, usedArg } from '../labs/checks';
import { useLab, useLabs } from '../store/labs';
import { Concept, LabTasks, ModuleQuiz, useActiveLab } from './common';

const LAB = 'history';

export default function History() {
  useActiveLab(LAB);
  const lab = useLab(LAB);
  const reset = useLabs((s) => s.reset);
  const repo = findRepo(lab.world) ?? repoAt(lab.world);
  const [sel, setSel] = useState<string | null>(null);
  const commits = useMemo(() => (repo ? logOrder(repo.objects, Object.values(repo.heads)) : []), [repo]);
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');
  const deco = repo ? decorations(repo) : {};
  const timeline = [...commits].reverse();

  const compare = useMemo(() => {
    if (!repo || !a || !b || !repo.objects.commits[a] || !repo.objects.commits[b]) return null;
    const ta = repo.objects.commits[a].tree;
    const tb = repo.objects.commits[b].tree;
    return [...new Set([...Object.keys(ta), ...Object.keys(tb)])]
      .filter((p) => ta[p] !== tb[p])
      .sort()
      .map((p) => ({ path: p, before: p in ta ? readBlob(repo.objects, ta[p]) : null, after: p in tb ? readBlob(repo.objects, tb[p]) : null }));
  }, [repo, a, b]);

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Módulo 4"
        icon={<GitCommitHorizontal size={22} />}
        title="Commits e historial"
        subtitle="Este repositorio tiene el historial de un pequeño equipo (Laura, Ana y Diego). Recórrelo como una línea de tiempo, inspecciona cada commit y compara versiones."
      />

      <Card title="Línea de tiempo" actions={<span className="text-[11px] text-muted">del más antiguo al más reciente →</span>}>
        <div className="flex gap-0 overflow-x-auto px-4 py-5">
          {timeline.map((c, i) => (
            <div key={c.sha} className="flex shrink-0 items-start">
              <button onClick={() => setSel(c.sha)} className={cx('w-44 rounded-lg border p-2.5 text-left transition-colors cursor-pointer', sel === c.sha ? 'border-accent bg-accent/10' : 'border-line bg-bg-1 hover:bg-bg-3')}>
                <p className="flex items-center gap-1.5 font-mono text-[11px] text-gyellow">
                  <span className={cx('h-2.5 w-2.5 rounded-full', c.parents.length > 1 ? 'border-2 border-gpurple' : 'bg-accent')} />
                  {short(c.sha)}
                </p>
                <p className="mt-1 line-clamp-2 text-xs font-medium text-fg">{firstLine(c.message)}</p>
                <p className="mt-1 truncate text-[10.5px] text-muted">{c.author.name}</p>
                <p className="text-[10px] text-muted">{formatDate(c.timestamp).slice(4, 16)}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(deco[c.sha] ?? []).map((d) => (
                    <Badge key={d} tone={d.startsWith('tag') ? 'yellow' : 'green'}>
                      {d}
                    </Badge>
                  ))}
                </div>
              </button>
              {i < timeline.length - 1 && <span className="mt-6 h-0.5 w-6 shrink-0 bg-line-2" aria-hidden />}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card title="Grafo y detalle">
          {repo && <CommitGraph objects={repo.objects} refs={refsForRepo(repo)} selected={sel} onSelect={setSel} className="max-h-80 p-2" />}
        </Card>
        <Card title={sel ? 'Commit seleccionado' : 'Selecciona un commit'}>
          {repo && sel && repo.objects.commits[sel] ? <CommitDetails objects={repo.objects} sha={sel} /> : <p className="p-4 text-sm text-muted">Haz clic en un commit de la línea de tiempo o del grafo para ver sus archivos y diferencias respecto al anterior.</p>}
        </Card>
      </div>

      <Card title="Comparar dos commits" icon={<GitCompare size={15} className="text-accent" />}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 text-sm">
          <select value={a} onChange={(e) => setA(e.target.value)} className="rounded-md border border-line bg-bg-0 px-2 py-1 text-xs" aria-label="Commit A">
            <option value="">Commit A (antes)</option>
            {commits.map((c) => (
              <option key={c.sha} value={c.sha}>{short(c.sha)} {firstLine(c.message)}</option>
            ))}
          </select>
          →
          <select value={b} onChange={(e) => setB(e.target.value)} className="rounded-md border border-line bg-bg-0 px-2 py-1 text-xs" aria-label="Commit B">
            <option value="">Commit B (después)</option>
            {commits.map((c) => (
              <option key={c.sha} value={c.sha}>{short(c.sha)} {firstLine(c.message)}</option>
            ))}
          </select>
          {a && b && <code className="font-mono text-[11px] text-muted">equivale a: git diff {short(a)} {short(b)}</code>}
        </div>
        {compare ? <FileChangeList files={compare} defaultOpen /> : <p className="p-3 text-xs text-muted">Elige dos commits para ver las diferencias entre ellos.</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Terminal labId={LAB} className="h-80" onReset={() => reset(LAB)} suggestions={['git log', 'git log --oneline --graph --all', 'git log --author=Ana', 'git show HEAD~2', 'git diff HEAD~1 HEAD', 'git log --stat -n 2', 'git cat-file -p HEAD', 'git commit --amend -m "fix: …"']} />
        <LabTasks
          labId={LAB}
          tasks={[
            { id: 'oneline', label: 'Muestra el historial en una línea por commit', test: (_w, l) => usedArg(l, 'git log', '--oneline') },
            { id: 'author', label: 'Filtra los commits de Diego', test: (_w, l) => usedArg(l, 'git log', /^--author/) },
            { id: 'show', label: 'Inspecciona un commit concreto con git show', test: (_w, l) => used(l, 'git show') },
            { id: 'diffstaged', label: 'Prepara un cambio y revísalo con git diff --staged', test: (_w, l) => usedArg(l, 'git diff', '--staged') || usedArg(l, 'git diff', '--cached') },
            { id: 'commit', label: 'Crea un commit con un mensaje convencional (feat:, fix:, docs:…)', test: (w) => { const r = repoAt(w); return !!r && commitCount(r) > 6 && /^(feat|fix|docs|refactor|test|chore|style)(\(.+\))?: /.test(r.objects.commits[r.heads.main]?.message ?? ''); } },
            { id: 'amend', label: 'Corrige su mensaje con git commit --amend', test: (_w, l) => usedArg(l, 'git commit', '--amend') },
            { id: 'sha', label: 'Mira el contenido interno de un commit (git cat-file -p HEAD)', test: (_w, l) => used(l, 'git cat-file') },
          ]}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Concept title="¿Qué es el SHA de un commit?" defaultOpen>
          <p>Un hash SHA-1 de 40 caracteres calculado a partir del contenido del commit: el árbol de archivos, los padres, autor, fecha y mensaje. Si cambia cualquier dato, cambia el SHA. Por eso <code className="font-mono">--amend</code> o <code className="font-mono">rebase</code> crean commits nuevos.</p>
          <p>Puedes referirte a un commit por su SHA abreviado (mínimo 4 caracteres, normalmente 7) o de forma relativa: <code className="font-mono">HEAD~1</code> (el padre), <code className="font-mono">HEAD~2</code> (el abuelo), <code className="font-mono">HEAD^2</code> (segundo padre de un merge).</p>
          <Callout tone="sim">El simulador calcula los SHA de los archivos (blobs) con el mismo algoritmo que Git real: prueba <code className="font-mono">git hash-object README.md</code>.</Callout>
        </Concept>
        <Concept title="Cómo escribir buenos mensajes de commit" defaultOpen>
          <ul className="list-disc space-y-1 pl-5">
            <li>Primera línea corta (≤ 72 caracteres), en imperativo: "añade", "corrige".</li>
            <li>Explica el <i>qué</i> y el <i>por qué</i>, no el cómo (eso ya lo dice el diff).</li>
            <li>Un commit = un cambio lógico. Si necesitas "y" en el mensaje, quizá son dos commits.</li>
            <li>Conventional Commits: <code className="font-mono">feat:</code> funcionalidad, <code className="font-mono">fix:</code> corrección, <code className="font-mono">docs:</code>, <code className="font-mono">refactor:</code>, <code className="font-mono">test:</code>, <code className="font-mono">chore:</code>.</li>
          </ul>
          <p className="font-mono text-xs"><span className="text-gred">✗ "cambios"</span> · <span className="text-gred">✗ "arreglos varios"</span> · <span className="text-ggreen">✓ "fix: evita doble envío del formulario de pago"</span></p>
        </Concept>
      </div>

      <ModuleQuiz
        moduleId="historial"
        questions={[
          {
            question: '¿Qué diferencia hay entre git diff y git diff --staged?',
            options: [
              { text: 'git diff compara working directory con staging; --staged compara staging con el último commit', correct: true, explanation: 'Así revisas lo que aún no has preparado o lo que entrará en el commit.' },
              { text: 'Son iguales', correct: false, explanation: 'Comparan áreas distintas.' },
              { text: '--staged muestra el historial', correct: false, explanation: 'El historial se ve con git log.' },
            ],
          },
          {
            question: 'HEAD~2 se refiere a…',
            options: [
              { text: 'El commit dos posiciones anterior a HEAD (el "abuelo")', correct: true, explanation: '~n sigue n veces el primer padre.' },
              { text: 'La segunda rama', correct: false, explanation: 'Es una referencia relativa a commits, no a ramas.' },
              { text: 'Los dos últimos commits', correct: false, explanation: 'Apunta a un único commit.' },
            ],
          },
        ]}
      />
    </div>
  );
}
