import { BookOpen, Cloud, Database, FolderOpen, GitBranch, GitCommitHorizontal, History, Laptop, Layers, MousePointer2, Network } from 'lucide-react';
import { findRepo } from '../engine/repo';
import { SAMPLE_FILES } from '../engine/world';
import { fileInHead, workContent } from '../labs/checks';
import { Terminal } from '../components/Terminal';
import { ThreeStates } from '../components/ThreeStates';
import { Callout, Card, PageHeader } from '../components/ui';
import { useLabs } from '../store/labs';
import { Concept, LabTasks, ModuleQuiz, useActiveLab } from './common';

const LAB = 'fundamentals';

export default function Fundamentals() {
  useActiveLab(LAB);
  const reset = useLabs((s) => s.reset);
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Módulo 1"
        icon={<BookOpen size={22} />}
        title="Fundamentos de Git"
        subtitle="Antes de memorizar comandos, entiende las piezas: qué es un repositorio, un commit, una rama, HEAD, y cómo viaja un cambio entre las tres áreas de Git."
      />

      <div className="grid gap-3 md:grid-cols-2">
        <Concept title="¿Qué es el control de versiones?" icon={<History size={15} />} defaultOpen>
          <p>Es un sistema que registra los cambios de tus archivos a lo largo del tiempo para que puedas volver a cualquier versión, saber quién cambió qué y por qué, y trabajar en paralelo con otras personas sin pisaros.</p>
          <p>Sin control de versiones acabas con <i>proyecto_final_v2_definitivo_AHORA_SI.zip</i>. Con Git tienes un historial completo y navegable.</p>
        </Concept>
        <Concept title="¿Qué es Git?" icon={<GitBranch size={15} />} defaultOpen>
          <p><b className="text-fg">Git</b> es un sistema de control de versiones <b className="text-fg">distribuido</b>, creado por Linus Torvalds en 2005. Funciona en tu ordenador, sin internet: cada copia del repositorio tiene el historial completo.</p>
        </Concept>
        <Concept title="¿Qué es GitHub?" icon={<Cloud size={15} />}>
          <p><b className="text-fg">GitHub</b> es una plataforma web que aloja repositorios Git y añade herramientas de colaboración: Pull Requests, revisiones de código, issues, Actions (automatización), Pages (webs), permisos…</p>
          <p>Alternativas: GitLab, Bitbucket, Gitea. Todas usan Git por debajo.</p>
        </Concept>
        <Concept title="Diferencias entre Git y GitHub" icon={<Network size={15} />}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1"> </th>
                <th className="py-1">Git</th>
                <th className="py-1">GitHub</th>
              </tr>
            </thead>
            <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:py-1.5 [&_td]:pr-2">
              <tr><td className="text-muted">Qué es</td><td>Programa de control de versiones</td><td>Servicio web de alojamiento</td></tr>
              <tr><td className="text-muted">Dónde</td><td>Tu ordenador (local)</td><td>En la nube (remoto)</td></tr>
              <tr><td className="text-muted">Necesita internet</td><td>No</td><td>Sí</td></tr>
              <tr><td className="text-muted">Ofrece</td><td>commits, ramas, merge, historial</td><td>PRs, issues, Actions, Pages, permisos</td></tr>
              <tr><td className="text-muted">Interfaz</td><td>Terminal (y GUIs)</td><td>Navegador, gh CLI, apps</td></tr>
            </tbody>
          </table>
        </Concept>
        <Concept title="¿Qué es un repositorio?" icon={<Database size={15} />}>
          <p>Una carpeta de proyecto + la carpeta oculta <code className="font-mono text-accent">.git</code>, que es la base de datos donde Git guarda todos los commits, ramas y configuración. Se crea con <code className="font-mono text-accent">git init</code> o se descarga con <code className="font-mono text-accent">git clone</code>.</p>
        </Concept>
        <Concept title="¿Qué es un commit?" icon={<GitCommitHorizontal size={15} />}>
          <p>Una <b className="text-fg">instantánea</b> completa del proyecto en un momento dado, con autor, fecha, mensaje y un puntero a su commit padre. Se identifica por un hash SHA-1 de 40 caracteres (normalmente verás los 7 primeros).</p>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="rounded border border-line bg-bg-3 px-2 py-1">a1b2c3d<br /><span className="text-muted">Primer commit</span></span>←
            <span className="rounded border border-line bg-bg-3 px-2 py-1">9f8e7d6<br /><span className="text-muted">feat: login</span></span>←
            <span className="rounded border border-accent/60 bg-accent/10 px-2 py-1">4c5d6e7<br /><span className="text-muted">fix: error</span></span>
          </div>
          <p className="text-xs">Cada commit apunta a su padre: así se forma el historial.</p>
        </Concept>
        <Concept title="¿Qué es una rama?" icon={<GitBranch size={15} />}>
          <p>Un <b className="text-fg">puntero móvil</b> a un commit. Cuando haces un commit en una rama, el puntero avanza. Crear una rama no copia archivos: es instantáneo. Permiten desarrollar funcionalidades aisladas y fusionarlas después.</p>
        </Concept>
        <Concept title="¿Qué es HEAD?" icon={<MousePointer2 size={15} />}>
          <p>Es "dónde estás ahora". Normalmente HEAD apunta a una rama (HEAD → main), que a su vez apunta a un commit. Al cambiar de rama, HEAD se mueve. Si HEAD apunta directamente a un commit, estás en <b className="text-fg">detached HEAD</b>.</p>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="rounded bg-gcyan/20 px-1.5 py-0.5 text-gcyan">HEAD</span>→<span className="rounded bg-ggreen/15 px-1.5 py-0.5 text-ggreen">main</span>→<span className="rounded border border-line bg-bg-3 px-1.5 py-0.5">4c5d6e7</span>
          </div>
        </Concept>
        <Concept title="¿Qué es el working directory?" icon={<FolderOpen size={15} />}>
          <p>Los archivos que ves y editas en tu carpeta. Git compara este contenido con el staging y el último commit para saber qué ha cambiado.</p>
        </Concept>
        <Concept title="¿Qué es el staging area?" icon={<Layers size={15} />}>
          <p>También llamado <b className="text-fg">índice</b>. Es la zona de preparación: contiene exactamente lo que irá en el próximo commit. Con <code className="font-mono text-accent">git add</code> copias cambios del working directory al staging. Te permite hacer commits precisos aunque hayas tocado muchas cosas.</p>
        </Concept>
        <Concept title="Repositorio local y remoto" icon={<Laptop size={15} />}>
          <p>El <b className="text-fg">local</b> está en tu ordenador. El <b className="text-fg">remoto</b> es otra copia (normalmente en GitHub) que comparte el equipo. Se sincronizan con <code className="font-mono text-accent">git push</code> (subir) y <code className="font-mono text-accent">git fetch</code>/<code className="font-mono text-accent">git pull</code> (descargar).</p>
        </Concept>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Los tres estados, en vivo</h2>
        <Callout tone="info">
          Este laboratorio ya tiene un repositorio con un commit (README.md y app.js) y un archivo nuevo, styles.css. Selecciona un archivo, ejecuta <b>git add</b> y <b>git commit</b> (con los botones o en la terminal) y observa cómo se mueve entre las áreas.
        </Callout>
        <ThreeStates labId={LAB} />
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Terminal labId={LAB} className="h-72" suggestions={['git status', 'git add styles.css', 'git status', 'git commit -m "style: añade estilos"', 'echo "// cambio" >> app.js', 'git diff', 'git log --oneline']} onReset={() => reset(LAB)} />
          <LabTasks
            labId={LAB}
            tasks={[
              { id: 'stage', label: 'Prepara styles.css (pasa a Staging)', test: (w) => { const r = findRepo(w); return !!r && ('styles.css' in r.index); } },
              { id: 'commit', label: 'Confírmalo en un commit (pasa al Repositorio)', test: (w) => fileInHead(findRepo(w), 'styles.css') },
              { id: 'modify', label: 'Modifica app.js y observa que aparece "modificado" en el Working Directory', test: (w) => workContent(w, 'app.js') !== undefined && workContent(w, 'app.js') !== SAMPLE_FILES['app.js'] },
              { id: 'diff', label: 'Mira el cambio con git diff', test: (_w, log) => log.some((l) => l.command === 'git diff' && l.ok) },
            ]}
          />
        </div>
      </section>

      <ModuleQuiz
        moduleId="fundamentos"
        questions={[
          {
            question: '¿Qué afirmación sobre Git y GitHub es correcta?',
            options: [
              { text: 'Git funciona en local sin internet; GitHub aloja repositorios Git en la nube', correct: true, explanation: 'Exacto. Puedes usar Git toda tu vida sin GitHub, pero no GitHub sin Git.' },
              { text: 'GitHub es la versión nueva de Git', correct: false, explanation: 'Son cosas distintas: un programa y un servicio web.' },
              { text: 'Git solo funciona si tienes cuenta de GitHub', correct: false, explanation: 'Git es independiente de cualquier plataforma.' },
            ],
          },
          {
            question: 'Ejecutas git add app.js. ¿Dónde está ahora ese cambio?',
            options: [
              { text: 'En el staging area, listo para el próximo commit', correct: true, explanation: 'Correcto. Todavía no forma parte del historial.' },
              { text: 'En el historial del repositorio', correct: false, explanation: 'Aún falta git commit.' },
              { text: 'En GitHub', correct: false, explanation: 'git add es una operación local.' },
            ],
          },
          {
            question: '¿Qué es HEAD?',
            options: [
              { text: 'Una referencia a dónde estás: normalmente apunta a la rama actual', correct: true, explanation: 'HEAD → rama → commit.' },
              { text: 'El primer commit del repositorio', correct: false, explanation: 'El primer commit es el "root commit".' },
              { text: 'La rama principal', correct: false, explanation: 'La rama principal suele llamarse main; HEAD puede apuntar a cualquier rama.' },
            ],
          },
        ]}
      />
      <Card title="Siguiente paso">
        <p className="p-4 text-sm text-fg-2">
          Continúa en la <a className="text-gblue hover:underline" href="#/terminal">Terminal interactiva</a> para crear tu propio repositorio desde cero.
        </p>
      </Card>
    </div>
  );
}
