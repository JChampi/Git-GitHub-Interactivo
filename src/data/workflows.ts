/**
 * Workflows profesionales definidos como secuencias de comandos reales: cada
 * paso se ejecuta sobre el motor para dibujar el grafo resultante.
 */
import type { World } from '../engine/types';
import { getServer, reviewPullRequest } from '../engine/server';
import { createServerRepo } from '../engine/server';
import { createWorld, run, runAs, TEAM, writeFiles } from '../engine/world';
import { P } from '../labs/presets';

export interface WorkflowStep {
  title: string;
  explain: string;
  commands: string[];
  /** Acción no expresable como comando (p. ej. revisión de un compañero). */
  action?: (w: World) => void;
  actionLabel?: string;
}

export interface Workflow {
  id: string;
  name: string;
  summary: string;
  setup: () => World;
  steps: WorkflowStep[];
  pros: string[];
  cons: string[];
  when: string[];
}

function base(withRemote = false): World {
  let w = createWorld({ dirs: ['proyecto'], cwd: 'proyecto', deterministic: true });
  if (withRemote) createServerRepo(w, { owner: 'equipo', name: 'proyecto', author: TEAM.lead });
  writeFiles(w, P(), { 'README.md': '# Proyecto\n', 'app.js': "console.log('v1');\n" });
  w = run(w, ['git init', 'git add .', 'git commit -m "chore: proyecto inicial"']);
  if (withRemote) {
    w = run(w, ['git remote add origin https://github.com/equipo/proyecto.git', 'git push -u origin main']);
    getServer(w, 'https://github.com/equipo/proyecto.git')!.protectedBranches.main = { requirePullRequest: true, requiredApprovals: 1, allowForcePush: false };
  }
  return w;
}

export const WORKFLOWS: Workflow[] = [
  {
    id: 'github-flow',
    name: 'GitHub Flow',
    summary: 'Una sola rama de larga duración (main), siempre desplegable. Cada cambio vive en una rama corta que entra por Pull Request.',
    setup: () => base(true),
    steps: [
      { title: 'Punto de partida', explain: 'main está protegida y siempre lista para producción. Antes de empezar, sincroniza: git pull.', commands: ['git pull'] },
      { title: 'Crear rama', explain: 'Una rama por tarea, con un nombre descriptivo, creada desde main actualizada.', commands: ['git switch -c feature/buscador'] },
      { title: 'Desarrollar la funcionalidad', explain: 'Escribes el código en tu rama, sin afectar a nadie.', commands: ['echo "export function buscar(q) {}" > buscador.js'] },
      { title: 'Realizar commits', explain: 'Commits pequeños y descriptivos.', commands: ['git add buscador.js', 'git commit -m "feat: estructura del buscador"', 'echo "// filtrar resultados" >> buscador.js', 'git commit -am "feat: filtrado de resultados"'] },
      { title: 'Subir cambios', explain: 'Publicas la rama en GitHub. Puedes hacerlo pronto para compartir el avance.', commands: ['git push -u origin feature/buscador'] },
      { title: 'Abrir Pull Request', explain: 'Propones integrar la rama en main; se ejecutan los checks y se notifica a los revisores.', commands: ['gh pr create --title "Buscador de productos" --body "Closes #12"'] },
      {
        title: 'Revisar',
        explain: 'Un compañero revisa el código y lo aprueba (o pide cambios, que añadirías con más commits en la misma rama).',
        commands: [],
        actionLabel: 'Carlos aprueba el PR',
        action: (w) => {
          const s = getServer(w, 'https://github.com/equipo/proyecto.git')!;
          reviewPullRequest(w, s, s.pulls[0].number, { author: TEAM.reviewer.username, state: 'approved', body: 'LGTM' });
        },
      },
      { title: 'Aprobar y fusionar', explain: 'Con la aprobación, se fusiona en main (en GitHub) y se borra la rama. main se despliega.', commands: ['gh pr merge 1 --delete-branch', 'git switch main', 'git pull', 'git branch -d feature/buscador'] },
    ],
    pros: ['Muy simple: una sola rama principal.', 'Integración y despliegue continuos.', 'Encaja perfecto con Pull Requests y CI.'],
    cons: ['Exige buena cobertura de tests y CI fiable.', 'No gestiona varias versiones en producción a la vez.'],
    when: ['Aplicaciones web y SaaS con despliegue continuo.', 'Equipos pequeños o medianos.', 'Proyectos open source en GitHub.'],
  },
  {
    id: 'git-flow',
    name: 'Git Flow',
    summary: 'Dos ramas permanentes (main = producción, develop = integración) y ramas de apoyo: feature, release y hotfix.',
    setup: () => base(false),
    steps: [
      { title: 'main y develop', explain: 'main solo contiene versiones publicadas; develop acumula el trabajo terminado para la próxima versión.', commands: ['git tag -a v0.1.0 -m "Versión inicial"', 'git switch -c develop'] },
      { title: 'Rama feature', explain: 'Cada funcionalidad sale de develop y vuelve a develop.', commands: ['git switch -c feature/carrito develop', 'echo "export const carrito = [];" > carrito.js', 'git add .', 'git commit -m "feat: carrito"'] },
      { title: 'Integrar la feature', explain: 'Se fusiona en develop con --no-ff para conservar el "grupo" de commits.', commands: ['git switch develop', 'git merge --no-ff feature/carrito -m "Merge feature/carrito into develop"', 'git branch -d feature/carrito'] },
      { title: 'Rama release', explain: 'Cuando develop tiene lo necesario, se crea release/x.y para estabilizar (solo correcciones y versión).', commands: ['git switch -c release/1.0 develop', 'echo "1.0.0" > VERSION', 'git add .', 'git commit -m "chore: versión 1.0.0"'] },
      { title: 'Publicar la release', explain: 'release se fusiona en main, se etiqueta, y vuelve a develop para no perder las correcciones.', commands: ['git switch main', 'git merge --no-ff release/1.0 -m "Release 1.0"', 'git tag -a v1.0.0 -m "Versión 1.0.0"', 'git switch develop', 'git merge --no-ff release/1.0 -m "Merge release/1.0 into develop"', 'git branch -d release/1.0'] },
      { title: 'Hotfix', explain: 'Un error urgente en producción se corrige en hotfix/ desde main.', commands: ['git switch -c hotfix/1.0.1 main', 'echo "export const carrito = []; // fix" > carrito.js', 'git commit -am "fix: carrito vacío en producción"'] },
      { title: 'Cerrar el hotfix', explain: 'Se fusiona en main (nueva etiqueta) y también en develop.', commands: ['git switch main', 'git merge --no-ff hotfix/1.0.1 -m "Hotfix 1.0.1"', 'git tag -a v1.0.1 -m "Versión 1.0.1"', 'git switch develop', 'git merge --no-ff hotfix/1.0.1 -m "Merge hotfix/1.0.1 into develop"', 'git branch -d hotfix/1.0.1'] },
    ],
    pros: ['Estructura clara para versiones planificadas.', 'Permite mantener producción estable mientras se desarrolla.', 'Hotfixes sin arrastrar trabajo a medias.'],
    cons: ['Más ramas y más merges: más complejidad.', 'Ramas de larga duración → integraciones tardías y conflictos.', 'Poco adecuado para despliegue continuo.'],
    when: ['Software con versiones numeradas (apps móviles, librerías, productos instalables).', 'Varias versiones en mantenimiento.', 'Equipos con ciclos de release formales.'],
  },
  {
    id: 'trunk',
    name: 'Trunk-Based Development',
    summary: 'Todos integran en la rama principal (trunk) muy a menudo, con cambios pequeños y ramas de vida muy corta (horas).',
    setup: () => base(false),
    steps: [
      { title: 'Rama principal', explain: 'main es el "tronco". Todo el mundo parte de ella y vuelve a ella en el mismo día.', commands: [] },
      { title: 'Cambio pequeño', explain: 'Ana hace un cambio mínimo en una rama de corta duración y lo integra enseguida.', commands: ['git switch -c ana/validar-email', 'echo "export const validar = (e) => e.includes(\'@\');" > validar.js', 'git add .', 'git commit -m "feat: validación de email"', 'git switch main', 'git merge ana/validar-email', 'git branch -d ana/validar-email'] },
      { title: 'Integración frecuente', explain: 'Diego integra otro cambio pequeño poco después. La historia sigue casi lineal.', commands: ['git switch -c diego/boton', 'echo "<button>Comprar</button>" > boton.html', 'git add .', 'git commit -m "feat: botón comprar (oculto tras flag)"', 'git switch main', 'git merge diego/boton', 'git branch -d diego/boton'] },
      { title: 'Feature flags', explain: 'Las funcionalidades incompletas se integran desactivadas con un "interruptor", en lugar de esperar en una rama larga.', commands: ['echo "export const FLAGS = { nuevoCheckout: false };" > flags.js', 'git add .', 'git commit -m "chore: feature flag del nuevo checkout"'] },
      { title: 'Ramas de corta duración', explain: 'Incluso con revisión, las ramas viven horas, no semanas. Menos divergencia → casi sin conflictos.', commands: ['git switch -c ana/ajuste', 'echo "// ajuste" >> validar.js', 'git commit -am "refactor: simplifica validación"', 'git switch main', 'git merge --no-ff ana/ajuste -m "Merge ana/ajuste"', 'git branch -d ana/ajuste'] },
    ],
    pros: ['Integración continua real: conflictos pequeños y raros.', 'Historia simple.', 'Ideal para despliegue continuo.'],
    cons: ['Requiere tests automáticos muy sólidos y CI rápido.', 'Necesita disciplina y feature flags.', 'Difícil para equipos poco experimentados.'],
    when: ['Equipos maduros con CI/CD.', 'Empresas que despliegan varias veces al día.', 'Monorepos grandes.'],
  },
];

export function buildStep(wf: Workflow, upTo: number): { world: World; outputs: string[] } {
  let w = wf.setup();
  const outputs: string[] = [];
  for (let i = 0; i <= upTo; i++) {
    const step = wf.steps[i];
    if (step.commands.length) w = runAs(w, i % 2 && wf.id === 'trunk' ? TEAM.frontend : { name: 'Estudiante', email: 'estudiante@example.com' }, step.commands);
    step.action?.(w);
    if (i === upTo) outputs.push(...step.commands);
  }
  return { world: w, outputs };
}
