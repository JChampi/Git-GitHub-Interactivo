import { FolderGit2 } from 'lucide-react';
import { computeStatus } from '../engine/repo';
import { Workspace } from '../components/Workspace';
import { Badge, Callout, Card, PageHeader } from '../components/ui';
import { commitCount, fileInHead, repoAt, stagedPaths } from '../labs/checks';
import { LabTasks, ModuleQuiz, useActiveLab } from './common';

const LAB = 'repos';

export default function Repositories() {
  useActiveLab(LAB);
  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Módulo 3"
        icon={<FolderGit2 size={22} />}
        title="Repositorios y archivos"
        subtitle="Un explorador como el de VS Code sobre el repositorio de ejemplo. Crea, edita, renombra o elimina archivos con el ratón y observa cómo cambian sus estados en Git (y en git status)."
      />
      <Card title="Leyenda de estados">
        <div className="grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><Badge tone="green">U</Badge> <b>Untracked</b><p className="text-xs text-fg-2">Archivo nuevo que Git aún no rastrea (notas.txt).</p></div>
          <div><Badge tone="yellow">M</Badge> <b>Modificado</b><p className="text-xs text-fg-2">Rastreado, con cambios sin preparar (styles.css).</p></div>
          <div><Badge tone="green">A / M</Badge> <b>Staged</b><p className="text-xs text-fg-2">Cambios preparados para el próximo commit (app.js).</p></div>
          <div><Badge tone="red">D</Badge> <b>Eliminado</b><p className="text-xs text-fg-2">Rastreado pero borrado del disco: aparece tachado.</p></div>
        </div>
      </Card>
      <Callout tone="info">
        Pruébalo: abre <b>index.html</b> en el explorador, edítalo y pulsa Guardar (Ctrl+S). Después ejecuta <code className="font-mono">git status</code> o mira la pestaña "Tres estados". Las carpetas vacías (como img/ con su .gitkeep) también tienen su truco.
      </Callout>
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <Workspace labId={LAB} views={['states', 'graph']} suggestions={['git status', 'git status -s', 'git add notas.txt', 'git restore --staged app.js', 'git diff', 'git diff --staged', 'git add .', 'git commit -m "feat: cambios"']} />
        <div className="space-y-4">
          <LabTasks
            labId={LAB}
            tasks={[
              { id: 'edit', label: 'Edita index.html desde el editor y guárdalo', test: (w) => { const r = repoAt(w); return !!r && computeStatus(w, r).unstaged.concat(computeStatus(w, r).staged).some((c) => c.path === 'index.html') || fileInHead(r, 'index.html') && commitCount(r) > 2; } },
              { id: 'new', label: 'Crea un archivo nuevo desde el explorador (contacto.html)', test: (w) => w.fs.files['/home/estudiante/proyecto/contacto.html'] !== undefined },
              { id: 'stage', label: 'Prepara contacto.html y styles.css', test: (w) => { const r = repoAt(w); return ['contacto.html', 'styles.css'].every((p) => stagedPaths(w, r).includes(p) || fileInHead(r, p) && commitCount(r) > 2); } },
              { id: 'rename', label: 'Renombra notas.txt (botón ✎) y observa el estado', test: (w) => w.fs.files['/home/estudiante/proyecto/notas.txt'] === undefined },
              { id: 'commit', label: 'Confirma todo lo preparado', test: (w) => commitCount(repoAt(w)) >= 3 },
            ]}
          />
          <Card title="Cosas que conviene saber">
            <ul className="list-disc space-y-1.5 py-3 pl-8 pr-3 text-xs leading-relaxed text-fg-2">
              <li>Renombrar un archivo con el explorador (o mv) se ve como <i>deleted + untracked</i> hasta que haces git add de ambos; git mv lo hace en un solo paso.</li>
              <li>Git no versiona carpetas vacías: por convención se añade un archivo <code>.gitkeep</code>.</li>
              <li>git status -s muestra dos columnas: la izquierda es el staging y la derecha el working directory.</li>
            </ul>
          </Card>
        </div>
      </div>
      <ModuleQuiz
        moduleId="repositorios"
        questions={[
          {
            question: 'git status -s muestra "MM app.js". ¿Qué significa?',
            options: [
              { text: 'app.js tiene cambios preparados y, además, otros cambios sin preparar', correct: true, explanation: 'Primera columna = staging, segunda = working directory.' },
              { text: 'app.js se modificó dos veces en el historial', correct: false, explanation: 'status no habla del historial, sino del estado actual.' },
              { text: 'Hay un conflicto en app.js', correct: false, explanation: 'Los conflictos se muestran como UU.' },
            ],
          },
          {
            question: 'Creas la carpeta vacía docs/ y ejecutas git add docs. ¿Qué pasa?',
            options: [
              { text: 'Nada: Git no rastrea carpetas vacías', correct: true, explanation: 'Añade un archivo (por ejemplo docs/.gitkeep) para versionarla.' },
              { text: 'La carpeta queda preparada', correct: false, explanation: 'Git solo rastrea archivos.' },
              { text: 'Git muestra un error y borra la carpeta', correct: false, explanation: 'Git no borra nada; dice que el pathspec no coincide con archivos.' },
            ],
          },
        ]}
      />
    </div>
  );
}
