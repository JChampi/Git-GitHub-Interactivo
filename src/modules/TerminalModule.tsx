import { Terminal as TerminalIcon } from 'lucide-react';
import { Workspace } from '../components/Workspace';
import { Callout, Card, Kbd, PageHeader } from '../components/ui';
import { commitCount, fileInHead, repoAt, used } from '../labs/checks';
import { useLabs } from '../store/labs';
import { LabTasks, ModuleQuiz, useActiveLab } from './common';

const LAB = 'terminal';
const COMMANDS: [string, string][] = [
  ['git --version', 'Versión de Git'],
  ['git help', 'Lista de comandos'],
  ['git config --global user.name "Tu Nombre"', 'Identidad'],
  ['git init', 'Crear repositorio'],
  ['git status', 'Estado actual'],
  ['echo "# Proyecto" > README.md', 'Crear archivo'],
  ['git add README.md', 'Preparar'],
  ['git commit -m "docs: README"', 'Confirmar'],
  ['git log --oneline', 'Historial'],
  ['git diff', 'Diferencias'],
  ['git show', 'Último commit'],
  ['git mv README.md LEEME.md', 'Renombrar'],
  ['git rm --cached archivo', 'Dejar de rastrear'],
  ['git clone https://github.com/equipo/tienda-web.git', 'Clonar (requiere el repo)'],
];

export default function TerminalModule() {
  useActiveLab(LAB);
  const setPending = useLabs((s) => s.setPendingInput);
  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Módulo 2"
        icon={<TerminalIcon size={22} />}
        title="Terminal interactiva"
        subtitle="Una terminal tipo Bash conectada a un motor Git real: cada comando modifica el estado del repositorio simulado (archivos, staging, commits, ramas). No hay respuestas predefinidas."
      />
      <Callout tone="info" title="Cómo funciona">
        Estás en <code className="font-mono">~/proyecto</code>, una carpeta vacía. Usa <Kbd>Tab</Kbd> para autocompletar, <Kbd>↑</Kbd>/<Kbd>↓</Kbd> para el historial y <Kbd>Ctrl</Kbd>+<Kbd>L</Kbd> para limpiar. Comandos de sistema disponibles: ls, cd, pwd, cat, echo, touch, mkdir, rm, mv, cp, tree, nano (abre el editor)… escribe <code className="font-mono">help</code>. Cada error incluye una pista en morado.
      </Callout>
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <Workspace labId={LAB} views={['graph', 'states']} suggestions={['git init', 'git status', 'ls -a', 'git add .', 'git commit -m ""', 'git log --oneline']} welcome="Bienvenido. Empieza con: git init" />
        <div className="space-y-4">
          <LabTasks
            labId={LAB}
            tasks={[
              { id: 'version', label: 'Comprueba la versión de Git', test: (_w, l) => used(l, 'git --version') },
              { id: 'init', label: 'Inicializa un repositorio en ~/proyecto', test: (w) => !!repoAt(w) },
              { id: 'status', label: 'Consulta el estado con git status', test: (_w, l) => used(l, 'git status') },
              { id: 'commit', label: 'Crea un archivo y confírmalo', test: (w) => commitCount(repoAt(w)) >= 1 },
              { id: 'two', label: 'Modifica el archivo y haz un segundo commit', test: (w) => commitCount(repoAt(w)) >= 2 },
              { id: 'inspect', label: 'Revisa el historial (log) y un commit (show)', test: (_w, l) => used(l, 'git log') && used(l, 'git show') },
              { id: 'mv', label: 'Renombra un archivo rastreado con git mv y confírmalo', test: (w, l) => used(l, 'git mv') && commitCount(repoAt(w)) >= 3 },
              { id: 'readme', label: 'Mantén un README.md confirmado', test: (w) => fileInHead(repoAt(w), 'README.md') || fileInHead(repoAt(w), 'LEEME.md') },
            ]}
          />
          <Card title="Comandos iniciales">
            <ul className="divide-y divide-line">
              {COMMANDS.map(([c, d]) => (
                <li key={c}>
                  <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-3 cursor-pointer" onClick={() => setPending(LAB, c)} title="Escribir en la terminal">
                    <code className="truncate font-mono text-[11.5px] text-accent-2">{c}</code>
                    <span className="ml-auto shrink-0 text-[11px] text-muted">{d}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      <ModuleQuiz
        moduleId="terminal"
        questions={[
          {
            question: 'Escribes git commit -m "x" y Git responde "nothing added to commit but untracked files present". ¿Qué falta?',
            options: [
              { text: 'Preparar los archivos con git add', correct: true, explanation: 'Los archivos nuevos no entran en un commit hasta que los añades al staging.' },
              { text: 'Ejecutar git init otra vez', correct: false, explanation: 'El repositorio ya existe; el problema es el staging vacío.' },
              { text: 'Hacer git push', correct: false, explanation: 'push sube commits ya creados; aquí aún no hay commit.' },
            ],
          },
          {
            question: '¿Qué muestra git log --oneline?',
            options: [
              { text: 'Un commit por línea: SHA abreviado y primera línea del mensaje', correct: true, explanation: 'Es la forma más rápida de repasar el historial.' },
              { text: 'Las líneas modificadas del último commit', correct: false, explanation: 'Eso lo hace git show o git log -p.' },
              { text: 'Solo el último commit', correct: false, explanation: 'Muestra todo el historial (puedes limitarlo con -n).' },
            ],
          },
        ]}
      />
    </div>
  );
}
