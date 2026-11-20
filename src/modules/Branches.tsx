import { ArrowRight, GitBranch, GitMerge, Plus, Shuffle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ancestors, currentBranch, findRepo, firstLine, headSha, short } from '../engine/repo';
import { CommitDetails } from '../components/DiffView';
import { CommitGraph, refsForRepo } from '../components/CommitGraph';
import { Terminal } from '../components/Terminal';
import { Badge, Button, Callout, Card, PageHeader } from '../components/ui';
import { isMerged, repoAt, used } from '../labs/checks';
import { useLab, useLabs } from '../store/labs';
import { useProgress } from '../store/progress';
import { useUI } from '../store/ui';
import { Concept, LabTasks, ModuleQuiz, useActiveLab } from './common';

const LAB = 'branches';

export default function Branches() {
  useActiveLab(LAB);
  const lab = useLab(LAB);
  const run = useLabs((s) => s.run);
  const reset = useLabs((s) => s.reset);
  const record = useProgress((s) => s.recordCommands);
  const setTopic = useUI((s) => s.setTopic);
  const repo = findRepo(lab.world);
  const [name, setName] = useState('feature/login');
  const [sel, setSel] = useState<string | null>(null);
  const cur = repo ? currentBranch(repo) : null;
  const exists = !!repo?.heads[name];

  const exec = (cmd: string) => {
    const r = run(LAB, cmd);
    record(r.records);
    if (r.topic) setTopic(r.topic);
  };
  const n = repo ? Object.keys(repo.objects.commits).length + 1 : 1;
  const slug = (cur ?? 'rama').replace(/[^\w]/g, '-');

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Módulo 5"
        icon={<GitBranch size={22} />}
        title="Ramas (branches)"
        subtitle="Las ramas permiten desarrollar en paralelo sin romper la rama principal. Aquí verás en tiempo real cómo se mueven los punteros y HEAD con cada comando."
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Concept title="¿Qué es una rama?" defaultOpen>
          <p>Un <b className="text-fg">puntero móvil a un commit</b>. Nada más. Cuando haces un commit, la rama actual avanza al nuevo commit. Por eso crear ramas es instantáneo y barato.</p>
        </Concept>
        <Concept title="¿Por qué usar ramas?" defaultOpen>
          <ul className="list-disc space-y-1 pl-5">
            <li>Aislar funcionalidades o experimentos.</li>
            <li>Mantener <code className="font-mono">main</code> siempre estable.</li>
            <li>Trabajar en paralelo y revisar con Pull Requests.</li>
          </ul>
        </Concept>
        <Concept title="HEAD y punteros" defaultOpen>
          <p>HEAD indica dónde estás. <code className="font-mono">git switch rama</code> mueve HEAD a otra rama y actualiza tus archivos. Si haces <code className="font-mono">git switch --detach &lt;sha&gt;</code>, HEAD apunta a un commit: <b className="text-fg">detached HEAD</b>.</p>
        </Concept>
        <Concept title="Rama principal (main)">
          <p>La rama de referencia del proyecto (antes se llamaba <i>master</i>). Suele estar protegida y reflejar lo que está en producción o listo para publicarse.</p>
        </Concept>
        <Concept title="Ramas de funcionalidades">
          <p><code className="font-mono">feature/nombre</code>: se crean desde main para desarrollar algo nuevo y se fusionan al terminar. Deben ser de corta duración.</p>
        </Concept>
        <Concept title="Ramas de correcciones">
          <p><code className="font-mono">fix/descripcion</code> para errores; <code className="font-mono">hotfix/…</code> para urgencias en producción. También: <code className="font-mono">docs/…</code>, <code className="font-mono">refactor/…</code>, <code className="font-mono">usuario/tema</code>.</p>
        </Concept>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Visualizador de ramas" icon={<GitBranch size={15} className="text-accent" />} actions={cur && <Badge tone="green">HEAD → {cur}</Badge>}>
          <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            {repo && <CommitGraph objects={repo.objects} refs={refsForRepo(repo)} selected={sel} onSelect={setSel} className="max-h-[360px]" />}
            <div className="rounded-md border border-line bg-bg-1 lg:max-h-[360px] lg:overflow-auto">
              {repo && sel && repo.objects.commits[sel] ? <CommitDetails objects={repo.objects} sha={sel} /> : <p className="p-3 text-xs text-muted">Selecciona un commit para ver sus cambios.</p>}
            </div>
          </div>
          {repo && (
            <div className="border-t border-line p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Punteros</p>
              <div className="flex flex-wrap gap-2 font-mono text-[12px]">
                <span className="flex items-center gap-1 rounded border border-gcyan/40 bg-gcyan/10 px-2 py-1 text-gcyan">
                  HEAD <ArrowRight size={12} /> {cur ?? `${short(headSha(repo) ?? '')} (detached)`}
                </span>
                {Object.entries(repo.heads).map(([b, sha]) => (
                  <button key={b} onClick={() => { setName(b); setSel(sha); }} className="flex items-center gap-1 rounded border border-ggreen/40 bg-ggreen/10 px-2 py-1 text-ggreen hover:bg-ggreen/20 cursor-pointer">
                    {b} <ArrowRight size={12} /> <span className="text-gyellow">{short(sha)}</span> <span className="max-w-32 truncate font-sans text-[11px] text-fg-2">{firstLine(repo.objects.commits[sha].message)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
        <div className="space-y-4">
          <Card title="Acciones rápidas" actions={<span className="text-[11px] text-muted">ejecutan comandos reales</span>}>
            <div className="space-y-2 p-3">
              <label className="block text-xs text-muted" htmlFor="branch-name">Nombre de rama</label>
              <input id="branch-name" value={name} onChange={(e) => setName(e.target.value.trim())} className="w-full rounded-md border border-line bg-bg-0 px-2 py-1.5 font-mono text-sm outline-none focus:border-gblue" />
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" icon={<Plus size={13} />} disabled={!name || exists} onClick={() => exec(`git branch ${name}`)}>Crear</Button>
                <Button size="sm" icon={<Shuffle size={13} />} disabled={!exists || name === cur} onClick={() => exec(`git switch ${name}`)}>Cambiar</Button>
                <Button size="sm" variant="primary" disabled={!name || exists} onClick={() => exec(`git switch -c ${name}`)}>Crear y cambiar</Button>
                <Button size="sm" icon={<GitMerge size={13} />} disabled={!exists || name === cur} onClick={() => exec(`git merge ${name}`)}>Fusionar en {cur ?? 'HEAD'}</Button>
                <Button size="sm" disabled={!exists || name === cur} onClick={() => exec(`git log --oneline ${cur ?? 'HEAD'}..${name}`)}>Comparar</Button>
                <Button size="sm" variant="danger" icon={<Trash2 size={13} />} disabled={!exists || name === cur} onClick={() => exec(`git branch -d ${name}`)}>Eliminar</Button>
              </div>
              <Button size="sm" className="w-full" onClick={() => exec(`echo "cambio ${n} en ${cur ?? 'HEAD'}" > ${slug}-${n}.txt && git add . && git commit -m "feat: cambio ${n} en ${cur ?? 'HEAD'}"`)}>
                Hacer un commit de prueba en {cur ?? 'HEAD'}
              </Button>
            </div>
          </Card>
          <LabTasks
            labId={LAB}
            tasks={[
              { id: 'create', label: 'Crea una rama feature/...', test: (w) => Object.keys(repoAt(w)?.heads ?? {}).some((b) => b.startsWith('feature/')) },
              { id: 'switch', label: 'Cámbiate a ella', test: (_w, l) => used(l, 'git switch') || used(l, 'git checkout') },
              { id: 'commits', label: 'Haz commits en dos ramas distintas (historias divergentes)', test: (w) => { const r = repoAt(w); if (!r || !r.heads.main) return false; const mainAnc = ancestors(r.objects, r.heads.main); const diverged = Object.entries(r.heads).some(([b, s]) => b !== 'main' && !mainAnc.has(s)) && mainAnc.size > 2; const merged = [...mainAnc].some((x) => r.objects.commits[x].parents.length === 2); return diverged || merged; } },
              { id: 'compare', label: 'Compara ramas (git log a..b o git diff a b)', test: (_w, l) => l.some((r) => (r.command === 'git log' || r.command === 'git diff') && r.ok && r.argv.some((x) => x.includes('..') || x.includes('/'))) },
              { id: 'merge', label: 'Fusiona una rama feature en main', test: (w) => { const r = repoAt(w); return !!r && Object.keys(r.heads).some((b) => b !== 'main' && isMerged(r, b, 'main') && r.heads[b] !== r.heads.main) || (!!r && r.objects.commits[r.heads.main]?.parents.length === 2); } },
              { id: 'delete', label: 'Elimina la rama fusionada', test: (_w, l) => l.some((r) => r.command === 'git branch' && r.ok && (r.argv.includes('-d') || r.argv.includes('-D'))) },
              { id: 'detached', label: 'Explora un commit antiguo en detached HEAD y vuelve', test: (_w, l) => l.some((r) => (r.command === 'git checkout' || r.command === 'git switch') && r.ok && r.argv.some((x) => /HEAD~|^[0-9a-f]{6,}$|--detach/.test(x))) },
            ]}
          />
        </div>
      </div>
      <Terminal labId={LAB} className="h-72" onReset={() => { reset(LAB); setSel(null); }} suggestions={['git branch', 'git branch -a', 'git switch -c feature/login', 'git switch main', 'git merge feature/login', 'git branch -d feature/login', 'git branch -m nuevo-nombre', 'git log --oneline --graph --all', 'git switch --detach HEAD~1', 'git switch -']} />
      <Callout tone="warn" title="¿Fast-forward o commit de merge?">
        Si la rama destino no avanzó desde que creaste la tuya, git merge solo mueve el puntero (<b>fast-forward</b>, historia lineal). Si ambas ramas tienen commits nuevos, Git crea un <b>commit de merge</b> con dos padres. Con <code className="font-mono">--no-ff</code> fuerzas siempre el commit de merge.
      </Callout>
      <ModuleQuiz
        moduleId="ramas"
        questions={[
          {
            question: 'Estás en main y ejecutas git branch feature/x. ¿En qué rama estás ahora?',
            options: [
              { text: 'En main: git branch solo crea la rama', correct: true, explanation: 'Para cambiarte usa git switch feature/x, o crea y cambia a la vez con git switch -c.' },
              { text: 'En feature/x', correct: false, explanation: 'git branch no mueve HEAD.' },
              { text: 'En ninguna (detached HEAD)', correct: false, explanation: 'HEAD sigue apuntando a main.' },
            ],
          },
          {
            question: '¿Desde qué rama se ejecuta git merge feature/x para integrarla en main?',
            options: [
              { text: 'Desde main (la rama que recibe los cambios)', correct: true, explanation: 'merge trae la otra rama a la actual.' },
              { text: 'Desde feature/x', correct: false, explanation: 'Así integrarías main dentro de feature/x.' },
              { text: 'Da igual', correct: false, explanation: 'El resultado es distinto: cambia qué rama avanza.' },
            ],
          },
          {
            question: 'git branch -d feature/x falla con "not fully merged". ¿Qué significa?',
            options: [
              { text: 'La rama tiene commits que no están en ninguna otra rama', correct: true, explanation: 'Git te protege de perder trabajo; fusiónala o usa -D si de verdad quieres descartarla.' },
              { text: 'La rama tiene conflictos', correct: false, explanation: 'Los conflictos aparecen al fusionar, no al borrar.' },
              { text: 'Estás en esa rama', correct: false, explanation: 'Ese caso da otro error ("cannot delete branch … used by worktree").' },
            ],
          },
        ]}
      />
    </div>
  );
}
