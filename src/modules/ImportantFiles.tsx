import { FileCog, FlaskConical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { matchIgnore, parseGitignore } from '../engine/ignore';
import { computeStatus } from '../engine/repo';
import { Workspace } from '../components/Workspace';
import { Badge, Callout, Card, PageHeader, cx } from '../components/ui';
import { fileInHead, repoAt, workContent } from '../labs/checks';
import { Concept, LabTasks, ModuleQuiz, useActiveLab } from './common';

const LAB = 'files';

const EXCLUDE = [
  ['node_modules/, vendor/, .venv/', 'Dependencias: se reinstalan con npm install / pip install'],
  ['dist/, build/, *.min.js', 'Archivos generados por el build'],
  ['.env, *.pem, credenciales', 'Secretos y contraseñas (¡nunca al repositorio!)'],
  ['*.log, logs/, tmp/', 'Registros y temporales'],
  ['.DS_Store, Thumbs.db', 'Basura del sistema operativo'],
  ['.idea/, .vscode/ (según el equipo)', 'Configuración personal del editor'],
  ['coverage/, .cache/', 'Resultados de herramientas'],
];

export default function ImportantFiles() {
  useActiveLab(LAB);
  const [patterns, setPatterns] = useState('node_modules/\n*.log\n!importante.log\n/build\n.env\n**/temp');
  const [paths, setPaths] = useState('node_modules/react/index.js\nsrc/app.js\nerror.log\nimportante.log\nbuild/main.js\nsrc/build/x.js\n.env\nsrc/temp/a.txt');
  const results = useMemo(() => {
    const rules = parseGitignore(patterns);
    return paths
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ({ p, rule: matchIgnore(rules, p) }));
  }, [patterns, paths]);

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Módulo 12"
        icon={<FileCog size={22} />}
        title="Archivos importantes"
        subtitle="Algunos archivos con nombre especial cambian el comportamiento de Git o de GitHub. Conócelos y practica configurándolos."
      />

      <Card title="Probador de .gitignore" icon={<FlaskConical size={15} className="text-accent" />}>
        <div className="grid gap-px bg-line md:grid-cols-3">
          <label className="block bg-bg-2 p-3">
            <span className="text-xs font-semibold">Patrones (.gitignore)</span>
            <textarea value={patterns} onChange={(e) => setPatterns(e.target.value)} rows={8} className="mt-1.5 w-full rounded-md border border-line bg-bg-0 p-2 font-mono text-[12px] outline-none focus:border-gblue" />
          </label>
          <label className="block bg-bg-2 p-3">
            <span className="text-xs font-semibold">Rutas a comprobar</span>
            <textarea value={paths} onChange={(e) => setPaths(e.target.value)} rows={8} className="mt-1.5 w-full rounded-md border border-line bg-bg-0 p-2 font-mono text-[12px] outline-none focus:border-gblue" />
          </label>
          <div className="bg-bg-2 p-3">
            <span className="text-xs font-semibold">Resultado</span>
            <ul className="mt-1.5 space-y-1">
              {results.map(({ p, rule }) => {
                const ignored = !!rule && !rule.negate;
                return (
                  <li key={p} className="flex items-center gap-2 text-[12px]">
                    <Badge tone={ignored ? 'red' : 'green'}>{ignored ? 'ignorado' : 'versionado'}</Badge>
                    <span className={cx('truncate font-mono', ignored && 'text-muted line-through')}>{p}</span>
                    {rule && <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted">línea {rule.line}: {rule.pattern}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <p className="border-t border-line px-3 py-2 text-xs text-muted">Usa el mismo intérprete que el motor: <code className="font-mono">*</code> cualquier cosa salvo "/", <code className="font-mono">**</code> cualquier profundidad, <code className="font-mono">/</code> inicial ancla a la raíz, <code className="font-mono">/</code> final solo carpetas, <code className="font-mono">!</code> excepción. La última regla que coincide gana.</p>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Concept title=".gitignore" defaultOpen>
          <p>Lista de patrones de archivos que Git no debe rastrear. Solo afecta a archivos <b className="text-fg">no rastreados</b>: si ya confirmaste uno, primero <code className="font-mono">git rm --cached archivo</code>.</p>
          <p>Puede haber varios (uno por carpeta). Comprueba qué se ignora con <code className="font-mono">git status --ignored</code>.</p>
        </Concept>
        <Concept title="README.md" defaultOpen>
          <p>La portada del proyecto. GitHub lo muestra al abrir el repositorio. Debería explicar: qué es, cómo instalarlo, cómo usarlo, cómo contribuir y la licencia.</p>
          <pre className="rounded bg-bg-1 p-2 font-mono text-[11px]">{'# Nombre\n\nDescripción breve.\n\n## Instalación\nnpm install\n\n## Uso\nnpm start\n\n## Licencia\nMIT'}</pre>
        </Concept>
        <Concept title=".gitattributes">
          <p>Define cómo trata Git ciertos archivos: finales de línea, archivos binarios, estrategias de diff/merge o estadísticas de lenguajes en GitHub.</p>
          <pre className="rounded bg-bg-1 p-2 font-mono text-[11px]">{'* text=auto\n*.sh text eol=lf\n*.png binary\ndocs/** linguist-documentation'}</pre>
        </Concept>
        <Concept title=".gitkeep">
          <p>Git no versiona carpetas vacías. Por convención se crea un archivo vacío <code className="font-mono">.gitkeep</code> dentro para que la carpeta exista en el repositorio. (El nombre no es especial para Git: es una costumbre.)</p>
        </Concept>
        <Concept title=".gitmodules (submódulos)">
          <p>Registra repositorios incluidos dentro de otro (submódulos), fijados a un commit concreto. Se crea con <code className="font-mono">git submodule add &lt;url&gt; ruta</code> y se clona con <code className="font-mono">git clone --recurse-submodules</code>.</p>
          <pre className="rounded bg-bg-1 p-2 font-mono text-[11px]">{'[submodule "libs/ui"]\n\tpath = libs/ui\n\turl = https://github.com/equipo/ui.git'}</pre>
          <Badge tone="purple">solo documentación: los submódulos no se simulan</Badge>
        </Concept>
        <Concept title="Git Hooks">
          <p>Scripts que Git ejecuta automáticamente en ciertos momentos, en <code className="font-mono">.git/hooks/</code>: <code className="font-mono">pre-commit</code> (lint/tests antes del commit), <code className="font-mono">commit-msg</code> (validar el mensaje), <code className="font-mono">pre-push</code>… No se versionan por defecto: herramientas como Husky los comparten con el equipo.</p>
          <pre className="rounded bg-bg-1 p-2 font-mono text-[11px]">{'#!/bin/sh\n# .git/hooks/commit-msg\ngrep -qE "^(feat|fix|docs|chore)(\\(.+\\))?: " "$1" || {\n  echo "Usa Conventional Commits"; exit 1; }'}</pre>
          <Badge tone="purple">solo documentación: el simulador no ejecuta scripts</Badge>
        </Concept>
      </div>

      <Card title="¿Qué conviene excluir del control de versiones?">
        <table className="w-full text-xs">
          <tbody>
            {EXCLUDE.map(([p, d]) => (
              <tr key={p} className="border-t border-line first:border-0">
                <td className="px-3 py-1.5 font-mono text-gred">{p}</td>
                <td className="px-3 py-1.5 text-fg-2">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Callout tone="info">En el laboratorio tienes un proyecto Node recién inicializado con dependencias, builds, logs y un .env con contraseñas. Configúralo correctamente antes del primer commit.</Callout>
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <Workspace labId={LAB} views={['states', 'graph']} suggestions={['git status', 'git status --ignored', 'nano .gitignore', 'echo "node_modules/" >> .gitignore', 'mkdir -p assets/img && touch assets/img/.gitkeep', 'echo "* text=auto" > .gitattributes', 'git add .', 'git commit -m "chore: configuración del repositorio"']} />
        <LabTasks
          labId={LAB}
          tasks={[
            { id: 'nm', label: '.gitignore ignora node_modules/', test: (w) => { const r = repoAt(w); return !!r && computeStatus(w, r).ignored.some((p) => p.startsWith('node_modules/')); } },
            { id: 'env', label: '.gitignore ignora .env', test: (w) => { const r = repoAt(w); return !!r && computeStatus(w, r).ignored.includes('.env'); } },
            { id: 'logs', label: 'Se ignoran dist/ y los logs (*.log)', test: (w) => { const r = repoAt(w); if (!r) return false; const ig = computeStatus(w, r).ignored; return ig.some((p) => p.startsWith('dist/')) && ig.includes('debug.log') && ig.includes('logs/app.log'); } },
            { id: 'keep', label: 'Crea una carpeta vacía versionable con .gitkeep', test: (w) => Object.keys(w.fs.files).some((p) => p.startsWith('/home/estudiante/proyecto/') && p.endsWith('/.gitkeep')) },
            { id: 'attr', label: 'Añade un .gitattributes', test: (w) => workContent(w, '.gitattributes') !== undefined },
            { id: 'commit', label: 'Confirma .gitignore, .gitattributes y el código (sin secretos)', test: (w) => { const r = repoAt(w); return fileInHead(r, '.gitignore') && fileInHead(r, '.gitattributes') && fileInHead(r, 'src/index.js') && !fileInHead(r, '.env'); } },
          ]}
        />
      </div>
      <ModuleQuiz
        moduleId="archivos"
        questions={[
          {
            question: 'Añades config.json a .gitignore, pero git status sigue mostrándolo como modificado. ¿Por qué?',
            options: [
              { text: 'Porque ya estaba rastreado: .gitignore solo afecta a archivos no rastreados', correct: true, explanation: 'Usa git rm --cached config.json y confirma.' },
              { text: 'Porque .gitignore necesita reiniciar Git', correct: false, explanation: 'Se aplica al instante.' },
              { text: 'Porque el patrón está mal escrito', correct: false, explanation: 'Podría ser, pero aquí la causa es que ya se rastreaba.' },
            ],
          },
          {
            question: '¿Qué patrón ignora todos los archivos .log en cualquier carpeta?',
            options: [
              { text: '*.log', correct: true, explanation: 'Sin "/" el patrón se aplica en cualquier nivel.' },
              { text: '/*.log', correct: false, explanation: 'La "/" inicial lo limita a la raíz.' },
              { text: 'log/', correct: false, explanation: 'Eso ignoraría carpetas llamadas log.' },
            ],
          },
        ]}
      />
    </div>
  );
}
