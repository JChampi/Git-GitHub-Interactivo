/**
 * Retos prácticos progresivos con validación automática del estado.
 */
import type { World } from '../engine/types';
import { serverCommit, getServer, reviewPullRequest } from '../engine/server';
import { createWorld, finalize, run, runAs, writeFiles, TEAM } from '../engine/world';
import { conflictWorld, emptyProject, filesWorld, P, remoteWorld, REMOTE, sampleRepo } from '../labs/presets';
import {
  branchCommitsSince,
  type Check,
  cleanTree,
  commitCount,
  fileInHead,
  headContent,
  isMerged,
  lastMessage,
  repoAt,
  stagedPaths,
  unstagedPaths,
  workContent,
} from '../labs/checks';
import { ancestors, computeStatus, currentBranch, getCommit, headSha, isAncestor } from '../engine/repo';
import { hasConflictMarkers } from '../engine/merge';
import { join } from '../engine/vfs';
import { HOME } from '../engine/world';

export interface Challenge {
  id: string;
  level: 1 | 2 | 3 | 4 | 5;
  title: string;
  category: string;
  context: string;
  objective: string;
  instructions: string[];
  initialRepo: string;
  setup: () => World;
  checks: Check[];
  hints: string[];
  solution: string[];
  explanation: string;
  /** Número aproximado de comandos de una solución limpia (para la retroalimentación). */
  optimal: number;
  xp: number;
  /** Automatizaciones del escenario (p. ej. un revisor que aprueba el PR). Devuelve true si modificó el mundo. */
  automate?: (w: World) => boolean;
  /** Muestra el panel de GitHub simulado en el reto. */
  github?: string;
}

export const LEVEL_NAMES: Record<number, string> = {
  1: 'Principiante',
  2: 'Básico',
  3: 'Intermedio',
  4: 'Avanzado',
  5: 'Simulación profesional',
};

const TIENDA = join(HOME, 'tienda-web');

export const CHALLENGES: Challenge[] = [
  {
    id: 'c-first-repo',
    level: 1,
    title: 'Tu primer repositorio',
    category: 'Fundamentos',
    context: 'Empiezas un proyecto nuevo y quieres que Git registre su historia desde el primer día.',
    objective: 'Crea tu primer repositorio, crea un archivo README.md y registra tu primer commit.',
    instructions: [
      'Trabaja dentro de la carpeta ~/proyecto (ya estás en ella).',
      'Convierte la carpeta en un repositorio Git.',
      'Crea un archivo README.md con un título.',
      'Registra el archivo en un commit con un mensaje descriptivo.',
    ],
    initialRepo: 'Carpeta ~/proyecto vacía, sin repositorio.',
    setup: () => emptyProject(),
    checks: [
      { id: 'repo', label: 'Existe un repositorio Git en ~/proyecto', test: (w) => !!repoAt(w) },
      { id: 'readme', label: 'README.md existe y no está vacío', test: (w) => !!workContent(w, 'README.md')?.trim() },
      { id: 'commit', label: 'Hay al menos un commit', test: (w) => commitCount(repoAt(w)) >= 1 },
      { id: 'readme-commit', label: 'README.md está incluido en el último commit', test: (w) => fileInHead(repoAt(w), 'README.md') },
    ],
    hints: [
      'Hay un comando que crea la carpeta oculta .git donde vive el historial.',
      'Puedes crear un archivo con contenido así: echo "# Mi proyecto" > README.md (o con el botón "Nuevo archivo").',
      'Un commit necesita dos pasos: preparar el archivo (git add) y confirmarlo (git commit -m "mensaje").',
    ],
    solution: ['git init', 'echo "# Mi proyecto" > README.md', 'git add README.md', 'git commit -m "docs: añade README inicial"'],
    explanation:
      'git init crea el repositorio (la carpeta .git). El archivo nuevo empieza como "untracked"; git add lo copia al staging area y git commit guarda una instantánea permanente con autor, fecha y mensaje.',
    optimal: 4,
    xp: 20,
  },
  {
    id: 'c-selective',
    level: 1,
    title: 'Prepara solo lo necesario',
    category: 'Commits e historial',
    context: 'Has tocado varios archivos, pero solo el cambio de app.js está terminado. Los estilos siguen a medias y notas.txt es personal.',
    objective: 'Crea un commit que incluya ÚNICAMENTE los cambios de app.js.',
    instructions: [
      'Revisa qué archivos han cambiado.',
      'Prepara solo app.js y crea el commit.',
      'styles.css debe seguir modificado (sin confirmar) y notas.txt sin rastrear.',
    ],
    initialRepo: 'Repositorio con un commit; app.js y styles.css modificados, notas.txt nuevo.',
    setup: () => {
      let w = sampleRepo();
      w = run(w, ['echo "console.log(\'Tienda lista\');" >> app.js', 'echo "a { color: red; }" >> styles.css', 'echo "comprar café" > notas.txt']);
      return finalize(w);
    },
    checks: [
      { id: 'two', label: 'Hay un commit nuevo', test: (w) => commitCount(repoAt(w)) >= 2 },
      {
        id: 'only-app',
        label: 'El último commit solo modifica app.js',
        test: (w) => {
          const r = repoAt(w);
          const sha = r && headSha(r);
          if (!r || !sha) return false;
          const c = getCommit(r, sha);
          if (!c.parents[0]) return false;
          const p = getCommit(r, c.parents[0]).tree;
          const changed = [...new Set([...Object.keys(p), ...Object.keys(c.tree)])].filter((k) => p[k] !== c.tree[k]);
          return changed.length === 1 && changed[0] === 'app.js';
        },
      },
      { id: 'styles', label: 'styles.css sigue modificado sin confirmar', test: (w) => [...unstagedPaths(w, repoAt(w)), ...stagedPaths(w, repoAt(w))].includes('styles.css') },
      { id: 'notes', label: 'notas.txt sigue sin rastrear', test: (w) => !!repoAt(w) && computeStatus(w, repoAt(w)!).untracked.includes('notas.txt') },
    ],
    hints: ['git status te dice qué archivos cambiaron y en qué estado están.', 'git add acepta nombres de archivo concretos, no solo ".".', 'Si añadiste algo de más, git restore --staged <archivo> lo saca del staging.'],
    solution: ['git status', 'git add app.js', 'git commit -m "feat: mensaje de bienvenida en consola"'],
    explanation:
      'El staging area te permite elegir qué cambios forman cada commit. Así los commits son pequeños y coherentes ("commits atómicos"), lo que facilita revisarlos y deshacerlos.',
    optimal: 3,
    xp: 20,
  },
  {
    id: 'c-feature-login',
    level: 2,
    title: 'Rama feature/login',
    category: 'Gestión de ramas',
    context: 'Te asignan la funcionalidad de inicio de sesión. Debes trabajar sin tocar la rama principal.',
    objective: 'Crea una rama llamada feature/login y realiza dos commits en ella.',
    instructions: ['Crea la rama feature/login y cámbiate a ella.', 'Haz al menos dos commits con cambios distintos (por ejemplo login.html y login.js).', 'La rama main no debe cambiar.'],
    initialRepo: 'Repositorio con la tienda de ejemplo en main.',
    setup: () => finalize(sampleRepo(true)),
    checks: [
      { id: 'branch', label: 'Existe la rama feature/login', test: (w) => !!repoAt(w)?.heads['feature/login'] },
      { id: 'commits', label: 'feature/login tiene al menos 2 commits que no están en main', test: (w) => branchCommitsSince(repoAt(w), 'feature/login', 'main') >= 2 },
      { id: 'main', label: 'main conserva sus 2 commits originales', test: (w) => commitCount(repoAt(w), 'main') === 2 },
    ],
    hints: ['git switch tiene una opción para crear la rama y cambiarte a la vez.', 'Comprueba en qué rama estás con git branch (la actual lleva *).', 'Cada commit necesita git add + git commit. Puedes crear archivos con touch o echo.'],
    solution: ['git switch -c feature/login', 'echo "<form>Login</form>" > login.html', 'git add login.html', 'git commit -m "feat: formulario de login"', 'echo "// validar" > login.js', 'git add login.js', 'git commit -m "feat: validación del login"'],
    explanation: 'Una rama es un puntero móvil a un commit. Al hacer commits en feature/login solo avanza ese puntero; main se queda donde estaba hasta que fusiones.',
    optimal: 7,
    xp: 30,
  },
  {
    id: 'c-gitignore',
    level: 2,
    title: 'Ignora lo que no se versiona',
    category: 'Administración de repositorios',
    context: 'El proyecto Node tiene dependencias, builds, logs y un archivo .env con contraseñas. Nada de eso debe llegar al repositorio.',
    objective: 'Crea un primer commit con el código, pero sin node_modules, dist, logs, archivos .log ni .env.',
    instructions: ['Crea un archivo .gitignore con los patrones adecuados.', 'Comprueba con git status que los archivos sensibles ya no aparecen.', 'Haz el commit incluyendo .gitignore, README.md, package.json y src/.'],
    initialRepo: 'Repositorio recién inicializado con un proyecto Node sin confirmar.',
    setup: () => filesWorld(),
    checks: [
      { id: 'ignore', label: '.gitignore está confirmado', test: (w) => fileInHead(repoAt(w), '.gitignore') },
      { id: 'code', label: 'README.md, package.json y src/index.js están confirmados', test: (w) => ['README.md', 'package.json', 'src/index.js'].every((p) => fileInHead(repoAt(w), p)) },
      {
        id: 'secrets',
        label: 'Ningún commit contiene .env, node_modules, dist ni logs',
        test: (w) => {
          const r = repoAt(w);
          if (!r || !headSha(r)) return false;
          return [...ancestors(r.objects, headSha(r)!)].every((s) => Object.keys(getCommit(r, s).tree).every((p) => !/^(\.env|node_modules\/|dist\/|logs\/)|\.log$/.test(p)));
        },
      },
    ],
    hints: ['Un .gitignore es un archivo de texto con un patrón por línea.', 'Las carpetas se ignoran con una barra final: node_modules/. Los comodines también valen: *.log', 'Puedes escribir varias líneas así: echo -e "node_modules/\\n.env" > .gitignore. Luego git status para comprobarlo.'],
    solution: ['echo -e "node_modules/\\ndist/\\nlogs/\\n*.log\\n.env" > .gitignore', 'git status', 'git add .', 'git commit -m "chore: estructura inicial con .gitignore"'],
    explanation: '.gitignore evita que archivos generados, dependencias o secretos entren en el historial. ¡Una vez confirmado un secreto, queda en la historia aunque lo borres después!',
    optimal: 4,
    xp: 30,
  },
  {
    id: 'c-amend',
    level: 2,
    title: 'Corrige el último commit',
    category: 'Commits e historial',
    context: 'Acabas de hacer un commit con una errata en el mensaje y además olvidaste incluir formulario.css. Todavía no lo has compartido con nadie.',
    objective: 'Deja un único commit con el mensaje "feat: añade formulario" que incluya formulario.html y formulario.css.',
    instructions: ['No crees un commit adicional: corrige el existente.', 'El mensaje final debe ser exactamente: feat: añade formulario'],
    initialRepo: 'Repositorio con 2 commits; el último tiene la errata "fromulario". formulario.css está sin rastrear.',
    setup: () => {
      let w = sampleRepo();
      w = run(w, ['echo "<form></form>" > formulario.html', 'git add formulario.html', 'git commit -m "feat: añade fromulario"', 'echo "form { margin: 1rem; }" > formulario.css']);
      return finalize(w);
    },
    checks: [
      { id: 'count', label: 'Sigue habiendo exactamente 2 commits', test: (w) => commitCount(repoAt(w)) === 2 },
      { id: 'msg', label: 'El mensaje es "feat: añade formulario"', test: (w) => lastMessage(repoAt(w)).trim() === 'feat: añade formulario' },
      { id: 'css', label: 'El último commit incluye formulario.css', test: (w) => fileInHead(repoAt(w), 'formulario.css') && fileInHead(repoAt(w), 'formulario.html') },
    ],
    hints: ['git commit tiene una opción para reemplazar el último commit.', 'Primero prepara el archivo olvidado con git add; después corrige.', 'git commit --amend -m "nuevo mensaje" sustituye mensaje y contenido.'],
    solution: ['git add formulario.css', 'git commit --amend -m "feat: añade formulario"'],
    explanation: '--amend crea un commit NUEVO (otro SHA) que sustituye al anterior. Úsalo solo con commits que no hayas publicado: reescribe la historia.',
    optimal: 2,
    xp: 30,
  },
  {
    id: 'c-merge',
    level: 3,
    title: 'Fusiona la funcionalidad',
    category: 'Gestión de ramas',
    context: 'La funcionalidad del carrito está terminada en feature/carrito. Mientras tanto, main recibió una corrección.',
    objective: 'Fusiona la rama feature/carrito con main.',
    instructions: ['Sitúate en la rama que debe RECIBIR los cambios.', 'Fusiona feature/carrito.', 'El working directory debe quedar limpio.'],
    initialRepo: 'main y feature/carrito han divergido (cada una tiene commits propios).',
    setup: () => {
      let w = sampleRepo();
      w = run(w, [
        'git switch -c feature/carrito',
        'echo "export const carrito = [];" > carrito.js',
        'git add carrito.js',
        'git commit -m "feat: estructura del carrito"',
        'echo "export function agregar(p) { carrito.push(p); }" >> carrito.js',
        'git commit -am "feat: agregar productos al carrito"',
        'git switch main',
        'echo "Licencia MIT" > LICENSE',
        'git add LICENSE',
        'git commit -m "docs: añade licencia"',
        'git switch feature/carrito',
      ]);
      return finalize(w);
    },
    checks: [
      { id: 'merged', label: 'main contiene todos los commits de feature/carrito', test: (w) => isMerged(repoAt(w), 'feature/carrito', 'main') },
      { id: 'license', label: 'main conserva su propio commit (LICENSE)', test: (w) => fileInHead(repoAt(w), 'LICENSE', 'main') },
      { id: 'on-main', label: 'Estás en la rama main', test: (w) => { const r = repoAt(w); return !!r && currentBranch(r) === 'main'; } },
      { id: 'clean', label: 'El working directory está limpio', test: (w) => cleanTree(w, repoAt(w)) },
    ],
    hints: ['git merge trae los cambios de OTRA rama a la rama en la que estás.', 'Primero cámbiate a main con git switch main.', 'Como ambas ramas tienen commits propios, Git creará un commit de merge con dos padres.'],
    solution: ['git switch main', 'git merge feature/carrito', 'git log --oneline --graph --all'],
    explanation: 'Al divergir las ramas no es posible un fast-forward: Git calcula el ancestro común, combina los cambios de ambos lados y crea un commit de merge.',
    optimal: 2,
    xp: 40,
  },
  {
    id: 'c-unstage-keep',
    level: 3,
    title: 'Deshaz sin perder el staging',
    category: 'Recuperación de cambios',
    context: 'Preparaste index.html y styles.css para el próximo commit. Después metiste un cambio roto en app.js que quieres descartar.',
    objective: 'Deshaz el cambio de app.js sin perder los archivos que ya están en staging.',
    instructions: ['app.js debe volver a su última versión confirmada.', 'index.html y styles.css deben seguir preparados (staged) con sus cambios.', 'No hagas commit todavía.'],
    initialRepo: 'index.html y styles.css en staging; app.js modificado (sin preparar).',
    setup: () => {
      let w = sampleRepo();
      w = run(w, ['echo "<footer>© Tienda</footer>" >> index.html', 'echo "footer { color: gray; }" >> styles.css', 'git add index.html styles.css', 'echo "esto rompe todo ???" >> app.js']);
      return finalize(w);
    },
    checks: [
      { id: 'app', label: 'app.js coincide con el último commit', test: (w) => workContent(w, 'app.js') === headContent(repoAt(w), 'app.js') && !stagedPaths(w, repoAt(w)).includes('app.js') },
      { id: 'staged', label: 'index.html y styles.css siguen en staging', test: (w) => ['index.html', 'styles.css'].every((p) => stagedPaths(w, repoAt(w)).includes(p)) },
      { id: 'content', label: 'Los cambios preparados no se perdieron', test: (w) => !!workContent(w, 'index.html')?.includes('footer') && !!workContent(w, 'styles.css')?.includes('footer') },
      { id: 'nocommit', label: 'No se creó ningún commit', test: (w) => commitCount(repoAt(w)) === 1 },
    ],
    hints: ['Hay un comando moderno para "restaurar" archivos del working directory.', 'git restore <archivo> descarta cambios NO preparados de ese archivo, sin tocar el staging de los demás.', 'Cuidado: git reset --hard o git restore . afectarían también a los otros archivos.'],
    solution: ['git status', 'git restore app.js', 'git status'],
    explanation: 'git restore <archivo> copia la versión del staging (o del último commit) sobre el working directory de ESE archivo. git reset --hard habría borrado también los cambios preparados de index.html y styles.css.',
    optimal: 2,
    xp: 40,
  },
  {
    id: 'c-revert-pushed',
    level: 3,
    title: 'Revierte un commit publicado',
    category: 'Recuperación de cambios',
    context: 'Subiste a GitHub un commit que rompió los precios. Tus compañeros ya lo descargaron, así que NO puedes reescribir la historia.',
    objective: 'Deshaz el commit "feat: precios dinámicos" de forma segura y publica la corrección.',
    instructions: ['No uses reset ni push --force: la historia publicada debe conservarse.', 'Crea un commit que deshaga los cambios del commit problemático.', 'Sube el resultado a origin/main.'],
    initialRepo: 'Clon de equipo/tienda-web con el commit problemático ya publicado.',
    setup: () => {
      let w = remoteWorld();
      w = run(w, ['echo "const precio = Math.random() * 1000;" > precios.js', 'git add precios.js', 'git commit -m "feat: precios dinámicos"', 'git push']);
      return finalize(w);
    },
    checks: [
      { id: 'kept', label: 'El commit original sigue en la historia', test: (w) => { const r = repoAt(w, TIENDA); return !!r && Object.values(r.objects.commits).some((c) => c.message === 'feat: precios dinámicos' && isAncestor(r.objects, c.sha, r.heads.main)); } },
      { id: 'reverted', label: 'precios.js ya no existe en main', test: (w) => !fileInHead(repoAt(w, TIENDA), 'precios.js', 'main') },
      { id: 'pushed', label: 'origin/main está actualizado en GitHub', test: (w) => { const r = repoAt(w, TIENDA); const s = getServer(w, REMOTE); return !!r && !!s && s.heads.main === r.heads.main; } },
      { id: 'safe', label: 'No se reescribió la historia (sin reset ni push --force)', test: (_w, log) => !log.some((r) => r.command === 'git reset' && r.argv.includes('--hard')) && !log.some((r) => r.command === 'git push' && r.argv.some((a) => a === '-f' || a === '--force')) },
    ],
    hints: ['Hay un comando que crea un commit "inverso" en vez de borrar commits.', 'git revert <commit> necesita saber qué commit revertir: HEAD es el último.', 'Después de revertir, publica con git push.'],
    solution: ['git log --oneline', 'git revert HEAD --no-edit', 'git push'],
    explanation: 'git revert añade un commit nuevo que aplica el cambio contrario. La historia compartida no se modifica, así que nadie del equipo tiene problemas al sincronizar.',
    optimal: 2,
    xp: 40,
  },
  {
    id: 'c-conflict',
    level: 4,
    title: 'Resuelve el conflicto',
    category: 'Resolución de conflictos',
    context: 'Dos desarrolladores modificaron la misma línea de config.js. A cambió el título a "Tienda Online"; B cambió el título y además la moneda a "USD".',
    objective: 'Fusiona feature/desarrollador-b en main y resuelve el conflicto: título "Tienda Online" (de A) y moneda "USD" (de B).',
    instructions: ['Ejecuta el merge desde main.', 'Resuelve los marcadores en config.js (con el editor o con git mergetool).', 'Marca el archivo como resuelto y completa el merge.'],
    initialRepo: 'main (desarrollador A) y feature/desarrollador-b (desarrollador B) modificaron la misma línea.',
    setup: () => conflictWorld(),
    checks: [
      { id: 'merge', label: 'Existe un commit de merge con la rama de B', test: (w) => isMerged(repoAt(w), 'feature/desarrollador-b', 'main') },
      { id: 'markers', label: 'config.js no contiene marcadores de conflicto', test: (w) => { const c = headContent(repoAt(w), 'config.js', 'main'); return !!c && !hasConflictMarkers(c) && !c.includes('<<<<<<<'); } },
      { id: 'title', label: 'El título es "Tienda Online"', test: (w) => !!headContent(repoAt(w), 'config.js', 'main')?.includes('"Tienda Online"') && !headContent(repoAt(w), 'config.js', 'main')?.includes('Mi Super Tienda') },
      { id: 'currency', label: 'La moneda es "USD"', test: (w) => !!headContent(repoAt(w), 'config.js', 'main')?.includes('"USD"') && !headContent(repoAt(w), 'config.js', 'main')?.includes('"EUR"') },
    ],
    hints: ['git merge feature/desarrollador-b iniciará la fusión y te avisará del conflicto.', 'Abre config.js: entre <<<<<<< y ======= está tu versión (HEAD); entre ======= y >>>>>>> la de B. Deja solo el contenido correcto.', 'Cuando el archivo quede bien: git add config.js y git commit para cerrar el merge.'],
    solution: ['git merge feature/desarrollador-b', 'git mergetool   (o edita config.js)', 'git add config.js', 'git commit -m "Merge: integra cambios de B"'],
    explanation: 'Git no puede decidir por ti cuando dos personas cambian las mismas líneas. Marca el conflicto, tú eliges el resultado final, y git add + git commit registran la resolución en el commit de merge.',
    optimal: 4,
    xp: 60,
  },
  {
    id: 'c-reflog',
    level: 4,
    title: 'Rescata el commit perdido',
    category: 'Recuperación de cambios',
    context: 'Un compañero ejecutó "git reset --hard HEAD~2" por error en tu repositorio. Los commits del sistema de pagos han desaparecido del log.',
    objective: 'Recupera la rama main para que vuelva a contener el commit "feat: pagos con tarjeta".',
    instructions: ['Investiga qué pasó con HEAD.', 'Devuelve main al estado anterior al reset.', 'pagos.js debe volver a existir.'],
    initialRepo: 'main fue reseteada dos commits hacia atrás. Los commits "perdidos" siguen en la base de datos de Git.',
    setup: () => {
      let w = sampleRepo();
      w = run(w, ['echo "export function pagar() {}" > pagos.js', 'git add pagos.js', 'git commit -m "feat: pagos con tarjeta"', 'echo "// tests" > pagos.test.js', 'git add .', 'git commit -m "test: pruebas de pagos"', 'git reset --hard HEAD~2']);
      return finalize(w);
    },
    checks: [
      { id: 'back', label: 'main contiene "feat: pagos con tarjeta"', test: (w) => { const r = repoAt(w); return !!r && !!r.heads.main && [...ancestors(r.objects, r.heads.main)].some((s) => r.objects.commits[s].message === 'feat: pagos con tarjeta'); } },
      { id: 'file', label: 'pagos.js existe en el working directory', test: (w) => workContent(w, 'pagos.js') !== undefined },
      { id: 'reflog', label: 'Consultaste el reflog', test: (_w, log) => log.some((r) => r.command === 'git reflog' && r.ok) },
    ],
    hints: ['git log ya no muestra esos commits, pero Git registra cada movimiento de HEAD en otro lugar.', 'git reflog muestra HEAD@{0}, HEAD@{1}... Busca la entrada anterior al reset.', 'Puedes volver a ese punto con git reset --hard HEAD@{1} (o con el SHA que veas).'],
    solution: ['git reflog', 'git reset --hard HEAD@{1}', 'git log --oneline'],
    explanation: 'Los commits no se borran al hacer reset: solo dejan de estar apuntados por la rama. El reflog guarda los movimientos de HEAD durante semanas, y permite volver a cualquiera de ellos.',
    optimal: 2,
    xp: 60,
  },
  {
    id: 'c-stash-hotfix',
    level: 4,
    title: 'Interrupción urgente',
    category: 'Gestión de ramas',
    context: 'Estás a mitad de trabajo en feature/buscador (cambios sin confirmar) y te piden corregir YA una errata del README en main.',
    objective: 'Corrige "Tiemda" → "Tienda" en README.md con un commit en main y vuelve a feature/buscador con tu trabajo a medias intacto.',
    instructions: ['No hagas commit del trabajo a medias.', 'El commit de main debe corregir la errata.', 'Termina en feature/buscador con buscador.js y los cambios de app.js como estaban.'],
    initialRepo: 'feature/buscador con cambios sin confirmar en app.js y un archivo nuevo buscador.js.',
    setup: () => {
      let w = createWorld({ dirs: ['proyecto'], cwd: 'proyecto' });
      writeFiles(w, P(), { 'README.md': '# Mi Tiemda Web\n', 'app.js': "console.log('tienda');\n" });
      w = run(w, ['git init', 'git add .', 'git commit -m "Versión inicial"', 'git switch -c feature/buscador', 'echo "// buscador en progreso" >> app.js', 'echo "export function buscar() {}" > buscador.js']);
      return finalize(w);
    },
    checks: [
      { id: 'fix', label: 'main tiene un commit que corrige la errata', test: (w) => !!headContent(repoAt(w), 'README.md', 'main')?.includes('Mi Tienda Web') },
      { id: 'branch', label: 'Estás de nuevo en feature/buscador', test: (w) => { const r = repoAt(w); return !!r && currentBranch(r) === 'feature/buscador'; } },
      { id: 'wip', label: 'Tu trabajo a medias sigue en el working directory', test: (w) => !!workContent(w, 'app.js')?.includes('buscador en progreso') && workContent(w, 'buscador.js') !== undefined },
      { id: 'notcommitted', label: 'El trabajo a medias no se confirmó en ninguna rama', test: (w) => !fileInHead(repoAt(w), 'buscador.js', 'feature/buscador') && !fileInHead(repoAt(w), 'buscador.js', 'main') },
    ],
    hints: ['Git puede guardar cambios temporalmente en una "pila" sin hacer commit.', 'git stash -u guarda también los archivos nuevos (untracked).', 'Secuencia: stash → switch main → corregir y commit → switch de vuelta → git stash pop.'],
    solution: ['git stash -u -m "buscador a medias"', 'git switch main', 'echo "# Mi Tienda Web" > README.md', 'git commit -am "fix: errata en el título"', 'git switch feature/buscador', 'git stash pop'],
    explanation: 'git stash aparta los cambios sin confirmar y deja el working directory limpio para cambiar de contexto. git stash pop los vuelve a aplicar donde estés.',
    optimal: 6,
    xp: 60,
  },
  {
    id: 'c-sync',
    level: 5,
    title: 'Integra el trabajo del equipo',
    category: 'Repositorios remotos',
    context: 'Mientras trabajabas, Diego (frontend) subió cambios a main. Tu commit local está listo para subir.',
    objective: 'Consigue que GitHub (origin/main) contenga tu commit Y el de Diego, sin perder ninguno.',
    instructions: ['Intenta subir tus cambios y lee el error con atención.', 'Integra el trabajo remoto en tu rama.', 'Publica el resultado.'],
    initialRepo: 'Clon de equipo/tienda-web con 1 commit local; el remoto tiene 1 commit que no has descargado.',
    setup: () => {
      let w = remoteWorld();
      const s = getServer(w, REMOTE)!;
      serverCommit(w, s, { branch: 'main', author: TEAM.frontend, message: 'feat: banner de ofertas', changes: { 'banner.html': '<div class="banner">¡Ofertas!</div>\n' } });
      w = run(w, ['echo -e "## Contacto\\nescribe a tienda@ejemplo.com" >> README.md', 'git commit -am "docs: añade contacto"']);
      return finalize(w);
    },
    checks: [
      { id: 'diego', label: 'origin/main contiene el commit de Diego', test: (w) => { const s = getServer(w, REMOTE); return !!s && [...ancestors(s.objects, s.heads.main)].some((x) => s.objects.commits[x].message === 'feat: banner de ofertas'); } },
      { id: 'mine', label: 'origin/main contiene tu commit', test: (w) => { const s = getServer(w, REMOTE); return !!s && [...ancestors(s.objects, s.heads.main)].some((x) => s.objects.commits[x].message === 'docs: añade contacto'); } },
      { id: 'synced', label: 'Tu main local y origin/main están sincronizados', test: (w) => { const r = repoAt(w, TIENDA); const s = getServer(w, REMOTE); return !!r && !!s && r.heads.main === s.heads.main; } },
      { id: 'noforce', label: 'Sin push --force', test: (_w, log) => !log.some((r) => r.command === 'git push' && r.argv.some((a) => a === '-f' || a === '--force')) },
    ],
    hints: ['El push será rechazado: el remoto tiene trabajo que tú no tienes.', 'git pull descarga e integra los cambios remotos (fetch + merge).', 'Después del pull, vuelve a intentar git push.'],
    solution: ['git push   (rechazado)', 'git pull', 'git push'],
    explanation: 'Git rechaza el push para no sobrescribir el trabajo de Diego. Al hacer pull integras su commit con el tuyo (merge) y entonces el push es un fast-forward.',
    optimal: 3,
    xp: 80,
  },
  {
    id: 'c-pr-flow',
    level: 5,
    title: 'Flujo completo con Pull Request',
    category: 'GitHub',
    context: 'En el equipo, main está protegida: solo se modifica mediante Pull Requests aprobados. Carlos (revisor) revisa los PR en cuanto se abren.',
    objective: 'Añade una página de contacto (contacto.html) y llévala a main mediante un Pull Request aprobado. Termina con tu main local actualizado.',
    instructions: ['Crea una rama de funcionalidad con un nombre descriptivo.', 'Haz commit de contacto.html y publica la rama.', 'Abre el Pull Request (pestaña GitHub o gh pr create) y espera la revisión.', 'Fusiona el PR y sincroniza tu main local.'],
    initialRepo: 'Clon de equipo/tienda-web. main protegida (requiere 1 aprobación).',
    github: REMOTE,
    setup: () => {
      const w = remoteWorld();
      getServer(w, REMOTE)!.protectedBranches.main = { requirePullRequest: true, requiredApprovals: 1, allowForcePush: false };
      return w;
    },
    automate: (w) => {
      const s = getServer(w, REMOTE);
      if (!s) return false;
      let changed = false;
      for (const pr of s.pulls) {
        if (pr.state === 'open' && !pr.reviews.some((r) => r.author === TEAM.reviewer.username)) {
          reviewPullRequest(w, s, pr.number, { author: TEAM.reviewer.username, state: 'approved', body: '¡Buen trabajo! Aprobado ✅' });
          changed = true;
        }
      }
      return changed;
    },
    checks: [
      { id: 'branch', label: 'Publicaste una rama distinta de main', test: (w) => Object.keys(getServer(w, REMOTE)?.heads ?? {}).some((b) => b !== 'main') || (getServer(w, REMOTE)?.pulls.length ?? 0) > 0 },
      { id: 'pr', label: 'Abriste un Pull Request', test: (w) => (getServer(w, REMOTE)?.pulls.length ?? 0) > 0 },
      { id: 'merged', label: 'El Pull Request se fusionó en main', test: (w) => !!getServer(w, REMOTE)?.pulls.some((p) => p.state === 'merged') },
      { id: 'file', label: 'contacto.html está en origin/main', test: (w) => { const s = getServer(w, REMOTE); return !!s && 'contacto.html' in (s.objects.commits[s.heads.main]?.tree ?? {}); } },
      { id: 'local', label: 'Tu main local está actualizado con el merge', test: (w) => { const r = repoAt(w, TIENDA); const s = getServer(w, REMOTE); return !!r && !!s && r.heads.main === s.heads.main; } },
    ],
    hints: ['Empieza con git switch -c feature/contacto.', 'Publica la rama con git push -u origin feature/contacto y abre el PR en la pestaña GitHub.', 'Tras fusionar en GitHub: git switch main && git pull.'],
    solution: ['git switch -c feature/contacto', 'echo "<h1>Contacto</h1>" > contacto.html', 'git add contacto.html', 'git commit -m "feat: página de contacto"', 'git push -u origin feature/contacto', 'gh pr create --title "Página de contacto" --body "Añade contacto.html"', '(Carlos aprueba) → gh pr merge 1  (o botón Merge)', 'git switch main', 'git pull'],
    explanation: 'Con ramas protegidas, los cambios llegan a main solo tras revisión. El merge ocurre en GitHub, por eso al final debes hacer pull para traerlo a tu copia local.',
    optimal: 9,
    xp: 80,
  },
];

export function challengeById(id: string) {
  return CHALLENGES.find((c) => c.id === id);
}

export { runAs };
