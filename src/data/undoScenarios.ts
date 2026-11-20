/**
 * Escenarios de "me equivoqué": el estudiante comete (o hereda) un error y
 * debe recuperar el trabajo con el comando adecuado.
 */
import type { World } from '../engine/types';
import { finalize, run } from '../engine/world';
import { sampleRepo } from '../labs/presets';
import { type Check, commitCount, fileInHead, headContent, repoAt, stagedPaths, workContent } from '../labs/checks';
import { ancestors, computeStatus } from '../engine/repo';

export interface UndoScenario {
  id: string;
  title: string;
  story: string;
  setup: () => World;
  checks: Check[];
  hint: string;
  answer: string;
  why: string;
}

export const UNDO_SCENARIOS: UndoScenario[] = [
  {
    id: 'staged-by-mistake',
    title: 'Añadí un archivo al staging por error',
    story: 'Hiciste git add . y se coló credenciales.txt. Todavía no has hecho commit. Sácalo del staging sin borrarlo.',
    setup: () => finalize(run(sampleRepo(), ['echo "user=admin pass=1234" > credenciales.txt', 'echo "// nuevo" >> app.js', 'git add .'])),
    checks: [
      { id: 'out', label: 'credenciales.txt ya no está en staging', test: (w) => !stagedPaths(w, repoAt(w)).includes('credenciales.txt') },
      { id: 'disk', label: 'credenciales.txt sigue en el disco', test: (w) => workContent(w, 'credenciales.txt') !== undefined },
      { id: 'app', label: 'app.js sigue preparado', test: (w) => stagedPaths(w, repoAt(w)).includes('app.js') },
    ],
    hint: 'Hay una opción de git restore que actúa sobre el staging.',
    answer: 'git restore --staged credenciales.txt',
    why: 'restore --staged copia la versión de HEAD al índice para ese archivo (como no existía en HEAD, simplemente lo quita). El archivo en disco no se toca.',
  },
  {
    id: 'commit-extra',
    title: 'Confirmé un archivo que no debía (sin publicar)',
    story: 'Tu último commit incluye debug.log por error. No lo has subido. Rehaz el commit sin ese archivo, conservando el resto de cambios.',
    setup: () => finalize(run(sampleRepo(), ['echo "<footer>Tienda</footer>" >> index.html', 'echo "trazas" > debug.log', 'git add .', 'git commit -m "feat: pie de página"'])),
    checks: [
      { id: 'count', label: 'Sigue habiendo 2 commits', test: (w) => commitCount(repoAt(w)) === 2 },
      { id: 'nolog', label: 'El último commit no contiene debug.log', test: (w) => !fileInHead(repoAt(w), 'debug.log') && commitCount(repoAt(w)) === 2 },
      { id: 'footer', label: 'El último commit sí contiene el cambio de index.html', test: (w) => !!headContent(repoAt(w), 'index.html')?.includes('footer') },
      { id: 'disk', label: 'debug.log sigue en el disco', test: (w) => workContent(w, 'debug.log') !== undefined },
    ],
    hint: 'Retrocede la rama un commit conservando los cambios preparados, quita el archivo del staging y vuelve a confirmar.',
    answer: 'git reset --soft HEAD~1 → git restore --staged debug.log → git commit -m "feat: pie de página"',
    why: 'reset --soft mueve la rama pero deja el staging intacto. Así puedes rehacer el commit. (También valdría git rm --cached debug.log + git commit --amend.)',
  },
  {
    id: 'lost-commits',
    title: 'Ejecuté reset --hard y "perdí" commits',
    story: 'Querías deshacer un archivo y ejecutaste git reset --hard HEAD~2. Han desaparecido dos commits con trabajo valioso.',
    setup: () => finalize(run(sampleRepo(), ['echo "export const iva = 0.21;" > impuestos.js', 'git add .', 'git commit -m "feat: cálculo de IVA"', 'echo "export const envio = 5;" > envio.js', 'git add .', 'git commit -m "feat: gastos de envío"', 'git reset --hard HEAD~2'])),
    checks: [
      { id: 'back', label: 'main vuelve a contener "feat: gastos de envío"', test: (w) => { const r = repoAt(w); return !!r && [...ancestors(r.objects, r.heads.main)].some((s) => r.objects.commits[s].message === 'feat: gastos de envío'); } },
      { id: 'files', label: 'impuestos.js y envio.js vuelven a existir', test: (w) => workContent(w, 'impuestos.js') !== undefined && workContent(w, 'envio.js') !== undefined },
    ],
    hint: 'Los commits siguen existiendo; busca dónde estaba HEAD antes del reset.',
    answer: 'git reflog → git reset --hard HEAD@{1}',
    why: 'El reflog registra cada movimiento de HEAD. HEAD@{1} es la posición anterior al reset.',
  },
  {
    id: 'published-bug',
    title: 'Un commit publicado rompió la aplicación',
    story: 'El commit "refactor: cambia la lista de productos" ya está en el remoto y en los equipos de tus compañeros. Hay que deshacerlo sin reescribir la historia.',
    setup: () => finalize(run(sampleRepo(), ["echo \"const productos = null; // ¡rompe la app!\" > app.js", 'git commit -am "refactor: cambia la lista de productos"', 'echo "## Changelog" >> README.md', 'git commit -am "docs: changelog"'])),
    checks: [
      { id: 'history', label: 'El commit problemático sigue en la historia', test: (w) => { const r = repoAt(w); return !!r && [...ancestors(r.objects, r.heads.main)].some((s) => r.objects.commits[s].message.startsWith('refactor: cambia')); } },
      { id: 'fixed', label: 'app.js vuelve a tener la lista de productos', test: (w) => !!headContent(repoAt(w), 'app.js')?.includes("'Camiseta'") },
      { id: 'docs', label: 'El commit de docs posterior se conserva', test: (w) => !!headContent(repoAt(w), 'README.md')?.includes('Changelog') },
    ],
    hint: 'Necesitas un commit nuevo que haga lo contrario del commit problemático (que no es el último).',
    answer: 'git log --oneline → git revert HEAD~1 --no-edit',
    why: 'revert deshace un commit concreto (aunque no sea el último) añadiendo un commit inverso. reset habría borrado también el commit de docs.',
  },
  {
    id: 'deleted-file',
    title: 'Borré un archivo confirmado',
    story: 'Ejecutaste rm styles.css por accidente. Recupera el archivo tal como estaba en el último commit.',
    setup: () => finalize(run(sampleRepo(), ['rm styles.css'])),
    checks: [{ id: 'back', label: 'styles.css vuelve a existir con su contenido', test: (w) => workContent(w, 'styles.css') === headContent(repoAt(w), 'styles.css') }],
    hint: 'Git tiene una copia en el staging y en el último commit.',
    answer: 'git restore styles.css',
    why: 'Como el archivo estaba rastreado, Git puede restaurarlo desde el índice.',
  },
  {
    id: 'temp-files',
    title: 'Mi carpeta está llena de archivos temporales',
    story: 'Una herramienta generó tmp1.txt, tmp2.txt y la carpeta cache/. No están rastreados y quieres borrarlos sin tocar nada más (notas-importantes.md también es nuevo y debe quedarse).',
    setup: () => finalize(run(sampleRepo(), ['echo x > tmp1.txt', 'echo y > tmp2.txt', 'mkdir cache', 'echo z > cache/data.bin', 'echo "no borrar" > notas-importantes.md'])),
    checks: [
      { id: 'gone', label: 'tmp1.txt, tmp2.txt y cache/ eliminados', test: (w) => ['tmp1.txt', 'tmp2.txt', 'cache/data.bin'].every((p) => workContent(w, p) === undefined) },
      { id: 'keep', label: 'notas-importantes.md se conserva', test: (w) => workContent(w, 'notas-importantes.md') !== undefined },
      { id: 'tracked', label: 'Los archivos rastreados están intactos', test: (w) => { const r = repoAt(w); return !!r && !computeStatus(w, r).unstaged.length; } },
    ],
    hint: 'git clean acepta rutas concretas. Previsualiza siempre con -n.',
    answer: 'git clean -n → git clean -f tmp1.txt tmp2.txt → git clean -fd cache  (o rm)',
    why: 'git clean solo borra archivos sin rastrear. Sin rutas borraría también notas-importantes.md: por eso conviene previsualizar con -n.',
  },
];

export function undoScenarioById(id: string) {
  return UNDO_SCENARIOS.find((s) => s.id === id);
}
