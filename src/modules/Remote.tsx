import { ArrowDown, ArrowUp, CloudDownload, RefreshCw, Server } from 'lucide-react';
import { findRepo } from '../engine/repo';
import { getServer } from '../engine/server';
import { COMPARISONS } from '../data/commands';
import { RemoteView } from '../components/RemoteView';
import { Workspace } from '../components/Workspace';
import { Callout, Card, PageHeader } from '../components/ui';
import { used, usedArg } from '../labs/checks';
import { REMOTE } from '../labs/presets';
import { LabTasks, ModuleQuiz, useActiveLab } from './common';

const LAB = 'remote';

export default function Remote() {
  useActiveLab(LAB);
  const fetchPull = COMPARISONS.find((c) => c.title === 'fetch vs pull')!;
  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Módulo 7"
        icon={<Server size={22} />}
        title="Git remoto"
        subtitle="Tu repositorio local y el del servidor son copias independientes. Se sincronizan solo cuando tú lo pides: push sube, fetch descarga, pull descarga e integra."
      />
      <div className="grid gap-3 md:grid-cols-3">
        <Card title="git fetch" icon={<RefreshCw size={15} className="text-gblue" />}>
          <p className="p-3 text-sm text-fg-2">Descarga commits nuevos y actualiza <code className="font-mono">origin/*</code>. <b className="text-fg">No toca</b> tus ramas ni tus archivos. Seguro siempre.</p>
        </Card>
        <Card title="git pull" icon={<CloudDownload size={15} className="text-ggreen" />}>
          <p className="p-3 text-sm text-fg-2"><b className="text-fg">fetch + merge</b> (o rebase) de la rama remota en tu rama actual. Puede generar un commit de merge o conflictos.</p>
        </Card>
        <Card title="git push" icon={<ArrowUp size={15} className="text-accent" />}>
          <p className="p-3 text-sm text-fg-2">Sube tus commits. Solo se acepta si es <b className="text-fg">fast-forward</b>: si el remoto tiene trabajo que tú no tienes, se rechaza.</p>
        </Card>
      </div>
      <Callout tone="sim">
        Has clonado <code className="font-mono">{REMOTE}</code> en <code className="font-mono">~/tienda-web</code>. Usa "Simular push de un compañero" para que alguien suba un commit al servidor: verás cómo tu repositorio NO se entera hasta que hagas fetch.
      </Callout>
      <Card title="Local ↔ Remoto" icon={<ArrowDown size={15} className="text-accent" />}>
        <div className="p-3">
          <RemoteView labId={LAB} />
        </div>
      </Card>
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <Workspace labId={LAB} views={['graph']} suggestions={['git remote -v', 'git branch -a', 'git branch -r', 'git fetch', 'git status', 'git pull', 'git push', 'git switch -c feature/x', 'git push -u origin feature/x', 'git push origin --delete feature/x', 'git remote show origin']} />
        <div className="space-y-4">
          <LabTasks
            labId={LAB}
            tasks={[
              { id: 'remote-v', label: 'Consulta los remotos configurados', test: (_w, l) => used(l, 'git remote') },
              { id: 'branch-r', label: 'Lista las ramas remotas (git branch -r o -a)', test: (_w, l) => usedArg(l, 'git branch', '-r') || usedArg(l, 'git branch', '-a') },
              { id: 'fetch', label: 'Tras un push de un compañero, ejecuta git fetch y git status', test: (_w, l) => used(l, 'git fetch') && used(l, 'git status') },
              { id: 'pull', label: 'Integra los cambios con git pull', test: (_w, l) => used(l, 'git pull') },
              { id: 'push', label: 'Haz un commit y súbelo con git push', test: (w) => { const r = findRepo(w); const s = getServer(w, REMOTE); return !!r && !!s && Object.values(s.objects.commits).some((c) => c.author.email === 'estudiante@example.com'); } },
              { id: 'push-u', label: 'Publica una rama nueva con git push -u origin <rama>', test: (_w, l) => l.some((r) => r.command === 'git push' && r.ok && (r.argv.includes('-u') || r.argv.includes('--set-upstream'))) },
              { id: 'delete', label: 'Borra esa rama remota (git push origin --delete <rama>)', test: (_w, l) => l.some((r) => r.command === 'git push' && r.ok && r.argv.includes('--delete')) },
            ]}
          />
          <Card title={fetchPull.title}>
            <table className="w-full text-xs">
              <tbody>
                {fetchPull.rows.map((r) => (
                  <tr key={r.label} className="border-t border-line first:border-0">
                    <td className="px-3 py-1.5 text-muted">{r.label}</td>
                    {r.values.map((v, i) => (
                      <td key={i} className="px-2 py-1.5">{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
      <ModuleQuiz
        moduleId="remoto"
        questions={[
          {
            question: 'Un compañero subió commits. Ejecutas git status SIN hacer fetch antes. ¿Qué verás?',
            options: [
              { text: '"Your branch is up to date": tu Git aún no sabe que hay cambios', correct: true, explanation: 'status compara con origin/main tal como quedó en tu último fetch.' },
              { text: '"Your branch is behind"', correct: false, explanation: 'Solo lo sabrás tras un fetch.' },
              { text: 'Un error de conexión', correct: false, explanation: 'status es una operación local.' },
            ],
          },
          {
            question: '¿Qué es origin/main?',
            options: [
              { text: 'Una rama de seguimiento: tu copia local de dónde estaba main en el remoto la última vez que sincronizaste', correct: true, explanation: 'Se actualiza con fetch, pull y push. No puedes hacer commits en ella directamente.' },
              { text: 'La rama main del servidor en tiempo real', correct: false, explanation: 'Es una "foto" del último contacto con el servidor.' },
              { text: 'Una rama que crea GitHub automáticamente', correct: false, explanation: 'La gestiona tu Git local.' },
            ],
          },
          {
            question: '¿Para qué sirve -u en git push -u origin feature/x?',
            options: [
              { text: 'Enlaza tu rama local con la remota para que luego basten git push y git pull', correct: true, explanation: 'Configura el "upstream".' },
              { text: 'Fuerza la subida', correct: false, explanation: 'Forzar es --force.' },
              { text: 'Sube solo los cambios no confirmados', correct: false, explanation: 'push solo sube commits.' },
            ],
          },
        ]}
      />
    </div>
  );
}
