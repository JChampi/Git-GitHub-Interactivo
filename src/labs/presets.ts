/**
 * Mundos iniciales de los laboratorios. Todos se construyen ejecutando
 * comandos reales del motor, así el historial es coherente.
 */
import { createServerRepo, serverCommit, personFor } from '../engine/server';
import type { World } from '../engine/types';
import { HOME, SAMPLE_FILES, TEAM, createWorld, finalize, run, runAs, writeFiles } from '../engine/world';
import { join } from '../engine/vfs';

export const P = (sub = 'proyecto') => join(HOME, sub);

/** Carpeta ~/proyecto vacía, sin repositorio. */
export function emptyProject(sub = 'proyecto'): World {
  return finalize(createWorld({ dirs: [sub], cwd: sub }));
}

/** ~/proyecto con los archivos de ejemplo, sin inicializar. */
export function sampleFilesOnly(): World {
  const w = createWorld({ dirs: ['proyecto'], cwd: 'proyecto' });
  writeFiles(w, P(), SAMPLE_FILES);
  return finalize(w);
}

/** Repositorio con los archivos de ejemplo en un primer commit. */
export function sampleRepo(extraCommits = false): World {
  let w = createWorld({ dirs: ['proyecto'], cwd: 'proyecto' });
  writeFiles(w, P(), SAMPLE_FILES);
  w = run(w, ['git init', 'git add .', 'git commit -m "Primera versión de la tienda"']);
  if (extraCommits) {
    w = run(w, [
      'echo -e "\\n## Autores\\n\\n- Estudiante" >> README.md',
      'git commit -am "docs: añade sección de autores"',
    ]);
  }
  return w;
}

export function fundamentalsWorld(): World {
  let w = createWorld({ dirs: ['proyecto'], cwd: 'proyecto' });
  writeFiles(w, P(), { 'README.md': SAMPLE_FILES['README.md'], 'app.js': SAMPLE_FILES['app.js'] });
  w = run(w, ['git init', 'git add .', 'git commit -m "Primer commit"']);
  writeFiles(w, P(), { 'styles.css': SAMPLE_FILES['styles.css'] });
  return finalize(w);
}

/** Repositorio con archivos en todos los estados posibles. */
export function reposWorld(): World {
  let w = sampleRepo(true);
  w = run(w, [
    'echo "// TODO: añadir carrito" >> app.js',
    'git add app.js',
    'echo "h1 { color: tomato; }" >> styles.css',
    'echo "Ideas para la tienda" > notas.txt',
    'mkdir -p img',
    'touch img/.gitkeep',
  ]);
  return finalize(w);
}

/** Historial con varios autores y mensajes convencionales. */
export function historyWorld(): World {
  let w = createWorld({ dirs: ['proyecto'], cwd: 'proyecto' });
  writeFiles(w, P(), { 'README.md': '# API de Pedidos\n' });
  w = runAs(w, TEAM.lead, ['git init', 'git add .', 'git commit -m "chore: estructura inicial del proyecto"']);
  w = runAs(w, TEAM.backend, [
    'mkdir -p src',
    'echo "export const pedidos = [];" > src/pedidos.js',
    'git add .',
    'git commit -m "feat: módulo de pedidos"',
  ]);
  w = runAs(w, TEAM.frontend, [
    'echo "<h1>Pedidos</h1>" > index.html',
    'git add .',
    'git commit -m "feat: página principal de pedidos"',
  ]);
  w = runAs(w, TEAM.backend, [
    'echo -e "export const pedidos = [];\\nexport function crear(p) { pedidos.push(p); }" > src/pedidos.js',
    'git commit -am "feat: función para crear pedidos"',
  ]);
  w = runAs(w, TEAM.lead, [
    'echo -e "# API de Pedidos\\n\\nServicio para gestionar pedidos de la tienda." > README.md',
    'git commit -am "docs: describe el proyecto en el README"',
    'git tag -a v0.1.0 -m "Primera versión interna"',
  ]);
  w = runAs(w, TEAM.frontend, [
    'echo -e "<h1>Pedidos</h1>\\n<ul id=\\"lista\\"></ul>" > index.html',
    'git commit -am "fix: contenedor de la lista de pedidos"',
  ]);
  return finalize(w);
}

export function branchesWorld(): World {
  let w = createWorld({ dirs: ['proyecto'], cwd: 'proyecto' });
  writeFiles(w, P(), { 'README.md': '# Proyecto de ramas\n', 'app.js': "console.log('v1');\n" });
  w = run(w, ['git init', 'git add .', 'git commit -m "Commit inicial"', 'echo "## Uso" >> README.md', 'git commit -am "docs: sección de uso"']);
  return finalize(w);
}

export function undoWorld(): World {
  let w = createWorld({ dirs: ['proyecto'], cwd: 'proyecto' });
  writeFiles(w, P(), { 'README.md': '# Deshacer cambios\n', 'config.js': 'export const DEBUG = false;\n', 'app.js': "import { DEBUG } from './config.js';\n" });
  w = run(w, [
    'git init',
    'git add .',
    'git commit -m "Versión estable"',
    'echo "export function sumar(a, b) { return a + b; }" > math.js',
    'git add math.js',
    'git commit -m "feat: función sumar"',
    'echo "export function restar(a, b) { return a + b; } // BUG" > resta.js',
    'git add resta.js',
    'git commit -m "feat: función restar (con un bug)"',
  ]);
  return finalize(w);
}

const REMOTE = 'https://github.com/equipo/tienda-web.git';

export function teamServer(w: World, name = 'tienda-web') {
  const server = createServerRepo(w, {
    owner: 'equipo',
    name,
    description: 'Tienda web del equipo (repositorio de práctica)',
    files: { ...SAMPLE_FILES },
    author: TEAM.lead,
  });
  serverCommit(w, server, { branch: 'main', author: TEAM.frontend, message: 'style: colores corporativos', changes: { 'styles.css': SAMPLE_FILES['styles.css'].replace('#333', '#0b5fff') } });
  server.collaborators.push(
    { username: TEAM.lead.username, role: 'admin', status: 'active' },
    { username: TEAM.frontend.username, role: 'write', status: 'active' },
    { username: TEAM.backend.username, role: 'write', status: 'active' },
    { username: TEAM.reviewer.username, role: 'write', status: 'active' },
    { username: 'estudiante', role: 'write', status: 'active' },
  );
  server.stars = 12;
  return server;
}

/** Repositorio remoto del equipo clonado en ~/tienda-web. */
export function remoteWorld(): World {
  let w = createWorld();
  teamServer(w);
  w = run(w, [`git clone ${REMOTE}`, 'cd tienda-web']);
  return finalize(w);
}

/** Proyecto local sin publicar + repositorios públicos de otras personas. */
export function githubWorld(): World {
  let w = createWorld({ dirs: ['mi-portfolio'], cwd: 'mi-portfolio' });
  writeFiles(w, join(HOME, 'mi-portfolio'), {
    'index.html': '<!DOCTYPE html>\n<html>\n<head><title>Mi portfolio</title></head>\n<body>\n  <h1>Hola, soy estudiante</h1>\n  <p>Aprendiendo Git y GitHub.</p>\n</body>\n</html>\n',
    'README.md': '# Mi portfolio\n\nSitio personal publicado con GitHub Pages.\n',
  });
  w = run(w, ['git init', 'git add .', 'git commit -m "feat: primera versión del portfolio"']);
  const oss = createServerRepo(w, {
    owner: 'open-source-org',
    name: 'awesome-git',
    description: 'Lista colaborativa de recursos para aprender Git',
    files: { 'README.md': '# Awesome Git\n\nRecursos para aprender Git.\n\n## Recursos\n\n- Pro Git (libro)\n- Documentación oficial\n', 'CONTRIBUTING.md': '# Cómo contribuir\n\n1. Haz un fork\n2. Crea una rama\n3. Abre un Pull Request\n' },
    author: personFor('octo-maintainer'),
  });
  oss.stars = 1520;
  oss.forks = 210;
  oss.topics = ['git', 'learning', 'awesome-list'];
  return finalize(w);
}

/** Tres desarrolladores con su propio clon del repositorio central. */
export function collabWorld(): World {
  let w = createWorld();
  const server = createServerRepo(w, {
    owner: 'equipo',
    name: 'app-equipo',
    description: 'Repositorio central del equipo',
    files: { 'README.md': '# App del equipo\n', 'frontend/index.html': '<h1>App</h1>\n', 'backend/server.js': "console.log('API');\n" },
    author: TEAM.lead,
  });
  server.collaborators.push(
    { username: 'dev-a', role: 'write', status: 'active' },
    { username: 'dev-b', role: 'write', status: 'active' },
    { username: 'dev-c', role: 'write', status: 'active' },
    { username: 'estudiante', role: 'write', status: 'active' },
  );
  const url = 'https://github.com/equipo/app-equipo.git';
  w = run(w, [`git clone ${url} dev-a`, `git clone ${url} dev-b`, `git clone ${url} dev-c`]);
  w = run(w, [
    'cd dev-a',
    'git config user.name "Desarrollador A"',
    'git config user.email "dev-a@equipo.dev"',
    'cd ../dev-b',
    'git config user.name "Desarrollador B"',
    'git config user.email "dev-b@equipo.dev"',
    'cd ../dev-c',
    'git config user.name "Desarrollador C"',
    'git config user.email "dev-c@equipo.dev"',
    'cd ../dev-a',
  ]);
  return finalize(w);
}

/** Conflicto clásico: dos ramas modifican la misma línea. */
export function conflictWorld(original?: string, versionA?: string, versionB?: string): World {
  const base = original ?? 'const titulo = "Tienda";\nconst precio = 10;\nconst moneda = "EUR";\n';
  const a = versionA ?? 'const titulo = "Tienda Online";\nconst precio = 10;\nconst moneda = "EUR";\n';
  const b = versionB ?? 'const titulo = "Mi Super Tienda";\nconst precio = 10;\nconst moneda = "USD";\n';
  let w = createWorld({ dirs: ['proyecto'], cwd: 'proyecto' });
  writeFiles(w, P(), { 'config.js': base });
  w = run(w, ['git init', 'git add .', 'git commit -m "Versión original"']);
  w = run(w, ['git switch -c feature/desarrollador-b']);
  writeFiles(w, P(), { 'config.js': b });
  w = runAs(w, { name: 'Desarrollador B', email: 'b@equipo.dev' }, ['git commit -am "Cambios del desarrollador B"']);
  w = run(w, ['git switch main']);
  writeFiles(w, P(), { 'config.js': a });
  w = runAs(w, { name: 'Desarrollador A', email: 'a@equipo.dev' }, ['git commit -am "Cambios del desarrollador A"']);
  return finalize(w);
}

export function filesWorld(): World {
  let w = createWorld({ dirs: ['proyecto'], cwd: 'proyecto' });
  writeFiles(w, P(), {
    'README.md': '# Proyecto Node\n',
    'package.json': '{\n  "name": "proyecto",\n  "version": "1.0.0"\n}\n',
    'src/index.js': "console.log('hola');\n",
    'node_modules/express/index.js': '// dependencia (¡no se versiona!)\n',
    'node_modules/express/package.json': '{ "name": "express" }\n',
    '.env': 'DB_PASSWORD=supersecreta\nAPI_KEY=123456\n',
    'dist/bundle.js': '/* código generado */\n',
    'logs/app.log': 'error de prueba\n',
    'debug.log': 'depuración\n',
  });
  w = run(w, ['git init']);
  return finalize(w);
}

export { REMOTE };
