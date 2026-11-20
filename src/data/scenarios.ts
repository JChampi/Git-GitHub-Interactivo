/**
 * Escenarios reales: simulación de un equipo profesional con varios
 * participantes que actúan sobre el mismo repositorio remoto.
 */
import type { CommandRecord, World } from '../engine/types';
import { findRepo, getCommit } from '../engine/repo';
import { createServerRepo, getServer, mergePullRequest, openPullRequest, reviewPullRequest, serverCommit, prHeadSha } from '../engine/server';
import { createWorld, finalize, TEAM, type TeamKey } from '../engine/world';
import { SAMPLE_FILES } from '../engine/world';
import { join } from '../engine/vfs';
import { HOME } from '../engine/world';
import { teamServer } from '../labs/presets';
import { cleanTree, used } from '../labs/checks';

export interface ScenarioEvent {
  actor: TeamKey | 'system' | 'student';
  text: string;
}

export interface ScenarioStep {
  actor: TeamKey | 'student' | 'system';
  title: string;
  instruction: string;
  /** Acciones de otros participantes al entrar en el paso. */
  onEnter?: (w: World) => ScenarioEvent[];
  /** Si existe, el paso se completa cuando devuelve true. Si no, se avanza con "Continuar". */
  validate?: (w: World, log: CommandRecord[]) => boolean;
  hints?: string[];
}

export interface Scenario {
  id: string;
  letter: string;
  title: string;
  summary: string;
  cast: TeamKey[];
  setup: () => World;
  steps: ScenarioStep[];
  /** Reacciones automáticas (revisores) ante cambios del mundo. */
  automate?: (w: World) => ScenarioEvent[];
  repoUrl: string;
  xp: number;
}

const TIENDA_URL = 'https://github.com/equipo/tienda-web.git';
const PROJ_URL = 'https://github.com/equipo/proyecto-grupal.git';

const srv = (w: World, url = TIENDA_URL) => getServer(w, url);
const localRepo = (w: World, dir: string) => w.repos[join(HOME, dir)] ?? null;

function personalBranches(w: World, url = TIENDA_URL): string[] {
  const s = srv(w, url);
  return s ? Object.keys(s.heads).filter((b) => b !== s.defaultBranch && !b.startsWith('diego') && !b.startsWith('ana') && !b.startsWith('feature/header')) : [];
}

function studentPR(w: World, url = TIENDA_URL) {
  return srv(w, url)?.pulls.find((p) => p.author === 'estudiante');
}

function baseWorld(withClone = false): World {
  const w = createWorld();
  teamServer(w);
  if (withClone) {
    // El clon se hace en el propio escenario para practicar git clone.
  }
  return finalize(w);
}

export const SCENARIOS: Scenario[] = [
  {
    id: 's-individual',
    letter: 'A',
    title: 'Trabajo individual con ramas',
    summary: 'Clona el repositorio del equipo, trabaja en una rama personal y publica tus cambios.',
    cast: ['lead'],
    repoUrl: TIENDA_URL,
    xp: 50,
    setup: () => baseWorld(),
    steps: [
      {
        actor: 'lead',
        title: 'Bienvenida',
        instruction: 'Laura te da acceso al repositorio del equipo.',
        onEnter: () => [{ actor: 'lead', text: '¡Bienvenido al equipo! Clona https://github.com/equipo/tienda-web.git y crea tu rama personal para la nueva sección de ofertas. Nunca trabajes directamente en main.' }],
      },
      {
        actor: 'student',
        title: 'Clona el repositorio',
        instruction: 'Clona el repositorio en tu carpeta personal y entra en él.',
        validate: (w) => !!localRepo(w, 'tienda-web') && w.cwd.startsWith(join(HOME, 'tienda-web')),
        hints: ['git clone <url>', 'git clone https://github.com/equipo/tienda-web.git && cd tienda-web'],
      },
      {
        actor: 'student',
        title: 'Crea tu rama personal',
        instruction: 'Crea una rama con un nombre descriptivo (por ejemplo feature/ofertas o estudiante/ofertas) y cámbiate a ella.',
        validate: (w) => { const r = localRepo(w, 'tienda-web'); return !!r && r.head.kind === 'branch' && r.head.name !== 'main'; },
        hints: ['git switch -c feature/ofertas'],
      },
      {
        actor: 'student',
        title: 'Modifica archivos y crea commits',
        instruction: 'Crea ofertas.html y modifica index.html para enlazarla. Haz al menos un commit con un mensaje convencional (feat: ...).',
        validate: (w) => {
          const r = localRepo(w, 'tienda-web');
          if (!r || r.head.kind !== 'branch' || r.head.name === 'main') return false;
          const sha = r.heads[r.head.name];
          return !!sha && sha !== r.heads.main && 'ofertas.html' in getCommit(r, sha).tree;
        },
        hints: ['echo "<h1>Ofertas</h1>" > ofertas.html', 'git add . && git commit -m "feat: sección de ofertas"'],
      },
      {
        actor: 'student',
        title: 'Sube tu rama al remoto',
        instruction: 'Publica tu rama en GitHub y configura el upstream.',
        validate: (w) => personalBranches(w).length > 0,
        hints: ['git push -u origin <tu-rama>'],
      },
      {
        actor: 'lead',
        title: 'Cierre',
        instruction: 'Laura confirma que ve tu rama.',
        onEnter: (w) => [{ actor: 'lead', text: `Perfecto, ya veo la rama "${personalBranches(w)[0]}" en GitHub. El siguiente paso en un equipo real sería abrir un Pull Request (lo practicarás en el escenario C).` }],
      },
    ],
  },
  {
    id: 's-collab',
    letter: 'B',
    title: 'Colaboración entre desarrolladores',
    summary: 'Diego (frontend) y tú (backend) trabajáis a la vez en archivos distintos; los cambios se revisan y se integran en main.',
    cast: ['frontend', 'lead', 'reviewer'],
    repoUrl: TIENDA_URL,
    xp: 60,
    setup: () => {
      const w = baseWorld();
      return finalize(w);
    },
    steps: [
      {
        actor: 'student',
        title: 'Prepara tu copia local',
        instruction: 'Clona el repositorio del equipo y entra en la carpeta.',
        validate: (w) => !!localRepo(w, 'tienda-web') && w.cwd.startsWith(join(HOME, 'tienda-web')),
        hints: ['git clone https://github.com/equipo/tienda-web.git && cd tienda-web'],
      },
      {
        actor: 'frontend',
        title: 'Diego empieza su tarea',
        instruction: 'Diego crea su rama y sube un cambio en el encabezado (index.html).',
        onEnter: (w) => {
          const s = srv(w)!;
          serverCommit(w, s, { branch: 'feature/header', from: 'main', author: TEAM.frontend, message: 'feat: nuevo encabezado con logo', changes: { 'index.html': SAMPLE_FILES['index.html'].replace('<h1>Bienvenido a Mi Tienda</h1>', '<header><img src="logo.svg"><h1>Bienvenido a Mi Tienda</h1></header>') } });
          return [{ actor: 'frontend', text: 'Yo me encargo del encabezado. He subido feature/header con mis cambios en index.html.' }];
        },
      },
      {
        actor: 'student',
        title: 'Crea tu rama de backend',
        instruction: 'Crea tu propia rama (p. ej. feature/api-productos) y añade backend/productos.js con una función. Confirma el cambio.',
        validate: (w) => {
          const r = localRepo(w, 'tienda-web');
          if (!r || r.head.kind !== 'branch' || r.head.name === 'main') return false;
          return Object.keys(getCommit(r, r.heads[r.head.name]).tree).some((p) => p.startsWith('backend/'));
        },
        hints: ['git switch -c feature/api-productos', 'mkdir backend && echo "export function listar() { return []; }" > backend/productos.js', 'git add . && git commit -m "feat: API de productos"'],
      },
      {
        actor: 'student',
        title: 'Sube tu rama',
        instruction: 'Publica tu rama en GitHub.',
        validate: (w) => personalBranches(w).length > 0,
        hints: ['git push -u origin feature/api-productos'],
      },
      {
        actor: 'lead',
        title: 'Laura integra el trabajo de Diego',
        instruction: 'Laura revisa y fusiona el Pull Request de Diego en main.',
        onEnter: (w) => {
          const s = srv(w)!;
          const pr = openPullRequest(w, s, { title: 'Nuevo encabezado', body: 'Añade el logo en el header.', head: 'feature/header', author: TEAM.frontend.username });
          if ('error' in pr) return [{ actor: 'system', text: pr.error }];
          reviewPullRequest(w, s, pr.number, { author: TEAM.lead.username, state: 'approved', body: 'Se ve genial 👍' });
          mergePullRequest(w, s, pr.number, { by: TEAM.lead.username, method: 'merge' });
          return [
            { actor: 'frontend', text: `Abrí el PR #${pr.number} "Nuevo encabezado".` },
            { actor: 'lead', text: `Aprobado y fusionado #${pr.number} en main. Ahora main en GitHub tiene un commit que tú no tienes.` },
          ];
        },
      },
      {
        actor: 'student',
        title: 'Abre tu Pull Request',
        instruction: 'Abre un PR de tu rama hacia main (pestaña GitHub o gh pr create). Carlos lo revisará.',
        validate: (w) => !!studentPR(w),
        hints: ['gh pr create --title "API de productos" --body "Añade backend/productos.js"'],
      },
      {
        actor: 'student',
        title: 'Fusiona tras la aprobación',
        instruction: 'Cuando Carlos apruebe el PR, fusiónalo en main.',
        validate: (w) => studentPR(w)?.state === 'merged',
        hints: ['Botón "Merge pull request" en la pestaña GitHub, o gh pr merge <número>'],
      },
      {
        actor: 'student',
        title: 'Sincroniza tu repositorio local',
        instruction: 'Vuelve a main y descarga el resultado: deben aparecer TANTO el encabezado de Diego como tu backend.',
        validate: (w) => { const r = localRepo(w, 'tienda-web'); const s = srv(w); return !!r && !!s && r.head.kind === 'branch' && r.head.name === 'main' && r.heads.main === s.heads.main; },
        hints: ['git switch main && git pull'],
      },
    ],
    automate: (w) => {
      const s = srv(w);
      const pr = s && studentPR(w);
      if (!s || !pr || pr.state !== 'open' || pr.reviews.some((r) => r.author === TEAM.reviewer.username)) return [];
      reviewPullRequest(w, s, pr.number, { author: TEAM.reviewer.username, state: 'approved', body: 'Código limpio y en archivos separados del frontend. ¡Aprobado!' });
      return [{ actor: 'reviewer', text: `He revisado tu PR #${pr.number}: aprobado ✅. Como tocasteis archivos distintos, no habrá conflictos.` }];
    },
  },
  {
    id: 's-pr',
    letter: 'C',
    title: 'Pull Request con revisión de código',
    summary: 'Desarrolla una funcionalidad, recibe una solicitud de cambios del revisor, corrígela y fusiona.',
    cast: ['reviewer', 'lead'],
    repoUrl: TIENDA_URL,
    xp: 70,
    setup: () => {
      const w = createWorld();
      const s = teamServer(w);
      s.protectedBranches.main = { requirePullRequest: true, requiredApprovals: 1, allowForcePush: false };
      return finalize(w);
    },
    steps: [
      {
        actor: 'lead',
        title: 'La tarea',
        instruction: 'Laura te asigna el carrito de la compra.',
        onEnter: () => [{ actor: 'lead', text: 'Necesitamos un carrito (carrito.js). main está protegida: todo entra por Pull Request con 1 aprobación. ¡Suerte!' }],
      },
      {
        actor: 'student',
        title: 'Clona y crea la rama',
        instruction: 'Clona el repositorio, entra en él y crea la rama feature/carrito.',
        validate: (w) => { const r = localRepo(w, 'tienda-web'); return !!r && r.head.kind === 'branch' && r.head.name === 'feature/carrito'; },
        hints: ['git clone https://github.com/equipo/tienda-web.git && cd tienda-web', 'git switch -c feature/carrito'],
      },
      {
        actor: 'student',
        title: 'Desarrolla y publica',
        instruction: 'Crea carrito.js, haz commit y publica la rama.',
        validate: (w) => !!srv(w)?.heads['feature/carrito'] && 'carrito.js' in (srv(w)!.objects.commits[srv(w)!.heads['feature/carrito']]?.tree ?? {}),
        hints: ['echo "export const carrito = [];" > carrito.js', 'git add carrito.js && git commit -m "feat: carrito de la compra" && git push -u origin feature/carrito'],
      },
      {
        actor: 'student',
        title: 'Abre el Pull Request',
        instruction: 'Abre un PR de feature/carrito hacia main.',
        validate: (w) => !!studentPR(w),
        hints: ['Pestaña GitHub → Pull requests → New, o gh pr create --title "Carrito" --body "..."'],
      },
      {
        actor: 'student',
        title: 'Atiende la revisión',
        instruction: 'Carlos ha pedido cambios: lee su comentario y sube un nuevo commit a la MISMA rama para atenderlo.',
        validate: (w) => {
          const pr = studentPR(w);
          const s = srv(w);
          if (!pr || !s) return false;
          const head = prHeadSha(w, s, pr);
          return !!head && Object.keys(s.objects.commits[head].tree).some((p) => /^tests?\//.test(p));
        },
        hints: ['Carlos pidió pruebas: crea tests/carrito.test.js', 'git add . && git commit -m "test: pruebas del carrito" && git push'],
      },
      {
        actor: 'student',
        title: 'Fusiona el Pull Request',
        instruction: 'Con la aprobación de Carlos, fusiona el PR.',
        validate: (w) => studentPR(w)?.state === 'merged',
        hints: ['Botón "Merge pull request" o gh pr merge'],
      },
      {
        actor: 'student',
        title: 'Actualiza tu main local',
        instruction: 'Cámbiate a main y sincronízala con GitHub.',
        validate: (w) => { const r = localRepo(w, 'tienda-web'); const s = srv(w); return !!r && !!s && r.heads.main === s.heads.main && r.head.kind === 'branch' && r.head.name === 'main'; },
        hints: ['git switch main && git pull'],
      },
    ],
    automate: (w) => {
      const s = srv(w);
      const pr = s && studentPR(w);
      if (!s || !pr || pr.state !== 'open') return [];
      const head = prHeadSha(w, s, pr);
      const hasTests = !!head && Object.keys(s.objects.commits[head].tree).some((p) => /^tests?\//.test(p));
      const byCarlos = pr.reviews.filter((r) => r.author === TEAM.reviewer.username);
      if (!byCarlos.length && !hasTests) {
        reviewPullRequest(w, s, pr.number, { author: TEAM.reviewer.username, state: 'changes_requested', body: 'Buen comienzo, pero falta cubrir el carrito con pruebas. Añade un archivo en tests/ antes de fusionar, por favor.' });
        return [{ actor: 'reviewer', text: `Solicité cambios en el PR #${pr.number}: faltan pruebas (carpeta tests/).` }];
      }
      if (hasTests && !byCarlos.some((r) => r.state === 'approved' && r.commit === head)) {
        reviewPullRequest(w, s, pr.number, { author: TEAM.reviewer.username, state: 'approved', body: '¡Gracias por añadir las pruebas! Aprobado.' });
        return [{ actor: 'reviewer', text: `Vi tu nuevo commit con pruebas. PR #${pr.number} aprobado ✅` }];
      }
      return [];
    },
  },
  {
    id: 's-conflict',
    letter: 'D',
    title: 'Conflicto de colaboración',
    summary: 'Diego y tú modificáis las mismas líneas de styles.css. Él sube primero; tú debes integrar y resolver.',
    cast: ['frontend'],
    repoUrl: TIENDA_URL,
    xp: 70,
    setup: () => baseWorld(),
    steps: [
      {
        actor: 'student',
        title: 'Clona el repositorio',
        instruction: 'Clona el repositorio y entra en la carpeta.',
        validate: (w) => !!localRepo(w, 'tienda-web') && w.cwd.startsWith(join(HOME, 'tienda-web')),
        hints: ['git clone https://github.com/equipo/tienda-web.git && cd tienda-web'],
      },
      {
        actor: 'student',
        title: 'Cambia el color del título',
        instruction: 'En styles.css cambia el color de h1 a "green" y haz commit en main (sin subirlo todavía).',
        validate: (w) => { const r = localRepo(w, 'tienda-web'); if (!r) return false; const t = getCommit(r, r.heads.main).tree; return !!t['styles.css'] && r.objects.blobs[t['styles.css']].includes('green'); },
        hints: ['Abre styles.css en el editor y cambia la línea color del h1.', 'git commit -am "style: título verde"'],
      },
      {
        actor: 'frontend',
        title: 'Diego se adelanta',
        instruction: 'Diego cambió la misma línea y ya lo subió.',
        onEnter: (w) => {
          const s = srv(w)!;
          const css = s.objects.blobs[s.objects.commits[s.heads.main].tree['styles.css']];
          serverCommit(w, s, { branch: 'main', author: TEAM.frontend, message: 'style: título en morado corporativo', changes: { 'styles.css': css.replace(/(h1 \{\n\s*color: )[^;]+;/, '$1purple;') } });
          return [{ actor: 'frontend', text: 'He cambiado el color del h1 a morado (purple), es el color corporativo. Ya está en main.' }];
        },
      },
      {
        actor: 'student',
        title: 'Intenta subir tus cambios',
        instruction: 'Haz git push y observa qué responde GitHub.',
        validate: (_w, log) => log.some((r) => r.command === 'git push' && !r.ok),
        hints: ['git push'],
      },
      {
        actor: 'student',
        title: 'Integra y detecta el conflicto',
        instruction: 'Descarga e integra los cambios de Diego. Git te avisará del conflicto.',
        validate: (w, log) => used(log, 'git pull', false) && (!!localRepo(w, 'tienda-web')?.operation || used(log, 'git merge', false)),
        hints: ['git pull'],
      },
      {
        actor: 'student',
        title: 'Resuelve el conflicto',
        instruction: 'Decide el color final (acordad "purple", el corporativo, o el que elijas), elimina los marcadores, marca como resuelto y completa el merge.',
        validate: (w) => { const r = localRepo(w, 'tienda-web'); return !!r && !r.operation && cleanTree(w, r) && getCommit(r, r.heads.main).parents.length === 2; },
        hints: ['Edita styles.css (o git mergetool) y deja una sola versión.', 'git add styles.css && git commit -m "Merge: resuelve color del título"'],
      },
      {
        actor: 'student',
        title: 'Completa la integración',
        instruction: 'Sube el resultado a GitHub.',
        validate: (w) => { const r = localRepo(w, 'tienda-web'); const s = srv(w); return !!r && !!s && s.heads.main === r.heads.main; },
        hints: ['git push'],
      },
      {
        actor: 'frontend',
        title: 'Diego confirma',
        instruction: '',
        onEnter: () => [{ actor: 'frontend', text: '¡Visto! La próxima vez avisamos en el canal antes de tocar los estilos globales 😅' }],
      },
    ],
  },
  {
    id: 's-group',
    letter: 'E',
    title: 'Proyecto grupal',
    summary: 'Proyecto con módulos compradores, productos-catalogo, pedidos, frontend y backend. Trabajas en tu rama personal mientras el resto del equipo avanza.',
    cast: ['lead', 'frontend', 'backend', 'reviewer'],
    repoUrl: PROJ_URL,
    xp: 90,
    setup: () => {
      const w = createWorld();
      const s = createServerRepo(w, {
        owner: 'equipo',
        name: 'proyecto-grupal',
        description: 'Marketplace del curso: proyecto en equipo',
        author: TEAM.lead,
        files: {
          'README.md': '# Proyecto grupal: Marketplace\n\n## Módulos\n\n- compradores/\n- productos-catalogo/\n- pedidos/\n- frontend/\n- backend/\n\n## Normas\n\n- Rama personal: usuario/tema\n- Conventional Commits\n- Todo entra por Pull Request\n',
          'compradores/compradores.js': 'export const compradores = [];\n',
          'productos-catalogo/catalogo.js': 'export const catalogo = [];\n',
          'pedidos/pedidos.js': 'export const pedidos = [];\n',
          'frontend/index.html': '<h1>Marketplace</h1>\n',
          'backend/server.js': "console.log('API');\n",
        },
      });
      s.protectedBranches.main = { requirePullRequest: true, requiredApprovals: 1, allowForcePush: false };
      return finalize(w);
    },
    steps: [
      {
        actor: 'lead',
        title: 'Reparto de tareas',
        instruction: 'Laura reparte el trabajo.',
        onEnter: () => [
          { actor: 'lead', text: 'Reparto: Diego → frontend/, Ana → backend/ y compradores/, y tú → pedidos/ y productos-catalogo/. Rama personal con formato usuario/tema.' },
          { actor: 'lead', text: 'Repo: https://github.com/equipo/proyecto-grupal.git (main protegida, 1 aprobación).' },
        ],
      },
      {
        actor: 'student',
        title: 'Clona y crea tu rama personal',
        instruction: 'Clona el proyecto y crea una rama con formato usuario/tema (p. ej. estudiante/pedidos).',
        validate: (w) => { const r = localRepo(w, 'proyecto-grupal'); return !!r && r.head.kind === 'branch' && /^[\w-]+\/[\w-]+$/.test(r.head.name) && r.head.name !== 'main'; },
        hints: ['git clone https://github.com/equipo/proyecto-grupal.git && cd proyecto-grupal', 'git switch -c estudiante/pedidos'],
      },
      {
        actor: 'backend',
        title: 'Ana avanza',
        instruction: 'Ana sube su trabajo de compradores directamente mediante un PR ya aprobado.',
        onEnter: (w) => {
          const s = srv(w, PROJ_URL)!;
          serverCommit(w, s, { branch: 'ana/compradores', from: 'main', author: TEAM.backend, message: 'feat(compradores): registro de compradores', changes: { 'compradores/compradores.js': 'export const compradores = [];\nexport function registrar(c) { compradores.push(c); }\n' } });
          const pr = openPullRequest(w, s, { title: 'Registro de compradores', head: 'ana/compradores', author: TEAM.backend.username });
          if ('error' in pr) return [];
          reviewPullRequest(w, s, pr.number, { author: TEAM.reviewer.username, state: 'approved', body: 'OK' });
          mergePullRequest(w, s, pr.number, { by: TEAM.backend.username, method: 'merge' });
          return [{ actor: 'backend', text: `Fusionado PR #${pr.number}: registro de compradores. main avanza.` }];
        },
      },
      {
        actor: 'student',
        title: 'Trabaja en tus módulos',
        instruction: 'Modifica pedidos/pedidos.js y productos-catalogo/catalogo.js. Haz al menos un commit por módulo con Conventional Commits (feat(pedidos): ...).',
        validate: (w) => {
          const r = localRepo(w, 'proyecto-grupal');
          if (!r || r.head.kind !== 'branch' || r.head.name === 'main') return false;
          const t = getCommit(r, r.heads[r.head.name]).tree;
          const base = getCommit(r, r.remoteRefs['origin/main'] ?? r.heads.main).tree;
          return t['pedidos/pedidos.js'] !== base['pedidos/pedidos.js'] && t['productos-catalogo/catalogo.js'] !== base['productos-catalogo/catalogo.js'];
        },
        hints: ['Edita los archivos con el editor del explorador.', 'git add pedidos && git commit -m "feat(pedidos): crear pedido"', 'git add productos-catalogo && git commit -m "feat(catalogo): listar productos"'],
      },
      {
        actor: 'frontend',
        title: 'Diego también sube cambios',
        instruction: 'Diego fusiona su trabajo en frontend/.',
        onEnter: (w) => {
          const s = srv(w, PROJ_URL)!;
          serverCommit(w, s, { branch: 'diego/frontend', from: 'main', author: TEAM.frontend, message: 'feat(frontend): listado de productos', changes: { 'frontend/index.html': '<h1>Marketplace</h1>\n<section id="productos"></section>\n' } });
          const pr = openPullRequest(w, s, { title: 'Listado en el frontend', head: 'diego/frontend', author: TEAM.frontend.username });
          if ('error' in pr) return [];
          reviewPullRequest(w, s, pr.number, { author: TEAM.reviewer.username, state: 'approved', body: 'LGTM' });
          mergePullRequest(w, s, pr.number, { by: TEAM.frontend.username, method: 'merge' });
          return [{ actor: 'frontend', text: `PR #${pr.number} fusionado: listado de productos en el frontend.` }];
        },
      },
      {
        actor: 'student',
        title: 'Publica tu rama y abre el PR',
        instruction: 'Sube tu rama y abre un Pull Request hacia main describiendo tus cambios.',
        validate: (w) => !!studentPR(w, PROJ_URL),
        hints: ['git push -u origin <tu-rama>', 'gh pr create --title "Pedidos y catálogo" --body "..."'],
      },
      {
        actor: 'student',
        title: 'Fusiona tras la revisión',
        instruction: 'Carlos revisará tu PR. Cuando esté aprobado, fusiónalo.',
        validate: (w) => studentPR(w, PROJ_URL)?.state === 'merged',
        hints: ['Botón Merge en la pestaña GitHub o gh pr merge'],
      },
      {
        actor: 'student',
        title: 'Sincroniza y comprueba el resultado',
        instruction: 'Actualiza tu main local: debe contener el trabajo de Ana, Diego y el tuyo.',
        validate: (w) => { const r = localRepo(w, 'proyecto-grupal'); const s = srv(w, PROJ_URL); return !!r && !!s && r.heads.main === s.heads.main && findRepo(w) === r; },
        hints: ['git switch main && git pull', 'git log --oneline --graph para ver la integración'],
      },
    ],
    automate: (w) => {
      const s = srv(w, PROJ_URL);
      const pr = s && studentPR(w, PROJ_URL);
      if (!s || !pr || pr.state !== 'open' || pr.reviews.some((r) => r.author === TEAM.reviewer.username)) return [];
      const conventional = Object.values(s.objects.commits).filter((c) => c.author.email === 'estudiante@example.com').every((c) => /^(feat|fix|docs|refactor|test|chore|style|perf)(\(.+\))?!?: /.test(c.message) || c.message.startsWith('Merge'));
      reviewPullRequest(w, s, pr.number, {
        author: TEAM.reviewer.username,
        state: 'approved',
        body: conventional ? 'Cambios bien separados por módulo y mensajes convencionales. Aprobado.' : 'Aprobado, aunque recuerda usar Conventional Commits (feat(pedidos): ...) en los mensajes.',
      });
      return [{ actor: 'reviewer', text: `Revisé tu PR #${pr.number}: aprobado ✅${conventional ? '' : ' (ojo con el formato de los mensajes de commit)'}` }];
    },
  },
];

export function scenarioById(id: string) {
  return SCENARIOS.find((s) => s.id === id);
}
