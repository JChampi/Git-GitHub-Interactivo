/**
 * Lecciones del modo guiado: instrucciones paso a paso validadas sobre el
 * estado real del repositorio simulado.
 */
import type { CommandRecord, World } from '../engine/types';
import { computeStatus, currentBranch, findRepo, headSha } from '../engine/repo';
import { getServer, serverCommit } from '../engine/server';
import { TEAM } from '../engine/world';
import { branchesWorld, emptyProject, undoWorld, historyWorld } from '../labs/presets';
import { commitCount, fileInHead, isMerged, repoAt, stagedPaths, used, usedArg, workContent, headContent } from '../labs/checks';

export interface GuidedStep {
  title: string;
  instruction: string;
  /** Valida con el mundo y los comandos ejecutados DESDE que empezó el paso. */
  validate: (w: World, log: CommandRecord[]) => boolean;
  hints: string[];
  explanation: string;
  /** Acción automática al entrar en el paso (p. ej. un compañero sube cambios). */
  onEnter?: (w: World) => string | null;
}

export interface Quiz {
  question: string;
  options: { text: string; correct: boolean; explanation: string }[];
}

export interface GuidedLesson {
  id: string;
  title: string;
  description: string;
  level: string;
  duration: string;
  setup: () => World;
  steps: GuidedStep[];
  quiz: Quiz;
  xp: number;
}

const ok = (log: CommandRecord[], cmd: string) => used(log, cmd, true);

export const GUIDED: GuidedLesson[] = [
  {
    id: 'g-first-repo',
    title: 'Tu primer repositorio',
    description: 'Crea un repositorio Git, agrega un archivo y registra el primer commit.',
    level: 'Principiante',
    duration: '5 min',
    setup: () => emptyProject(),
    xp: 40,
    steps: [
      {
        title: 'Inicializa un repositorio',
        instruction: 'Convierte la carpeta actual (~/proyecto) en un repositorio Git.',
        validate: (w) => !!repoAt(w),
        hints: ['Necesitas un subcomando de git que "inicia" el repositorio.', 'El comando es git init.'],
        explanation: 'git init creó la carpeta oculta .git: ahí Git guarda commits, ramas y configuración. Tus archivos siguen donde estaban.',
      },
      {
        title: 'Consulta el estado actual',
        instruction: 'Pregúntale a Git en qué estado está el repositorio.',
        validate: (_w, log) => ok(log, 'git status'),
        hints: ['Hay un comando que muestra rama actual, cambios preparados y archivos sin rastrear.', 'Prueba git status.'],
        explanation: 'git status es tu brújula: indica la rama (main), que aún no hay commits ("No commits yet") y qué archivos han cambiado. Úsalo constantemente.',
      },
      {
        title: 'Crea un archivo README.md',
        instruction: 'Crea README.md con un título. Puedes usar la terminal o el botón "Nuevo archivo" del explorador.',
        validate: (w) => !!workContent(w, 'README.md')?.trim(),
        hints: ['En bash, echo "texto" > archivo escribe texto en un archivo.', 'echo "# Mi primer proyecto" > README.md'],
        explanation: 'El archivo existe en el working directory, pero Git todavía no lo rastrea: es "untracked".',
      },
      {
        title: 'Agrega el archivo al staging area',
        instruction: 'Prepara README.md para incluirlo en el próximo commit.',
        validate: (w) => stagedPaths(w, repoAt(w)).includes('README.md'),
        hints: ['El staging area es la "zona de preparación". ¿Qué comando añade a ella?', 'git add README.md'],
        explanation: 'git add copió el contenido actual de README.md al staging area (índice). Si modificas el archivo ahora, tendrías que volver a añadirlo.',
      },
      {
        title: 'Comprueba nuevamente el estado',
        instruction: 'Verifica cómo cambió el estado tras preparar el archivo.',
        validate: (_w, log) => ok(log, 'git status'),
        hints: ['El mismo comando del paso 2.'],
        explanation: 'Ahora README.md aparece en verde bajo "Changes to be committed": está listo para el commit.',
      },
      {
        title: 'Realiza tu primer commit',
        instruction: 'Registra los cambios preparados con un mensaje descriptivo.',
        validate: (w) => fileInHead(repoAt(w), 'README.md'),
        hints: ['git commit necesita un mensaje. ¿Con qué opción se indica?', 'git commit -m "docs: añade README"'],
        explanation: 'El commit es una instantánea permanente con autor, fecha, mensaje y un identificador SHA único. Tu rama main ya existe y apunta a él.',
      },
      {
        title: 'Consulta el historial',
        instruction: 'Muestra la lista de commits del repositorio.',
        validate: (_w, log) => ok(log, 'git log'),
        hints: ['Busca el comando que muestra el "registro" (log) de commits.', 'git log o git log --oneline'],
        explanation: 'git log muestra los commits del más reciente al más antiguo. (HEAD -> main) indica que estás en main y que main apunta a ese commit.',
      },
    ],
    quiz: {
      question: 'Modificas README.md después de hacer git add, y haces git commit sin volver a añadirlo. ¿Qué se guarda?',
      options: [
        { text: 'La versión que estaba en el staging (la de cuando hiciste git add)', correct: true, explanation: 'Correcto: el commit guarda el contenido del staging area, no el del working directory.' },
        { text: 'La versión más reciente del archivo', correct: false, explanation: 'No: los cambios posteriores a git add no están preparados. Habría que volver a hacer git add (o usar git commit -a).' },
        { text: 'Nada, git commit falla', correct: false, explanation: 'El commit funciona: hay cambios en staging. Simplemente no incluye la última modificación.' },
      ],
    },
  },
  {
    id: 'g-branches',
    title: 'Trabajar con ramas',
    description: 'Crea una rama, haz commits aislados, fusiónala en main y límpiala.',
    level: 'Básico',
    duration: '8 min',
    setup: () => branchesWorld(),
    xp: 50,
    steps: [
      {
        title: 'Lista las ramas',
        instruction: 'Muestra las ramas que existen y cuál es la actual.',
        validate: (_w, log) => ok(log, 'git branch'),
        hints: ['El comando se llama igual que el concepto, en inglés.', 'git branch'],
        explanation: 'Solo existe main. El asterisco (*) marca la rama actual, a la que apunta HEAD.',
      },
      {
        title: 'Crea la rama feature/saludo y cámbiate a ella',
        instruction: 'Crea una rama nueva para trabajar en un saludo, y sitúate en ella.',
        validate: (w) => { const r = repoAt(w); return !!r && currentBranch(r) === 'feature/saludo'; },
        hints: ['git switch tiene una opción para crear y cambiar a la vez.', 'git switch -c feature/saludo'],
        explanation: 'La rama nueva apunta al mismo commit que main. HEAD se movió a feature/saludo: los próximos commits irán ahí.',
      },
      {
        title: 'Haz un commit en la rama',
        instruction: 'Crea saludo.js con cualquier contenido y confírmalo.',
        validate: (w) => fileInHead(repoAt(w), 'saludo.js', 'feature/saludo'),
        hints: ['Crea el archivo (echo o el explorador), luego git add y git commit.', 'echo "console.log(\'hola\')" > saludo.js && git add saludo.js && git commit -m "feat: saludo"'],
        explanation: 'feature/saludo avanzó un commit; main sigue en el commit anterior. Mira el grafo: las ramas son punteros.',
      },
      {
        title: 'Visualiza el historial de todas las ramas',
        instruction: 'Muestra el historial en forma de grafo, incluyendo todas las ramas, en una línea por commit.',
        validate: (_w, log) => usedArg(log, 'git log', '--graph') || usedArg(log, 'git log', '--all'),
        hints: ['git log admite opciones para mostrar un grafo, todas las ramas y formato compacto.', 'git log --oneline --graph --all'],
        explanation: 'Verás (HEAD -> feature/saludo) en el último commit y main un commit por detrás.',
      },
      {
        title: 'Vuelve a main',
        instruction: 'Cámbiate a la rama principal. Observa que saludo.js desaparece del explorador.',
        validate: (w) => { const r = repoAt(w); return !!r && currentBranch(r) === 'main'; },
        hints: ['git switch <rama>'],
        explanation: 'Al cambiar de rama, Git actualiza el working directory al contenido de esa rama. saludo.js no se perdió: sigue en feature/saludo.',
      },
      {
        title: 'Fusiona feature/saludo en main',
        instruction: 'Integra los cambios de la rama de funcionalidad en main.',
        validate: (w) => isMerged(repoAt(w), 'feature/saludo', 'main'),
        hints: ['Estando en main, el comando trae los cambios de otra rama.', 'git merge feature/saludo'],
        explanation: 'Como main no tenía commits nuevos, Git hizo un "fast-forward": solo movió el puntero de main hacia delante.',
      },
      {
        title: 'Elimina la rama ya fusionada',
        instruction: 'Borra feature/saludo de forma segura (solo si está fusionada).',
        validate: (w) => !!repoAt(w) && !repoAt(w)!.heads['feature/saludo'],
        hints: ['git branch tiene una opción -d (delete).', 'git branch -d feature/saludo'],
        explanation: 'Borrar una rama fusionada no borra commits: solo el puntero. -d se niega si la rama tiene trabajo sin fusionar (-D lo fuerza).',
      },
    ],
    quiz: {
      question: '¿Qué es exactamente una rama en Git?',
      options: [
        { text: 'Un puntero móvil a un commit', correct: true, explanation: 'Exacto. Crear una rama es barato: Git solo guarda una referencia de 40 caracteres.' },
        { text: 'Una copia completa de todos los archivos del proyecto', correct: false, explanation: 'No: Git no duplica archivos al crear ramas. Por eso crearlas es instantáneo.' },
        { text: 'Una carpeta dentro del repositorio', correct: false, explanation: 'Las ramas no son carpetas: son referencias guardadas en .git/refs/heads.' },
      ],
    },
  },
  {
    id: 'g-undo',
    title: 'Deshacer errores sin miedo',
    description: 'Practica restore, restore --staged, reset --soft y revert en situaciones reales.',
    level: 'Intermedio',
    duration: '10 min',
    setup: () => undoWorld(),
    xp: 60,
    steps: [
      {
        title: 'Rompe un archivo (a propósito)',
        instruction: 'Modifica config.js para que DEBUG sea true. Puedes usar el editor o: echo "export const DEBUG = true;" > config.js',
        validate: (w) => !!workContent(w, 'config.js')?.includes('true'),
        hints: ['Abre config.js en el explorador y edítalo, o usa echo con >.'],
        explanation: 'config.js está modificado en el working directory, pero no preparado.',
      },
      {
        title: 'Mira exactamente qué cambió',
        instruction: 'Muestra las diferencias entre el working directory y el último estado preparado.',
        validate: (_w, log) => ok(log, 'git diff'),
        hints: ['El comando muestra líneas con - (eliminadas) y + (añadidas).', 'git diff'],
        explanation: 'git diff sin opciones compara working directory con staging. Es la mejor forma de revisar antes de deshacer o confirmar.',
      },
      {
        title: 'Descarta el cambio de config.js',
        instruction: 'Devuelve config.js a su última versión guardada.',
        validate: (w) => workContent(w, 'config.js') === headContent(repoAt(w), 'config.js'),
        hints: ['El comando moderno para "restaurar" archivos.', 'git restore config.js — ¡el cambio se pierde para siempre!'],
        explanation: 'git restore sobrescribió el archivo con la versión del staging. Esto es destructivo: por eso el laboratorio te pidió confirmación.',
      },
      {
        title: 'Prepara un archivo por error',
        instruction: 'Crea secreto.txt y añádelo al staging area.',
        validate: (w) => stagedPaths(w, repoAt(w)).includes('secreto.txt'),
        hints: ['echo "contraseña" > secreto.txt && git add secreto.txt'],
        explanation: 'secreto.txt está preparado. ¡No queremos que entre en el próximo commit!',
      },
      {
        title: 'Sácalo del staging sin borrarlo',
        instruction: 'Quita secreto.txt del staging area, conservando el archivo en disco.',
        validate: (w) => !stagedPaths(w, repoAt(w)).includes('secreto.txt') && workContent(w, 'secreto.txt') !== undefined,
        hints: ['git restore tiene una opción para el staging area.', 'git restore --staged secreto.txt'],
        explanation: 'El archivo sigue existiendo, ahora como "untracked". restore --staged solo toca el índice.',
      },
      {
        title: 'Deshaz el último commit conservando los cambios',
        instruction: 'El último commit ("función restar") tiene un bug. Deshazlo pero mantén sus cambios preparados para corregirlos.',
        validate: (w) => commitCount(repoAt(w)) === 2 && stagedPaths(w, repoAt(w)).includes('resta.js'),
        hints: ['git reset mueve la rama hacia atrás. Hay tres modos: --soft, --mixed y --hard.', '--soft conserva los cambios en staging: git reset --soft HEAD~1'],
        explanation: 'La rama retrocedió un commit, pero sus cambios siguen preparados. Ideal para rehacer un commit local que aún no has compartido.',
      },
      {
        title: 'Rehaz el commit corrigiendo el bug',
        instruction: 'Corrige resta.js para que restar use "a - b" y vuelve a confirmar.',
        validate: (w) => !!headContent(repoAt(w), 'resta.js')?.includes('a - b') && commitCount(repoAt(w)) === 3,
        hints: ['Edita resta.js en el editor o reescríbelo con echo.', 'echo "export function restar(a, b) { return a - b; }" > resta.js && git add resta.js && git commit -m "feat: función restar"'],
        explanation: 'Has reescrito tu historia LOCAL de forma segura. Si el commit ya estuviera publicado, lo correcto sería git revert.',
      },
      {
        title: 'Revierte un commit sin reescribir la historia',
        instruction: 'Imagina que "feat: función sumar" ya está publicado y hay que deshacerlo. Revierte ese commit con un commit nuevo.',
        validate: (w) => { const r = repoAt(w); return !!r && /^Revert "feat: función sumar"/.test(r.objects.commits[headSha(r) ?? '']?.message ?? '') ; },
        hints: ['git revert necesita el commit a deshacer. Búscalo con git log --oneline.', 'Es el penúltimo commit: git revert HEAD~1 --no-edit'],
        explanation: 'revert creó un commit nuevo que aplica lo contrario. El historial original queda intacto: es la forma segura en ramas compartidas.',
      },
    ],
    quiz: {
      question: 'Ya subiste a GitHub un commit con un error y tus compañeros lo descargaron. ¿Qué usas?',
      options: [
        { text: 'git revert <commit>', correct: true, explanation: 'Sí: revert añade un commit inverso sin reescribir la historia compartida.' },
        { text: 'git reset --hard HEAD~1 y git push --force', correct: false, explanation: 'Peligroso: reescribe la historia remota y rompe los clones de tus compañeros.' },
        { text: 'git restore <archivo>', correct: false, explanation: 'restore solo afecta a archivos de tu working directory o staging, no deshace commits.' },
      ],
    },
  },
  {
    id: 'g-remote',
    title: 'Publicar en GitHub',
    description: 'Conecta tu repositorio con GitHub, publica tu rama y sincroniza cambios del equipo.',
    level: 'Intermedio',
    duration: '10 min',
    setup: () => {
      const w = branchesWorld();
      return w;
    },
    xp: 60,
    steps: [
      {
        title: 'Crea el repositorio en GitHub',
        instruction: 'Crea un repositorio vacío llamado "proyecto" en tu cuenta simulada (pestaña GitHub → Nuevo repositorio, o: gh repo create proyecto --public).',
        validate: (w) => !!getServer(w, 'https://github.com/estudiante/proyecto.git'),
        hints: ['Usa la pestaña "GitHub" del laboratorio o la CLI gh.', 'gh repo create proyecto --public'],
        explanation: 'Ahora existe un repositorio remoto vacío. Es solo un lugar en el servidor: tu repositorio local todavía no sabe que existe.',
      },
      {
        title: 'Conecta el remoto origin',
        instruction: 'Registra la URL https://github.com/estudiante/proyecto.git con el nombre origin.',
        validate: (w) => !!findRepo(w)?.remotes['origin'],
        hints: ['git remote add <nombre> <url>', 'git remote add origin https://github.com/estudiante/proyecto.git'],
        explanation: '"origin" es solo un alias para la URL. Compruébalo con git remote -v.',
      },
      {
        title: 'Publica main y configura el seguimiento',
        instruction: 'Sube la rama main al remoto y enlázala para futuros push/pull.',
        validate: (w) => { const r = findRepo(w); return !!r?.upstream['main'] && !!getServer(w, 'https://github.com/estudiante/proyecto.git')?.heads['main']; },
        hints: ['git push necesita el remoto y la rama. La opción -u guarda el enlace (upstream).', 'git push -u origin main'],
        explanation: 'main existe ahora en GitHub y tu rama local "sigue" a origin/main: git status te dirá si vas por delante o por detrás.',
      },
      {
        title: 'Un compañero sube cambios',
        instruction: 'Laura acaba de subir un commit a GitHub. Descarga la información del remoto SIN modificar tu rama.',
        onEnter: (w) => {
          const s = getServer(w, 'https://github.com/estudiante/proyecto.git');
          if (!s || !s.heads.main) return null;
          serverCommit(w, s, { branch: 'main', author: TEAM.lead, message: 'docs: añade guía de contribución', changes: { 'CONTRIBUTING.md': '# Cómo contribuir\n\nAbre un Pull Request.\n' } });
          return 'Laura (desarrolladora principal) subió "docs: añade guía de contribución" a origin/main.';
        },
        validate: (_w, log) => ok(log, 'git fetch'),
        hints: ['Hay un comando que solo descarga (no integra).', 'git fetch'],
        explanation: 'fetch actualizó origin/main pero tu main sigue igual. Ejecuta git status: verás "Your branch is behind".',
      },
      {
        title: 'Integra los cambios remotos',
        instruction: 'Trae el commit de Laura a tu rama main.',
        validate: (w) => workContent(w, 'CONTRIBUTING.md') !== undefined,
        hints: ['Puedes usar git merge origin/main o el atajo que hace fetch + merge.', 'git pull'],
        explanation: 'Tu main avanzó hasta origin/main (fast-forward) y CONTRIBUTING.md apareció en tu carpeta.',
      },
      {
        title: 'Publica un cambio tuyo',
        instruction: 'Haz un commit cualquiera y súbelo a GitHub.',
        validate: (w) => { const r = findRepo(w); const s = getServer(w, 'https://github.com/estudiante/proyecto.git'); return !!r && !!s && s.heads.main === r.heads.main && commitCount(r) >= 4; },
        hints: ['Edita un archivo, git commit -am "mensaje" y git push (ya no necesitas -u).'],
        explanation: 'Como main ya sigue a origin/main, basta con git push. Ese es el ciclo diario: pull → trabajar → commit → push.',
      },
    ],
    quiz: {
      question: '¿Cuál es la diferencia entre git fetch y git pull?',
      options: [
        { text: 'fetch solo descarga y actualiza origin/*; pull además integra (merge o rebase) en tu rama', correct: true, explanation: 'Exacto: pull = fetch + merge (o rebase).' },
        { text: 'Son sinónimos', correct: false, explanation: 'No: fetch nunca modifica tus ramas ni tus archivos.' },
        { text: 'fetch sube cambios y pull los descarga', correct: false, explanation: 'Para subir se usa git push. Ambos, fetch y pull, descargan.' },
      ],
    },
  },
  {
    id: 'g-history',
    title: 'Investigar el historial',
    description: 'Aprende a leer el historial: autores, fechas, SHA y diferencias entre commits.',
    level: 'Básico',
    duration: '6 min',
    setup: () => historyWorld(),
    xp: 40,
    steps: [
      {
        title: 'Historial compacto',
        instruction: 'Muestra el historial con un commit por línea.',
        validate: (_w, log) => usedArg(log, 'git log', '--oneline'),
        hints: ['git log tiene una opción para "una línea".', 'git log --oneline'],
        explanation: 'Cada línea muestra el SHA abreviado (7 caracteres) y la primera línea del mensaje.',
      },
      {
        title: 'Commits de una persona',
        instruction: 'Muestra solo los commits de Ana.',
        validate: (_w, log) => usedArg(log, 'git log', /^--author/),
        hints: ['git log --author="nombre" filtra por autor.', 'git log --author=Ana'],
        explanation: 'Los filtros de log son muy útiles en proyectos grandes: --author, --grep, -n, -- archivo...',
      },
      {
        title: 'Inspecciona un commit',
        instruction: 'Muestra el detalle (autor, fecha y cambios) del commit anterior al último.',
        validate: (_w, log) => log.some((r) => r.command === 'git show' && r.ok && r.argv.some((a) => /HEAD[~^]|^[0-9a-f]{4,}$/.test(a))),
        hints: ['git show <commit>. Puedes referirte al penúltimo como HEAD~1.', 'git show HEAD~1'],
        explanation: 'git show muestra la cabecera del commit y su diff respecto al padre. HEAD~1 significa "el padre de HEAD".',
      },
      {
        title: 'Compara dos commits',
        instruction: 'Muestra las diferencias entre la etiqueta v0.1.0 y el commit actual.',
        validate: (_w, log) => log.some((r) => r.command === 'git diff' && r.ok && r.argv.some((a) => a.includes('v0.1.0'))),
        hints: ['git diff acepta dos referencias: git diff A B', 'git diff v0.1.0 HEAD'],
        explanation: 'Las etiquetas (tags) marcan versiones. Comparar etiquetas es la base para escribir notas de versión.',
      },
      {
        title: 'Descubre quién cambió index.html',
        instruction: 'Muestra el historial solo del archivo index.html.',
        validate: (_w, log) => log.some((r) => r.command === 'git log' && r.ok && r.argv.includes('index.html')),
        hints: ['Después de "--" puedes indicar rutas: git log -- archivo', 'git log --oneline -- index.html'],
        explanation: 'Filtrar el historial por archivo te dice cuándo y por qué cambió, sin ruido.',
      },
    ],
    quiz: {
      question: '¿Qué identifica de forma única a un commit?',
      options: [
        { text: 'Su hash SHA, calculado a partir de su contenido, padres, autor y fecha', correct: true, explanation: 'Correcto: si cambia cualquier dato, cambia el SHA. Por eso --amend o rebase crean commits nuevos.' },
        { text: 'Su mensaje', correct: false, explanation: 'Dos commits pueden tener el mismo mensaje.' },
        { text: 'Un número secuencial (1, 2, 3…)', correct: false, explanation: 'Git no numera commits: usa hashes, lo que permite trabajar de forma distribuida.' },
      ],
    },
  },
];

export function guidedById(id: string) {
  return GUIDED.find((g) => g.id === id);
}

export { computeStatus };
