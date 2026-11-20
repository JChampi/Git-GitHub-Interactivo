import { ExternalLink } from 'lucide-react';
import { Github } from '../components/icons';
import { GitHubSim } from '../components/github/GitHubSim';
import { Terminal } from '../components/Terminal';
import { Badge, Callout, Card, PageHeader } from '../components/ui';
import { findRepo } from '../engine/repo';
import { getServer } from '../engine/server';
import { useLabs } from '../store/labs';
import { Concept, LabTasks, ModuleQuiz, useActiveLab } from './common';

const LAB = 'github';
const MINE = 'https://github.com/estudiante/mi-portfolio.git';
const OSS = 'https://github.com/open-source-org/awesome-git.git';

const TOPICS: { t: string; real?: boolean; d: string }[] = [
  { t: 'Crear una cuenta', real: true, d: 'En github.com/signup con correo, usuario y contraseña. Activa la verificación en dos pasos. El laboratorio usa la cuenta simulada "estudiante".' },
  { t: 'Crear repositorios', d: 'Botón "Nuevo": nombre, descripción, visibilidad e inicialización opcional (README, .gitignore, licencia). Si ya tienes un repo local, créalo vacío.' },
  { t: 'Públicos y privados', d: 'Público: cualquiera lo ve (tú decides quién escribe). Privado: solo tú y tus colaboradores. Se puede cambiar en Configuración.' },
  { t: 'README.md', d: 'La portada del repositorio: qué es, cómo instalarlo y usarlo. GitHub lo renderiza en Markdown automáticamente.' },
  { t: '.gitignore', d: 'Plantillas por lenguaje (Node, Python…) para no subir dependencias, builds ni secretos.' },
  { t: 'Licencias', d: 'Definen qué pueden hacer otros con tu código: MIT (permisiva), Apache-2.0, GPL-3.0 (copyleft). Sin licencia, nadie puede reutilizarlo legalmente.' },
  { t: 'Tags', d: 'Marcan commits concretos (versiones). Se crean con git tag y se suben con git push --tags.' },
  { t: 'Releases', d: 'Una versión publicada sobre un tag, con notas de cambios y archivos descargables.' },
  { t: 'Issues', d: 'Registro de errores, tareas y propuestas, con etiquetas, comentarios y asignaciones. "Closes #n" en un PR los cierra al fusionar.' },
  { t: 'Pull Requests', d: 'Proponen fusionar una rama en otra. Permiten revisión de código, comentarios, checks automáticos y aprobación.' },
  { t: 'Forks', d: 'Copia de un repositorio ajeno en tu cuenta. Así contribuyes a proyectos donde no tienes permisos: fork → rama → PR al original.' },
  { t: 'Stars', d: 'Marcar un repositorio como favorito (y una medida de popularidad).' },
  { t: 'Watch', d: 'Suscribirte a las notificaciones de un repositorio.' },
  { t: 'GitHub Projects', d: 'Tableros (kanban) para planificar issues y PRs. El laboratorio incluye un tablero simplificado.' },
  { t: 'GitHub Actions', d: 'Automatización (CI/CD) con archivos YAML en .github/workflows/. Se ejecutan en cada push o PR. Aquí el runner es simulado.' },
  { t: 'GitHub Pages', d: 'Hosting gratuito de sitios estáticos desde una rama. La URL y la vista previa del laboratorio son simuladas.' },
  { t: 'Protección de ramas', d: 'Reglas que impiden push directo, exigen PR con aprobaciones y checks verdes, o prohíben force push.' },
  { t: 'Permisos de colaboradores', d: 'Read (ver/clonar), Write (push, PRs), Admin (configuración). En organizaciones hay más roles (Triage, Maintain).' },
];

export default function GitHubModule() {
  useActiveLab(LAB);
  const reset = useLabs((s) => s.reset);
  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Módulo 8"
        icon={<Github size={22} />}
        title="GitHub"
        subtitle="Practica con una réplica simulada de GitHub conectada a tu terminal: crea repositorios, publica con git push, abre issues y Pull Requests, haz forks, crea releases, protege ramas y activa Pages."
      />
      <Callout tone="sim" title="¿Qué es simulado y qué requiere una cuenta real?">
        Todo lo que haces en esta página ocurre en tu navegador: la cuenta, los repositorios, los revisores, Actions y Pages son <b>simulaciones educativas</b> que siguen las reglas de GitHub. En GitHub real necesitarás una cuenta, autenticarte al hacer push (token personal o clave SSH) y, para colaborar, que te den permisos.{' '}
        <a href="https://docs.github.com/es/get-started" target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-gblue hover:underline">
          Documentación oficial <ExternalLink size={12} />
        </a>
      </Callout>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {TOPICS.map((x) => (
          <Concept key={x.t} title={x.t} icon={x.real ? <Badge tone="yellow">cuenta real</Badge> : <Badge tone="purple">simulado</Badge>}>
            <p>{x.d}</p>
          </Concept>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Práctica: publica tu portfolio y contribuye</h2>
        <p className="text-sm text-fg-2">En <code className="font-mono">~/mi-portfolio</code> tienes un repositorio local con un commit. Publícalo en GitHub y explora el resto de funciones.</p>
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <GitHubSim labId={LAB} />
            <Terminal labId={LAB} className="h-64" onReset={() => reset(LAB)} suggestions={[`git remote add origin ${MINE}`, 'git push -u origin main', 'git tag -a v1.0.0 -m "Primera versión"', 'git push --tags', 'gh repo create mi-portfolio --public', 'gh issue create --title "Añadir sección de proyectos"', `git clone https://github.com/estudiante/awesome-git.git ~/awesome-git`]} />
          </div>
          <LabTasks
            labId={LAB}
            tasks={[
              { id: 'create', label: 'Crea el repositorio vacío estudiante/mi-portfolio', test: (w) => !!getServer(w, MINE) },
              { id: 'remote', label: 'Conéctalo como origin en tu repositorio local', test: (w) => !!w.repos['/home/estudiante/mi-portfolio']?.remotes.origin },
              { id: 'push', label: 'Publica main con git push -u origin main', test: (w) => !!getServer(w, MINE)?.heads.main && !!w.repos['/home/estudiante/mi-portfolio']?.upstream.main },
              { id: 'issue', label: 'Crea un issue en tu repositorio', test: (w) => (getServer(w, MINE)?.issues.length ?? 0) > 0 },
              { id: 'release', label: 'Publica una release v1.0.0', test: (w) => !!getServer(w, MINE)?.releases.some((r) => r.tag === 'v1.0.0') },
              { id: 'pages', label: 'Activa GitHub Pages (Configuración)', test: (w) => !!getServer(w, MINE)?.pages.enabled },
              { id: 'protect', label: 'Protege la rama main', test: (w) => !!getServer(w, MINE)?.protectedBranches.main },
              { id: 'star', label: 'Dale una estrella a open-source-org/awesome-git', test: (w) => !!getServer(w, OSS)?.starredByMe },
              { id: 'fork', label: 'Haz un fork de awesome-git', test: (w) => !!getServer(w, 'https://github.com/estudiante/awesome-git.git') },
              { id: 'clone-fork', label: 'Clona tu fork en local', test: (w) => Object.values(w.repos).some((r) => Object.values(r.remotes).some((u) => u.includes('estudiante/awesome-git'))) || !!findRepo(w, '/home/estudiante/awesome-git') },
            ]}
          />
        </div>
      </section>

      <Card title="Flujo de publicación de código">
        <ol className="grid gap-px bg-line text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['1. Crear', 'Repositorio en GitHub (vacío si ya tienes código local).'],
            ['2. Conectar', 'git remote add origin <url>'],
            ['3. Publicar', 'git push -u origin main'],
            ['4. Iterar', 'commit → push; ramas + Pull Requests para colaborar.'],
          ].map(([t, d]) => (
            <li key={t} className="bg-bg-2 p-4">
              <p className="font-semibold">{t}</p>
              <p className="mt-1 text-xs text-fg-2">{d}</p>
            </li>
          ))}
        </ol>
      </Card>

      <ModuleQuiz
        moduleId="github"
        questions={[
          {
            question: 'Creas un repositorio en GitHub marcando "Añadir README" y luego intentas git push de tu repo local con historia propia. ¿Qué ocurre?',
            options: [
              { text: 'Se rechaza: el remoto tiene un commit (el README) que tu historia no contiene', correct: true, explanation: 'Por eso, si ya tienes código local, crea el remoto vacío.' },
              { text: 'Se fusionan automáticamente', correct: false, explanation: 'Git nunca fusiona sin que lo pidas.' },
              { text: 'GitHub borra el README', correct: false, explanation: 'No: el push se rechaza para no perder ese commit.' },
            ],
          },
          {
            question: '¿Qué diferencia hay entre un fork y un clone?',
            options: [
              { text: 'Fork copia el repo a tu cuenta de GitHub; clone lo descarga a tu ordenador', correct: true, explanation: 'Normalmente haces ambos: fork en GitHub y clone de tu fork.' },
              { text: 'Son lo mismo', correct: false, explanation: 'Ocurren en lugares distintos.' },
              { text: 'Fork solo copia la rama main', correct: false, explanation: 'Copia todo el repositorio.' },
            ],
          },
          {
            question: 'La rama main está protegida con "Requerir Pull Request". ¿Cómo llevas tus cambios a main?',
            options: [
              { text: 'Subiendo una rama y abriendo un PR que cumpla las reglas (aprobaciones, checks)', correct: true, explanation: 'El push directo a main se rechaza con GH006.' },
              { text: 'git push --force a main', correct: false, explanation: 'La protección también bloquea force push.' },
              { text: 'Pidiendo a GitHub que desactive la protección', correct: false, explanation: 'La protección existe precisamente para revisar los cambios.' },
            ],
          },
        ]}
      />
    </div>
  );
}
