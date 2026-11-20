/**
 * Evaluaciones prácticas: el estudiante recibe un objetivo (sin comandos) y
 * se evalúa el estado final, la seguridad de las operaciones y la comprensión.
 */
import type { CommandRecord, World } from '../engine/types';
import { getServer, reviewPullRequest } from '../engine/server';
import { ancestors, computeStatus, getCommit, headSha } from '../engine/repo';
import { hasConflictMarkers } from '../engine/merge';
import { createWorld, finalize, run, writeFiles, TEAM, HOME } from '../engine/world';
import { join } from '../engine/vfs';
import { conflictWorld, githubWorld, P, remoteWorld, REMOTE, sampleFilesOnly, sampleRepo } from '../labs/presets';
import { serverCommit } from '../engine/server';
import { type Check, cleanTree, commitCount, fileInHead, headContent, isMerged, repoAt, unstagedPaths, workContent } from '../labs/checks';
import type { Quiz } from './guided';

export const EVAL_CATEGORIES = [
  { id: 'fundamentos', name: 'Fundamentos' },
  { id: 'repos', name: 'Administración de repositorios' },
  { id: 'commits', name: 'Commits e historial' },
  { id: 'ramas', name: 'Gestión de ramas' },
  { id: 'recuperacion', name: 'Recuperación de cambios' },
  { id: 'remotos', name: 'Repositorios remotos' },
  { id: 'github', name: 'GitHub' },
  { id: 'colaboracion', name: 'Colaboración' },
  { id: 'conflictos', name: 'Resolución de conflictos' },
  { id: 'workflows', name: 'Workflows profesionales' },
] as const;

export type EvalCategory = (typeof EVAL_CATEGORIES)[number]['id'];

export interface Penalty {
  label: string;
  points: number;
  test: (log: CommandRecord[], w: World) => boolean;
}

export interface Evaluation {
  id: string;
  category: EvalCategory;
  title: string;
  situation: string;
  setup: () => World;
  goals: Check[];
  penalties: Penalty[];
  optimal: number;
  question: Quiz;
  xp: number;
  automate?: (w: World) => boolean;
  github?: string;
}

const has = (log: CommandRecord[], cmd: string, pred?: (argv: string[]) => boolean) => log.some((r) => r.command === cmd && r.ok && (!pred || pred(r.argv)));
const HARD_RESET: Penalty = { label: 'Usaste git reset --hard (operación destructiva innecesaria)', points: 10, test: (l) => has(l, 'git reset', (a) => a.includes('--hard')) };
const FORCE_PUSH: Penalty = { label: 'Usaste git push --force (reescribe la historia compartida)', points: 15, test: (l) => has(l, 'git push', (a) => a.some((x) => x === '-f' || x === '--force')) };
const CLEAN: Penalty = { label: 'Usaste git clean (borró archivos sin rastrear)', points: 10, test: (l) => has(l, 'git clean', (a) => a.some((x) => /^-[a-z]*f/.test(x))) };
const TIENDA = join(HOME, 'tienda-web');

export const EVALUATIONS: Evaluation[] = [
  {
    id: 'e-fund-states',
    category: 'fundamentos',
    title: 'Del working directory al repositorio',
    situation: 'Tienes una carpeta con el código de una tienda que nunca se ha versionado. Quieres que TODOS sus archivos queden registrados en el historial en un único punto de partida.',
    setup: () => sampleFilesOnly(),
    goals: [
      { id: 'repo', label: 'La carpeta es un repositorio Git', test: (w) => !!repoAt(w) },
      { id: 'all', label: 'Los 4 archivos están en el último commit', test: (w) => ['README.md', 'index.html', 'styles.css', 'app.js'].every((f) => fileInHead(repoAt(w), f)) },
      { id: 'one', label: 'Existe exactamente un commit', test: (w) => commitCount(repoAt(w)) === 1 },
      { id: 'clean', label: 'No quedan cambios pendientes', test: (w) => cleanTree(w, repoAt(w)) && !computeStatus(w, repoAt(w)!).untracked.length },
    ],
    penalties: [],
    optimal: 3,
    question: {
      question: '¿En qué orden pasa un cambio por las tres áreas de Git?',
      options: [
        { text: 'Working directory → Staging area → Repositorio', correct: true, explanation: 'Editas en el working directory, preparas con git add y confirmas con git commit.' },
        { text: 'Staging area → Working directory → Repositorio', correct: false, explanation: 'El staging recibe los cambios DESDE el working directory.' },
        { text: 'Repositorio → Staging area → Working directory', correct: false, explanation: 'Ese es el sentido de restaurar (checkout/restore), no de guardar.' },
      ],
    },
    xp: 30,
  },
  {
    id: 'e-repos-untrack',
    category: 'repos',
    title: 'Deja de rastrear un archivo sensible',
    situation: 'Por error confirmaste config.local.json (con tus credenciales locales). Debe seguir en tu disco, pero Git tiene que dejar de rastrearlo y no volver a incluirlo nunca.',
    setup: () => {
      let w = sampleRepo();
      w = run(w, ['echo \'{ "token": "abc123" }\' > config.local.json', 'git add .', 'git commit -m "chore: configuración"']);
      return finalize(w);
    },
    goals: [
      { id: 'disk', label: 'config.local.json sigue en el disco', test: (w) => workContent(w, 'config.local.json') !== undefined },
      { id: 'untracked', label: 'El último commit ya no contiene config.local.json', test: (w) => !fileInHead(repoAt(w), 'config.local.json') && commitCount(repoAt(w)) >= 3 },
      { id: 'ignored', label: '.gitignore (confirmado) lo ignora', test: (w) => { const r = repoAt(w); return !!r && fileInHead(r, '.gitignore') && computeStatus(w, r).ignored.includes('config.local.json'); } },
    ],
    penalties: [{ label: 'Borraste el archivo del disco con rm o git rm sin --cached', points: 15, test: (l) => l.some((r) => (r.command === 'rm' || (r.command === 'git rm' && !r.argv.includes('--cached'))) && r.argv.some((a) => a.includes('config.local'))) }],
    optimal: 4,
    question: {
      question: '¿Qué hace git rm --cached archivo?',
      options: [
        { text: 'Lo quita del índice (deja de rastrearse) pero lo conserva en disco', correct: true, explanation: 'Correcto. Combínalo con .gitignore para que no vuelva a añadirse.' },
        { text: 'Lo borra del disco y del historial', correct: false, explanation: 'No borra del disco ni del historial: los commits antiguos siguen conteniéndolo.' },
        { text: 'Lo guarda en caché para el próximo commit', correct: false, explanation: '"cached" se refiere al índice (staging area).' },
      ],
    },
    xp: 40,
  },
  {
    id: 'e-commits-atomic',
    category: 'commits',
    title: 'Commits atómicos',
    situation: 'Has hecho dos cambios no relacionados: corregiste un bug en app.js y mejoraste la documentación en README.md. El equipo exige un commit por cambio lógico y Conventional Commits.',
    setup: () => {
      let w = sampleRepo();
      w = run(w, ["echo \"console.log('bug corregido');\" >> app.js", 'echo "## Instalación" >> README.md']);
      return finalize(w);
    },
    goals: [
      { id: 'two', label: 'Se crearon dos commits nuevos', test: (w) => commitCount(repoAt(w)) === 3 },
      {
        id: 'separate',
        label: 'Cada commit modifica un solo archivo',
        test: (w) => {
          const r = repoAt(w);
          if (!r || commitCount(r) < 3) return false;
          let sha = headSha(r)!;
          for (let i = 0; i < 2; i++) {
            const c = getCommit(r, sha);
            const p = getCommit(r, c.parents[0]).tree;
            const changed = [...new Set([...Object.keys(p), ...Object.keys(c.tree)])].filter((k) => p[k] !== c.tree[k]);
            if (changed.length !== 1) return false;
            sha = c.parents[0];
          }
          return true;
        },
      },
      {
        id: 'conventional',
        label: 'Los mensajes usan fix: y docs:',
        test: (w) => {
          const r = repoAt(w);
          if (!r || commitCount(r) < 3) return false;
          const h = getCommit(r, headSha(r)!);
          const msgs = [h.message, getCommit(r, h.parents[0]).message];
          return msgs.some((m) => /^fix(\(.+\))?: /.test(m)) && msgs.some((m) => /^docs(\(.+\))?: /.test(m));
        },
      },
    ],
    penalties: [{ label: 'Usaste git commit -a o git add . (mezcla cambios)', points: 5, test: (l) => has(l, 'git commit', (a) => a.some((x) => /^-[a-z]*a/.test(x))) }],
    optimal: 4,
    question: {
      question: '¿Por qué conviene separar cambios no relacionados en commits distintos?',
      options: [
        { text: 'Facilita revisar, entender y revertir cada cambio por separado', correct: true, explanation: 'Un commit atómico se puede revertir o cherry-pickear sin arrastrar otros cambios.' },
        { text: 'Porque Git no admite commits con varios archivos', correct: false, explanation: 'Git admite cualquier número de archivos por commit.' },
        { text: 'Para tener más commits y parecer más productivo', correct: false, explanation: 'La cantidad no importa: importa que cada commit tenga un propósito claro.' },
      ],
    },
    xp: 40,
  },
  {
    id: 'e-branch-fix',
    category: 'ramas',
    title: 'Corrección en una rama propia',
    situation: 'Hay un error en el título de index.html ("Bienvenido" debe ser "Bienvenida"). La política del equipo: las correcciones se hacen en una rama fix/..., se integran en main y la rama se elimina al terminar.',
    setup: () => finalize(sampleRepo()),
    goals: [
      { id: 'fixed', label: 'main contiene la corrección', test: (w) => !!headContent(repoAt(w), 'index.html', 'main')?.includes('Bienvenida a Mi Tienda') },
      { id: 'via-branch', label: 'La corrección se hizo en un commit fuera de main (rama fix/...)', test: (_w, l) => l.some((r) => (r.command === 'git switch' || r.command === 'git checkout' || r.command === 'git branch') && r.ok && r.argv.some((a) => a.startsWith('fix/'))) },
      { id: 'deleted', label: 'La rama fix/... ya no existe', test: (w) => { const r = repoAt(w); return !!r && !Object.keys(r.heads).some((b) => b.startsWith('fix/')); } },
      { id: 'onmain', label: 'Terminas en main con el working directory limpio', test: (w) => { const r = repoAt(w); return !!r && r.head.kind === 'branch' && r.head.name === 'main' && cleanTree(w, r); } },
    ],
    penalties: [{ label: 'Borraste la rama con -D (forzado) sin necesidad', points: 5, test: (l) => has(l, 'git branch', (a) => a.includes('-D')) }],
    optimal: 6,
    question: {
      question: 'Tras fusionar fix/titulo en main, ejecutas git branch -d fix/titulo. ¿Qué se pierde?',
      options: [
        { text: 'Nada: solo se elimina el puntero; los commits siguen en main', correct: true, explanation: 'Exacto. -d solo deja borrar ramas ya fusionadas.' },
        { text: 'Los commits de la corrección', correct: false, explanation: 'Los commits están en main gracias al merge.' },
        { text: 'El archivo index.html', correct: false, explanation: 'Borrar una rama no toca el working directory.' },
      ],
    },
    xp: 40,
  },
  {
    id: 'e-recovery-discard',
    category: 'recuperacion',
    title: 'Recuperación de cambios',
    situation: 'Modificaste app.js, pero quieres descartar los cambios que todavía no has confirmado. Debes conservar los demás archivos del repositorio: también tienes cambios en styles.css que SÍ quieres mantener y unas notas sin rastrear.',
    setup: () => {
      let w = sampleRepo();
      w = run(w, ['echo "// experimento fallido" >> app.js', 'echo "p { line-height: 1.6; }" >> styles.css', 'echo "pendientes" > notas.txt']);
      return finalize(w);
    },
    goals: [
      { id: 'app', label: 'app.js vuelve a la versión del último commit', test: (w) => workContent(w, 'app.js') === headContent(repoAt(w), 'app.js') },
      { id: 'styles', label: 'styles.css conserva su cambio', test: (w) => !!workContent(w, 'styles.css')?.includes('line-height') },
      { id: 'notes', label: 'notas.txt sigue existiendo', test: (w) => workContent(w, 'notas.txt') !== undefined },
      { id: 'nocommit', label: 'No se crearon commits', test: (w) => commitCount(repoAt(w)) === 1 },
    ],
    penalties: [HARD_RESET, CLEAN, { label: 'Restauraste todos los archivos (git restore . / checkout .)', points: 10, test: (l) => l.some((r) => (r.command === 'git restore' || r.command === 'git checkout') && r.argv.includes('.')) }],
    optimal: 2,
    question: {
      question: '¿Por qué git reset --hard no era adecuado aquí?',
      options: [
        { text: 'Porque descarta TODOS los cambios de archivos rastreados, incluido styles.css', correct: true, explanation: 'reset --hard afecta a todo el working directory; restore permite elegir archivos.' },
        { text: 'Porque borra los archivos sin rastrear', correct: false, explanation: 'reset --hard NO toca archivos untracked (eso lo hace git clean).' },
        { text: 'Porque elimina el último commit', correct: false, explanation: 'Sin argumento, reset --hard se queda en HEAD: no elimina commits.' },
      ],
    },
    xp: 40,
  },
  {
    id: 'e-recovery-deleted',
    category: 'recuperacion',
    title: 'Archivo borrado por accidente',
    situation: 'Ejecutaste "rm README.md" sin querer. El archivo estaba confirmado en el último commit. Recupéralo sin afectar a nada más.',
    setup: () => {
      let w = sampleRepo();
      w = run(w, ['echo "nuevo" > borrador.txt', 'rm README.md']);
      return finalize(w);
    },
    goals: [
      { id: 'back', label: 'README.md existe con su contenido confirmado', test: (w) => workContent(w, 'README.md') === headContent(repoAt(w), 'README.md') },
      { id: 'draft', label: 'borrador.txt sigue existiendo', test: (w) => workContent(w, 'borrador.txt') !== undefined },
      { id: 'clean', label: 'No hay cambios en archivos rastreados', test: (w) => cleanTree(w, repoAt(w)) },
    ],
    penalties: [CLEAN, HARD_RESET],
    optimal: 1,
    question: {
      question: 'Si README.md nunca se hubiera confirmado ni añadido, ¿podría Git recuperarlo?',
      options: [
        { text: 'No: Git solo puede restaurar lo que guardó en el staging o en un commit', correct: true, explanation: 'Por eso conviene hacer commits frecuentes.' },
        { text: 'Sí, con git reflog', correct: false, explanation: 'reflog registra movimientos de HEAD, no archivos nunca guardados.' },
        { text: 'Sí, con git restore', correct: false, explanation: 'restore necesita una versión guardada de la que copiar.' },
      ],
    },
    xp: 30,
  },
  {
    id: 'e-remote-sync',
    category: 'remotos',
    title: 'Sincronización con el remoto',
    situation: 'Tienes un commit local sin publicar y alguien subió otro commit a origin/main. Deja GitHub y tu copia local idénticos, con ambos commits, sin perder trabajo de nadie.',
    setup: () => {
      let w = remoteWorld();
      serverCommit(w, getServer(w, REMOTE)!, { branch: 'main', author: TEAM.backend, message: 'feat: API de stock', changes: { 'stock.js': 'export const stock = {};\n' } });
      w = run(w, ['echo "/* modo oscuro */" >> styles.css', 'git commit -am "style: preparar modo oscuro"']);
      return finalize(w);
    },
    goals: [
      { id: 'remote-both', label: 'origin/main contiene ambos commits', test: (w) => { const s = getServer(w, REMOTE); if (!s) return false; const msgs = [...ancestors(s.objects, s.heads.main)].map((x) => s.objects.commits[x].message); return msgs.includes('feat: API de stock') && msgs.includes('style: preparar modo oscuro'); } },
      { id: 'synced', label: 'main local = origin/main', test: (w) => { const r = repoAt(w, TIENDA); const s = getServer(w, REMOTE); return !!r && !!s && r.heads.main === s.heads.main && r.remoteRefs['origin/main'] === s.heads.main; } },
    ],
    penalties: [FORCE_PUSH, HARD_RESET],
    optimal: 2,
    question: {
      question: 'git push fue rechazado con "fetch first". ¿Qué significa?',
      options: [
        { text: 'El remoto tiene commits que tú no tienes; debes integrarlos antes de subir', correct: true, explanation: 'Git protege el trabajo ajeno: primero pull (o fetch + merge/rebase).' },
        { text: 'Tu conexión a internet falló', correct: false, explanation: 'Es un rechazo intencionado por historia divergente.' },
        { text: 'Necesitas usar --force', correct: false, explanation: '--force borraría el commit de tu compañero.' },
      ],
    },
    xp: 50,
  },
  {
    id: 'e-github-publish',
    category: 'github',
    title: 'Publica tu portfolio',
    situation: 'Tu portfolio está en un repositorio local. Publícalo en GitHub como repositorio público "mi-portfolio", con main enlazada a origin/main, y activa GitHub Pages para verlo online.',
    setup: () => githubWorld(),
    github: 'https://github.com/estudiante/mi-portfolio.git',
    goals: [
      { id: 'exists', label: 'Existe estudiante/mi-portfolio y es público', test: (w) => getServer(w, 'https://github.com/estudiante/mi-portfolio.git')?.visibility === 'public' },
      { id: 'pushed', label: 'main está publicada con tus commits', test: (w) => { const s = getServer(w, 'https://github.com/estudiante/mi-portfolio.git'); const r = repoAt(w, join(HOME, 'mi-portfolio')); return !!s && !!r && s.heads.main === r.heads.main; } },
      { id: 'upstream', label: 'main sigue a origin/main', test: (w) => repoAt(w, join(HOME, 'mi-portfolio'))?.upstream.main?.branch === 'main' },
      { id: 'pages', label: 'GitHub Pages está activado', test: (w) => !!getServer(w, 'https://github.com/estudiante/mi-portfolio.git')?.pages.enabled },
    ],
    penalties: [FORCE_PUSH],
    optimal: 4,
    question: {
      question: 'En el GitHub REAL, ¿qué necesitarías además para hacer esto?',
      options: [
        { text: 'Una cuenta de GitHub y autenticarte (token o SSH) al hacer push', correct: true, explanation: 'El laboratorio simula la cuenta; en la vida real GitHub exige autenticación.' },
        { text: 'Nada, git push funciona sin cuenta', correct: false, explanation: 'GitHub requiere autenticación para escribir en repositorios.' },
        { text: 'Instalar GitHub Desktop obligatoriamente', correct: false, explanation: 'Basta con git (y opcionalmente gh); GitHub Desktop es opcional.' },
      ],
    },
    xp: 50,
  },
  {
    id: 'e-collab-fork',
    category: 'colaboracion',
    title: 'Contribuye a un proyecto open source',
    situation: 'Quieres añadir un recurso al README de open-source-org/awesome-git, pero no tienes permisos de escritura. Contribuye como se hace en proyectos abiertos y abre un Pull Request al repositorio original.',
    setup: () => {
      const w = githubWorld();
      w.cwd = HOME;
      return w;
    },
    github: 'https://github.com/open-source-org/awesome-git.git',
    goals: [
      { id: 'fork', label: 'Tienes un fork estudiante/awesome-git', test: (w) => !!getServer(w, 'https://github.com/estudiante/awesome-git.git')?.forkOf },
      { id: 'branch', label: 'Tu fork tiene una rama con tu contribución', test: (w) => { const s = getServer(w, 'https://github.com/estudiante/awesome-git.git'); return !!s && Object.keys(s.heads).some((b) => b !== 'main' && s.objects.commits[s.heads[b]].tree['README.md'] !== s.objects.commits[s.heads.main].tree['README.md']); } },
      { id: 'pr', label: 'Hay un PR abierto en el repositorio ORIGINAL desde tu fork', test: (w) => !!getServer(w, 'https://github.com/open-source-org/awesome-git.git')?.pulls.some((p) => p.headRepo === 'https://github.com/estudiante/awesome-git.git') },
    ],
    penalties: [],
    optimal: 7,
    question: {
      question: '¿Para qué sirve un fork?',
      options: [
        { text: 'Para tener tu propia copia en GitHub donde sí puedes hacer push, y proponer cambios al original con un PR', correct: true, explanation: 'Así contribuyes sin necesitar permisos de escritura en el proyecto original.' },
        { text: 'Es lo mismo que una rama', correct: false, explanation: 'Una rama vive en el mismo repositorio; un fork es otro repositorio en tu cuenta.' },
        { text: 'Para descargar el proyecto a tu ordenador', correct: false, explanation: 'Eso es git clone. El fork ocurre en GitHub.' },
      ],
    },
    xp: 60,
  },
  {
    id: 'e-conflict-both',
    category: 'conflictos',
    title: 'Conflicto: conserva ambos cambios',
    situation: 'Dos personas añadieron productos distintos en la misma línea de config.js. El resultado final debe contener la línea de A y la línea de B (en ese orden), sin marcadores, con el merge completado.',
    setup: () => conflictWorld('const productos = [\n  "Camiseta",\n];\n', 'const productos = [\n  "Camiseta",\n  "Taza",\n];\n', 'const productos = [\n  "Camiseta",\n  "Gorra",\n];\n'),
    goals: [
      { id: 'merged', label: 'La rama de B está fusionada en main', test: (w) => isMerged(repoAt(w), 'feature/desarrollador-b', 'main') },
      { id: 'both', label: 'config.js contiene "Taza" y "Gorra"', test: (w) => { const c = headContent(repoAt(w), 'config.js', 'main') ?? ''; return c.includes('"Taza"') && c.includes('"Gorra"') && c.indexOf('Taza') < c.indexOf('Gorra'); } },
      { id: 'nomarkers', label: 'Sin marcadores de conflicto', test: (w) => !hasConflictMarkers(headContent(repoAt(w), 'config.js', 'main') ?? '<<<<<<< ') && !(headContent(repoAt(w), 'config.js', 'main') ?? '').includes('<<<<<<<') },
      { id: 'done', label: 'El merge está terminado y el árbol limpio', test: (w) => cleanTree(w, repoAt(w)) },
    ],
    penalties: [{ label: 'Abortaste el merge (merge --abort) en lugar de resolverlo', points: 5, test: (l) => has(l, 'git merge', (a) => a.includes('--abort')) }],
    optimal: 4,
    question: {
      question: 'Entre <<<<<<< HEAD y ======= aparece…',
      options: [
        { text: 'La versión de la rama en la que estás (HEAD)', correct: true, explanation: 'Y entre ======= y >>>>>>> la de la rama que fusionas.' },
        { text: 'La versión original (ancestro común)', correct: false, explanation: 'El ancestro común solo se muestra con el estilo diff3.' },
        { text: 'La versión de la rama que estás fusionando', correct: false, explanation: 'Esa aparece en la segunda mitad del bloque.' },
      ],
    },
    xp: 50,
  },
  {
    id: 'e-workflow-githubflow',
    category: 'workflows',
    title: 'Aplica GitHub Flow',
    situation: 'Tu equipo usa GitHub Flow y main está protegida. Añade el archivo faq.html siguiendo el flujo completo, y deja tu entorno listo para la siguiente tarea.',
    setup: () => {
      const w = remoteWorld();
      getServer(w, REMOTE)!.protectedBranches.main = { requirePullRequest: true, requiredApprovals: 1, allowForcePush: false };
      return w;
    },
    github: REMOTE,
    automate: (w) => {
      const s = getServer(w, REMOTE);
      if (!s) return false;
      let changed = false;
      for (const pr of s.pulls) {
        if (pr.state === 'open' && !pr.reviews.length) {
          reviewPullRequest(w, s, pr.number, { author: TEAM.reviewer.username, state: 'approved', body: 'Aprobado ✅' });
          changed = true;
        }
      }
      return changed;
    },
    goals: [
      { id: 'merged', label: 'faq.html llegó a origin/main mediante un PR fusionado', test: (w) => { const s = getServer(w, REMOTE); return !!s && s.pulls.some((p) => p.state === 'merged') && 'faq.html' in s.objects.commits[s.heads.main].tree; } },
      { id: 'synced', label: 'Tu main local está sincronizado', test: (w) => { const r = repoAt(w, TIENDA); const s = getServer(w, REMOTE); return !!r && !!s && r.heads.main === s.heads.main; } },
      { id: 'cleanup', label: 'Borraste la rama local de la funcionalidad', test: (w) => { const r = repoAt(w, TIENDA); return !!r && Object.keys(r.heads).length === 1; } },
      { id: 'onmain', label: 'Estás en main con el árbol limpio', test: (w) => { const r = repoAt(w, TIENDA); return !!r && r.head.kind === 'branch' && r.head.name === 'main' && cleanTree(w, r); } },
    ],
    penalties: [FORCE_PUSH, { label: 'Intentaste hacer push directo a main', points: 5, test: (l) => l.some((r) => r.command === 'git push' && !r.ok) }],
    optimal: 9,
    question: {
      question: '¿Cuál es la regla principal de GitHub Flow?',
      options: [
        { text: 'main siempre es desplegable; todo cambio entra por una rama corta y un Pull Request', correct: true, explanation: 'Simple y continuo: rama → commits → PR → revisión → merge → despliegue.' },
        { text: 'Existen ramas develop, release y hotfix', correct: false, explanation: 'Eso es Git Flow.' },
        { text: 'Todos hacen commit directamente en main varias veces al día', correct: false, explanation: 'Eso se parece más a trunk-based sin revisión.' },
      ],
    },
    xp: 60,
  },
  {
    id: 'e-workflow-hotfix',
    category: 'workflows',
    title: 'Hotfix en Git Flow',
    situation: 'Producción (main, versión v1.0.0) tiene un error en el cálculo del precio (precio.js). Usando Git Flow, la corrección debe llegar a main (etiquetada como v1.0.1) y también a develop.',
    setup: () => {
      let w = createWorld({ dirs: ['proyecto'], cwd: 'proyecto' });
      writeFiles(w, P(), { 'README.md': '# Tienda\n', 'precio.js': 'export const total = (p, iva) => p + iva; // ERROR: debería ser p * (1 + iva)\n' });
      w = run(w, ['git init', 'git add .', 'git commit -m "release: versión 1.0.0"', 'git tag -a v1.0.0 -m "Versión 1.0.0"', 'git switch -c develop', 'echo "export const envio = 5;" > envio.js', 'git add .', 'git commit -m "feat: gastos de envío"']);
      return finalize(w);
    },
    goals: [
      { id: 'main', label: 'main contiene la corrección de precio.js', test: (w) => !!headContent(repoAt(w), 'precio.js', 'main')?.includes('p * (1 + iva)') },
      { id: 'develop', label: 'develop también contiene la corrección', test: (w) => !!headContent(repoAt(w), 'precio.js', 'develop')?.includes('p * (1 + iva)') && fileInHead(repoAt(w), 'envio.js', 'develop') },
      { id: 'noenvio', label: 'main NO incluye trabajo sin publicar de develop (envio.js)', test: (w) => !fileInHead(repoAt(w), 'envio.js', 'main') },
      { id: 'tag', label: 'Existe la etiqueta v1.0.1 en main', test: (w) => { const r = repoAt(w); return !!r && !!r.tags['v1.0.1'] && r.tags['v1.0.1'].target === r.heads.main; } },
      { id: 'branch', label: 'Usaste una rama hotfix/...', test: (_w, l) => l.some((r) => r.ok && r.argv.some((a) => a.startsWith('hotfix/'))) },
    ],
    penalties: [{ label: 'Fusionaste develop en main', points: 15, test: (l) => l.some((r) => r.command === 'git merge' && r.ok && r.argv.includes('develop')) }],
    optimal: 9,
    question: {
      question: 'En Git Flow, ¿de qué rama sale un hotfix?',
      options: [
        { text: 'De main (producción), y se fusiona en main y en develop', correct: true, explanation: 'Así producción se corrige ya y develop no vuelve a introducir el error.' },
        { text: 'De develop', correct: false, explanation: 'develop puede contener trabajo no listo para producción.' },
        { text: 'De una rama feature', correct: false, explanation: 'Las features son para funcionalidades nuevas, no urgencias en producción.' },
      ],
    },
    xp: 60,
  },
];

export function evaluationById(id: string) {
  return EVALUATIONS.find((e) => e.id === id);
}

export function scoreEvaluation(ev: Evaluation, w: World, log: CommandRecord[], answerCorrect: boolean | null) {
  const goals = ev.goals.map((g) => ({ ...g, passed: safe(() => g.test(w, log)) }));
  const passedGoals = goals.filter((g) => g.passed).length;
  const goalScore = (passedGoals / goals.length) * 60;
  const applied = ev.penalties.filter((p) => safe(() => p.test(log, w)));
  const gitCommands = log.filter((r) => r.command.startsWith('git ') || r.command.startsWith('gh ')).length;
  const failed = log.filter((r) => !r.ok).length;
  let safety = 15 - applied.reduce((a, p) => a + p.points, 0);
  const extra = Math.max(0, gitCommands - ev.optimal * 2);
  safety -= Math.min(5, extra);
  safety = Math.max(0, safety);
  const question = answerCorrect ? 25 : 0;
  const score = Math.round(goalScore + question + safety);
  const accuracy = log.length ? Math.round(((log.length - failed) / log.length) * 100) : 0;
  const notes: string[] = [];
  for (const g of goals) if (!g.passed) notes.push(`Objetivo no cumplido: ${g.label}`);
  for (const p of applied) notes.push(`−${p.points}: ${p.label}`);
  if (extra > 0) notes.push(`Usaste ${gitCommands} comandos de Git; una solución directa necesita unos ${ev.optimal}.`);
  if (answerCorrect === false) notes.push('La pregunta de comprensión no fue correcta.');
  const passed = passedGoals === goals.length && score >= 70;
  return { goals, applied, score: Math.min(100, score), accuracy, passed, notes, gitCommands };
}

function safe(fn: () => boolean) {
  try {
    return fn();
  } catch {
    return false;
  }
}

export { unstagedPaths };
