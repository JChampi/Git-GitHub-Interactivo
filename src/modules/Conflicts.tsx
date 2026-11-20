import { GitMerge, Play, Swords } from 'lucide-react';
import { useState } from 'react';
import { findRepo, getCommit, readBlob } from '../engine/repo';
import { hasConflictMarkers } from '../engine/merge';
import { conflictWorld } from '../labs/presets';
import { ConflictResolver } from '../components/ConflictResolver';
import { CommitGraph, refsForRepo } from '../components/CommitGraph';
import { Terminal } from '../components/Terminal';
import { Badge, Button, Callout, Card, Modal, PageHeader } from '../components/ui';
import { useLab, useLabs } from '../store/labs';
import { useProgress } from '../store/progress';
import { useUI } from '../store/ui';
import { Concept, LabTasks, ModuleQuiz, useActiveLab } from './common';
import { used } from '../labs/checks';

const LAB = 'conflicts';
const FILE = '/home/estudiante/proyecto/config.js';
const DEF = {
  base: 'const titulo = "Tienda";\nconst precio = 10;\nconst moneda = "EUR";\n',
  a: 'const titulo = "Tienda Online";\nconst precio = 10;\nconst moneda = "EUR";\n',
  b: 'const titulo = "Mi Super Tienda";\nconst precio = 10;\nconst moneda = "USD";\n',
};

export default function Conflicts() {
  useActiveLab(LAB);
  const lab = useLab(LAB);
  const setWorld = useLabs((s) => s.setWorld);
  const clear = useLabs((s) => s.clear);
  const run = useLabs((s) => s.run);
  const notice = useLabs((s) => s.notice);
  const record = useProgress((s) => s.recordCommands);
  const setTopic = useUI((s) => s.setTopic);
  const [base, setBase] = useState(DEF.base);
  const [a, setA] = useState(DEF.a);
  const [b, setB] = useState(DEF.b);
  const [modal, setModal] = useState(false);
  const repo = findRepo(lab.world);
  const op = repo?.operation;
  const content = lab.world.fs.files[FILE];
  const merged = repo && repo.heads.main ? getCommit(repo, repo.heads.main) : null;
  const done = !!merged && merged.parents.length === 2;
  const finalContent = done && merged.tree['config.js'] ? readBlob(repo!.objects, merged.tree['config.js']) : null;

  const generate = () => {
    clear(LAB);
    setWorld(LAB, conflictWorld(base.endsWith('\n') ? base : base + '\n', a.endsWith('\n') ? a : a + '\n', b.endsWith('\n') ? b : b + '\n'));
    notice(LAB, 'Escenario generado: main contiene el cambio de A y feature/desarrollador-b el de B. Ejecuta git merge feature/desarrollador-b', 'info');
  };
  const exec = (cmd: string) => {
    const r = run(LAB, cmd);
    record(r.records);
    if (r.topic) setTopic(r.topic);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Módulo 10"
        icon={<Swords size={22} />}
        title="Conflictos de fusión"
        subtitle="Un conflicto aparece cuando dos ramas cambian las mismas líneas de forma distinta (o una borra lo que la otra modifica). Git no adivina: te muestra ambas versiones y decides tú."
      />
      <div className="grid gap-3 md:grid-cols-3">
        <Concept title="¿Por qué aparecen?" defaultOpen>
          <p>Git fusiona automáticamente los cambios en zonas distintas. Solo pide ayuda cuando ambos lados tocaron la misma zona respecto al ancestro común.</p>
        </Concept>
        <Concept title="Cómo se ven" defaultOpen>
          <pre className="rounded bg-bg-1 p-2 font-mono text-[11px] leading-5"><span className="text-gred">{'<<<<<<< HEAD'}</span>{'\nversión de tu rama\n'}<span className="text-gred">=======</span>{'\nversión de la otra rama\n'}<span className="text-gred">{'>>>>>>> feature'}</span></pre>
        </Concept>
        <Concept title="Cómo resolverlos" defaultOpen>
          <ol className="list-decimal space-y-0.5 pl-5">
            <li><code className="font-mono">git status</code>: archivos en conflicto.</li>
            <li>Edita y deja el contenido final (sin marcadores).</li>
            <li><code className="font-mono">git add archivo</code> para marcarlo resuelto.</li>
            <li><code className="font-mono">git commit</code> cierra el merge.</li>
            <li>¿Te arrepientes? <code className="font-mono">git merge --abort</code>.</li>
          </ol>
        </Concept>
      </div>

      <Card title="Simulador: dos desarrolladores, las mismas líneas" icon={<Play size={15} className="text-accent" />} actions={<Button size="sm" variant="primary" onClick={generate}>Generar escenario</Button>}>
        <div className="grid gap-px bg-line md:grid-cols-3">
          {([
            ['Versión original (ancestro común)', base, setBase, 'text-fg-2'],
            ['Cambios del desarrollador A (main)', a, setA, 'text-gblue'],
            ['Cambios del desarrollador B (feature/desarrollador-b)', b, setB, 'text-gpurple'],
          ] as const).map(([t, v, set, c]) => (
            <label key={t} className="block bg-bg-2 p-3">
              <span className={`text-xs font-semibold ${c}`}>{t}</span>
              <textarea value={v} onChange={(e) => set(e.target.value)} rows={5} className="mt-1.5 w-full rounded-md border border-line bg-bg-0 p-2 font-mono text-[12px] outline-none focus:border-gblue" />
            </label>
          ))}
        </div>
        <p className="border-t border-line px-3 py-2 text-xs text-muted">Edita las tres versiones (para un conflicto, A y B deben cambiar las mismas líneas) y pulsa "Generar escenario": se crean commits reales en ambas ramas.</p>
      </Card>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<GitMerge size={13} />} disabled={!!op || done} onClick={() => exec('git merge feature/desarrollador-b')}>git merge feature/desarrollador-b</Button>
            <Button size="sm" onClick={() => exec('git status')}>git status</Button>
            <Button size="sm" onClick={() => exec('git diff')}>git diff</Button>
            <Button size="sm" disabled={!op} onClick={() => setModal(true)}>git mergetool</Button>
            <Button size="sm" variant="danger" disabled={!op} onClick={() => exec('git merge --abort')}>git merge --abort</Button>
            {op && <Badge tone="red">MERGING · {op.conflicts.length} en conflicto</Badge>}
            {done && <Badge tone="green">merge completado</Badge>}
          </div>
          <Terminal labId={LAB} className="h-72" onReset={generate} onMergetool={() => setModal(true)} suggestions={['git merge feature/desarrollador-b', 'git status', 'git diff', 'cat config.js', 'git add config.js', 'git commit -m "Merge: resuelve conflicto"', 'git merge --abort', 'git log --oneline --graph --all']} />
          {op && content && hasConflictMarkers(content) && (
            <Card title="Resolución manual (editor interactivo)">
              <div className="p-3">
                <ConflictResolver labId={LAB} path={FILE} />
              </div>
            </Card>
          )}
          {op && content && !hasConflictMarkers(content) && (
            <Callout tone="info">
              config.js ya no tiene marcadores. {op.conflicts.length ? <>Márcalo como resuelto: <Button size="sm" onClick={() => exec('git add config.js')}>git add config.js</Button></> : <>Completa el merge: <Button size="sm" variant="primary" onClick={() => exec('git commit -m "Merge: integra cambios de B"')}>git commit</Button></>}
            </Callout>
          )}
          {finalContent !== null && (
            <Card title="Resultado final (en main)">
              <pre className="p-3 font-mono text-[12px]">{finalContent}</pre>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <LabTasks
            labId={LAB}
            tasks={[
              { id: 'conflict', label: 'Provoca el conflicto con git merge', test: (_w, l) => l.some((r) => r.command === 'git merge' && !r.ok) },
              { id: 'status', label: 'Identifica el archivo con git status', test: (_w, l) => used(l, 'git status') },
              { id: 'resolve', label: 'Resuelve los marcadores (editor o mergetool)', test: (w) => { const r = findRepo(w); return !!r && (!r.operation || !hasConflictMarkers(w.fs.files[FILE] ?? '')) && l2(w); } },
              { id: 'add', label: 'Márcalo como resuelto (git add)', test: (w, l) => used(l, 'git add') && (!findRepo(w)?.operation?.conflicts.length) },
              { id: 'commit', label: 'Completa el merge con git commit', test: (w) => { const r = findRepo(w); return !!r && getCommit(r, r.heads.main).parents.length === 2; } },
            ]}
            onAllDone={() => useProgress.getState().completeModule('conflictos')}
          />
          {repo && (
            <Card title="Grafo">
              <CommitGraph objects={repo.objects} refs={refsForRepo(repo)} compact className="max-h-56 p-2" />
            </Card>
          )}
        </div>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="git mergetool — editor de conflictos" wide>
        <ConflictResolver labId={LAB} path={FILE} onDone={() => setModal(false)} />
      </Modal>
      <ModuleQuiz
        moduleId="conflictos"
        questions={[
          {
            question: 'Después de editar el archivo en conflicto, ¿cómo le dices a Git que está resuelto?',
            options: [
              { text: 'git add archivo', correct: true, explanation: 'Luego git commit para terminar el merge.' },
              { text: 'git merge --continue sin más', correct: false, explanation: 'Primero hay que marcarlo con git add.' },
              { text: 'Guardando el archivo basta', correct: false, explanation: 'Git necesita que lo añadas al índice.' },
            ],
          },
          {
            question: '¿Qué hace git merge --abort?',
            options: [
              { text: 'Cancela el merge y devuelve el repositorio al estado anterior', correct: true, explanation: 'Útil si no sabes resolverlo o te equivocaste de rama.' },
              { text: 'Acepta automáticamente tu versión', correct: false, explanation: 'No elige ninguna versión: deshace el intento de merge.' },
              { text: 'Borra la otra rama', correct: false, explanation: 'Las ramas no se tocan.' },
            ],
          },
        ]}
      />
    </div>
  );
}

function l2(w: Parameters<typeof findRepo>[0]) {
  const r = findRepo(w);
  if (!r) return false;
  const c = w.fs.files[FILE] ?? '';
  return !hasConflictMarkers(c) && (r.operation !== null || getCommit(r, r.heads.main).parents.length === 2);
}
