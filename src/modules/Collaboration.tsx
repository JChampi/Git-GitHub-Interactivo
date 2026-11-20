import { CheckCircle2, Laptop, Server, Users, XCircle } from 'lucide-react';
import { useState } from 'react';
import { aheadBehind, currentBranch, firstLine, headSha, short } from '../engine/repo';
import { getServer } from '../engine/server';
import { join } from '../engine/vfs';
import { HOME } from '../engine/world';
import { CommitGraph, refsForServer } from '../components/CommitGraph';
import { Workspace } from '../components/Workspace';
import { Badge, Button, Callout, Card, PageHeader, cx } from '../components/ui';
import { useLab, useLabs } from '../store/labs';
import { useProgress } from '../store/progress';
import { LabTasks, ModuleQuiz, useActiveLab } from './common';

const LAB = 'collab';
const URL = 'https://github.com/equipo/app-equipo.git';
const DEVS = [
  { dir: 'dev-a', name: 'Desarrollador A', color: 'text-accent' },
  { dir: 'dev-b', name: 'Desarrollador B', color: 'text-gblue' },
  { dir: 'dev-c', name: 'Desarrollador C', color: 'text-ggreen' },
];

const CC = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([\w./-]+\))?(!)?: .{3,}$/;

export default function Collaboration() {
  useActiveLab(LAB);
  const lab = useLab(LAB);
  const run = useLabs((s) => s.run);
  const record = useProgress((s) => s.recordCommands);
  const w = lab.world;
  const server = getServer(w, URL);
  const [msg, setMsg] = useState('feat(login): valida el formulario');
  const ccOk = CC.test(msg);

  const workAs = (dir: string) => {
    const r = run(LAB, `cd ~/${dir}`);
    record(r.records);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Módulo 9"
        icon={<Users size={22} />}
        title="Colaboración y trabajo en equipo"
        subtitle="Tres desarrolladores, cada uno con su clon del repositorio central. Cambia de persona con cd (cada carpeta tiene su propia identidad configurada) y observa cómo sus ramas confluyen en GitHub."
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {DEVS.map((d) => {
          const repo = w.repos[join(HOME, d.dir)];
          const active = w.cwd.startsWith(join(HOME, d.dir));
          const b = repo ? currentBranch(repo) : null;
          const up = repo && b ? repo.upstream[b] : undefined;
          const remoteSha = up && repo ? repo.remoteRefs[`${up.remote}/${up.branch}`] : undefined;
          const ab = repo && b && remoteSha && repo.heads[b] ? aheadBehind(repo.objects, repo.heads[b], remoteSha) : null;
          const h = repo ? headSha(repo) : null;
          return (
            <Card key={d.dir} className={cx(active && 'ring-1 ring-accent')} title={<span className={cx('flex items-center gap-1.5', d.color)}><Laptop size={14} /> {d.name}</span>} actions={active ? <Badge tone="accent">trabajando aquí</Badge> : <Button size="sm" onClick={() => workAs(d.dir)}>Trabajar como</Button>}>
              <div className="space-y-1 p-3 text-xs">
                <p><span className="text-muted">Carpeta:</span> <code className="font-mono">~/{d.dir}</code></p>
                <p><span className="text-muted">Rama:</span> <code className="font-mono text-ggreen">{b ?? '—'}</code> {up ? <span className="text-muted">→ {up.remote}/{up.branch}</span> : b && b !== 'main' ? <span className="text-gyellow">(sin publicar)</span> : null}</p>
                {ab && (ab.ahead || ab.behind) ? (
                  <p>{ab.ahead > 0 && <Badge tone="yellow">↑{ab.ahead}</Badge>} {ab.behind > 0 && <Badge tone="blue">↓{ab.behind}</Badge>}</p>
                ) : null}
                {h && repo && <p className="truncate text-fg-2"><span className="font-mono text-gyellow">{short(h)}</span> {firstLine(repo.objects.commits[h].message)}</p>}
              </div>
            </Card>
          );
        })}
        <Card title={<span className="flex items-center gap-1.5 text-gpurple"><Server size={14} /> Repositorio central</span>}>
          <div className="space-y-1 p-3 text-xs">
            <p className="font-mono">equipo/app-equipo</p>
            <p><span className="text-muted">Ramas:</span> {server ? Object.keys(server.heads).join(', ') : '—'}</p>
            <p><span className="text-muted">PRs abiertos:</span> {server?.pulls.filter((p) => p.state === 'open').length ?? 0}</p>
          </div>
        </Card>
      </div>
      {server && (
        <Card title="Historia del repositorio central (GitHub)">
          <CommitGraph objects={server.objects} refs={refsForServer(server)} className="max-h-64 p-2" />
        </Card>
      )}
      <Callout tone="info">
        Flujo sugerido: como <b>A</b> crea <code className="font-mono">feature/autenticacion</code>, haz commit y <code className="font-mono">git push -u</code>. Como <b>B</b> crea <code className="font-mono">fix/error-login</code> y súbela. Abre los Pull Requests en la pestaña GitHub, pide revisión a un compañero (simulado), fusiónalos y, como <b>C</b>, sincroniza con <code className="font-mono">git pull</code>.
      </Callout>
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <Workspace labId={LAB} views={['github', 'remote', 'graph']} githubUrl={URL} suggestions={['cd ~/dev-a', 'cd ~/dev-b', 'cd ~/dev-c', 'git config user.name', 'git switch -c feature/autenticacion', 'git push -u origin HEAD', 'git pull', 'git log --oneline --graph --all']} />
        <div className="space-y-4">
          <LabTasks
            labId={LAB}
            title="Escenario de equipo"
            tasks={[
              { id: 'branch', label: '1. Un desarrollador crea su rama personal', test: (x) => DEVS.some((d) => Object.keys(x.repos[join(HOME, d.dir)]?.heads ?? {}).some((b) => b !== 'main')) },
              { id: 'push', label: '2. Sube sus cambios al repositorio central', test: (x) => Object.keys(getServer(x, URL)?.heads ?? {}).some((b) => b !== 'main') },
              { id: 'two', label: '… y otro desarrollador sube otra rama distinta', test: (x) => Object.keys(getServer(x, URL)?.heads ?? {}).filter((b) => b !== 'main').length >= 2 },
              { id: 'pr', label: '3-4. Se abre un Pull Request', test: (x) => (getServer(x, URL)?.pulls.length ?? 0) > 0 },
              { id: 'review', label: '5. Un compañero aprueba los cambios', test: (x) => !!getServer(x, URL)?.pulls.some((p) => p.reviews.some((r) => r.state === 'approved')) },
              { id: 'merge', label: '6. Se fusionan las ramas en main', test: (x) => (getServer(x, URL)?.pulls.filter((p) => p.state === 'merged').length ?? 0) >= 2 },
              { id: 'sync', label: '7. Desarrollador C sincroniza su repositorio local', test: (x) => { const r = x.repos[join(HOME, 'dev-c')]; const s = getServer(x, URL); return !!r && !!s && r.heads.main === s.heads.main && s.pulls.some((p) => p.state === 'merged'); } },
            ]}
          />
          <Card title="Validador de Conventional Commits">
            <div className="space-y-2 p-3">
              <input value={msg} onChange={(e) => setMsg(e.target.value)} aria-label="Mensaje de commit" className="w-full rounded-md border border-line bg-bg-0 px-2 py-1.5 font-mono text-xs outline-none focus:border-gblue" />
              <p className={cx('flex items-center gap-1.5 text-xs', ccOk ? 'text-ggreen' : 'text-gred')}>
                {ccOk ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {ccOk ? 'Formato válido: tipo(ámbito opcional): descripción' : 'Usa tipo: descripción (p. ej. fix: corrige el login)'}
              </p>
              <ul className="space-y-0.5 font-mono text-[11px] text-fg-2">
                <li><b className="text-accent">feat:</b> nueva funcionalidad</li>
                <li><b className="text-accent">fix:</b> corrección de error</li>
                <li><b className="text-accent">docs:</b> documentación</li>
                <li><b className="text-accent">refactor:</b> reestructura sin cambiar comportamiento</li>
                <li><b className="text-accent">test:</b> pruebas</li>
                <li><b className="text-accent">chore:</b> tareas de mantenimiento</li>
              </ul>
            </div>
          </Card>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Nombres de ramas">
          <table className="w-full text-xs">
            <tbody>
              {[
                ['usuario/microservicios', 'Rama personal: quién/qué'],
                ['feature/autenticacion', 'Nueva funcionalidad'],
                ['fix/error-login', 'Corrección de un error'],
                ['docs/actualizar-readme', 'Documentación'],
                ['hotfix/pago-caido', 'Urgencia en producción'],
                ['refactor/servicio-pedidos', 'Mejora interna'],
              ].map(([b, d]) => (
                <tr key={b} className="border-t border-line first:border-0">
                  <td className="px-3 py-1.5 font-mono text-ggreen">{b}</td>
                  <td className="px-3 py-1.5 text-fg-2">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Buenas prácticas en equipo">
          <ul className="list-disc space-y-1 py-3 pl-8 pr-3 text-xs leading-relaxed text-fg-2">
            <li>Nunca trabajes directamente en main: una rama por tarea.</li>
            <li>Haz git pull (o fetch) antes de empezar y antes de abrir un PR.</li>
            <li>Commits pequeños y atómicos con mensajes claros.</li>
            <li>PRs pequeños, con descripción y "Closes #issue".</li>
            <li>Revisa el código de los demás con respeto y criterios claros.</li>
            <li>Nunca uses push --force en ramas compartidas (como mucho --force-with-lease en la tuya).</li>
            <li>Borra las ramas fusionadas para mantener el repositorio limpio.</li>
          </ul>
        </Card>
      </div>
      <ModuleQuiz
        moduleId="colaboracion"
        questions={[
          {
            question: 'Dos compañeros trabajan en ramas distintas y modifican archivos DISTINTOS. Al fusionar ambas en main…',
            options: [
              { text: 'Git combina los cambios automáticamente sin conflictos', correct: true, explanation: 'Los conflictos solo aparecen si se tocan las mismas líneas (o un lado borra lo que el otro modifica).' },
              { text: 'Siempre hay un conflicto', correct: false, explanation: 'Git fusiona automáticamente lo que no se solapa.' },
              { text: 'El segundo merge borra los cambios del primero', correct: false, explanation: 'Git conserva ambos.' },
            ],
          },
          {
            question: '¿Por qué un equipo pide revisiones en los Pull Requests?',
            options: [
              { text: 'Para detectar errores, compartir conocimiento y mantener la calidad antes de integrar', correct: true, explanation: 'La revisión es una de las prácticas más valiosas de un equipo.' },
              { text: 'Porque Git no permite fusionar sin revisión', correct: false, explanation: 'Es una regla de GitHub/el equipo, no de Git.' },
              { text: 'Para que el PR tarde más', correct: false, explanation: '…aunque a veces lo parezca 😄' },
            ],
          },
        ]}
      />
    </div>
  );
}
