/**
 * Creación de mundos (estado inicial de cada laboratorio).
 * Los escenarios se construyen ejecutando comandos reales del simulador,
 * de modo que su historial es coherente con el motor.
 */
import { execute } from './shell';
import { createServerRepo, serverCommit, personFor, type CreateRepoOptions } from './server';
import type { Person, RemoteServer, World } from './types';
import { createFS, mkdirp, writeFile, join } from './vfs';
import { linesToText } from './output';

export const HOME = '/home/estudiante';

export interface WorldOptions {
  identity?: boolean;
  deterministic?: boolean;
  dirs?: string[];
  cwd?: string;
}

export function createWorld(opts: WorldOptions = {}): World {
  const fs = createFS();
  mkdirp(fs, HOME);
  for (const d of opts.dirs ?? []) mkdirp(fs, join(HOME, d));
  const world: World = {
    fs,
    cwd: opts.cwd ? join(HOME, opts.cwd) : HOME,
    home: HOME,
    repos: {},
    servers: {},
    globalConfig: {
      'init.defaultBranch': 'main',
      'pull.rebase': 'false',
    },
    githubUser: 'estudiante',
    clock: opts.deterministic ? Date.UTC(2026, 0, 1, 9, 0, 0) : Date.now() - 1000 * 60 * 60 * 24 * 3,
    deterministicClock: true,
  };
  if (opts.identity !== false) {
    world.globalConfig['user.name'] = 'Estudiante';
    world.globalConfig['user.email'] = 'estudiante@example.com';
  }
  return world;
}

/** Termina la fase de construcción: el reloj pasa a tiempo real. */
export function finalize(world: World): World {
  world.deterministicClock = false;
  world.clock = Math.max(world.clock, Date.now() - 60_000);
  return world;
}

export class ScriptError extends Error {}

/** Ejecuta comandos en el mundo y falla si alguno da error (útil para construir escenarios). */
export function run(world: World, commands: string[], strict = true): World {
  let w = world;
  for (const c of commands) {
    const r = execute(c, w);
    if (!r.ok && strict) throw new ScriptError(`El comando "${c}" falló:\n${linesToText(r.lines)}`);
    w = r.world;
  }
  return w;
}

/** Ejecuta comandos "como" otra persona (cambia temporalmente la identidad). */
export function runAs(world: World, person: Person, commands: string[]): World {
  const prev = { name: world.globalConfig['user.name'], email: world.globalConfig['user.email'] };
  world.globalConfig['user.name'] = person.name;
  world.globalConfig['user.email'] = person.email;
  const w = run(world, commands);
  if (prev.name !== undefined) w.globalConfig['user.name'] = prev.name;
  else delete w.globalConfig['user.name'];
  if (prev.email !== undefined) w.globalConfig['user.email'] = prev.email;
  else delete w.globalConfig['user.email'];
  return w;
}

export function writeFiles(world: World, base: string, files: Record<string, string>): void {
  for (const [p, c] of Object.entries(files)) writeFile(world.fs, join(base, p), c);
}

export function addServer(world: World, opts: CreateRepoOptions): RemoteServer {
  return createServerRepo(world, opts);
}

export { serverCommit, personFor };

// ---------------------------------------------------------------------------
// Proyecto web de ejemplo
// ---------------------------------------------------------------------------

export const SAMPLE_FILES: Record<string, string> = {
  'README.md': '# Mi Tienda Web\n\nProyecto de ejemplo para practicar Git.\n\n## Cómo ejecutarlo\n\nAbre `index.html` en el navegador.\n',
  'index.html': '<!DOCTYPE html>\n<html lang="es">\n<head>\n  <meta charset="UTF-8">\n  <title>Mi Tienda</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <h1>Bienvenido a Mi Tienda</h1>\n  <ul id="productos"></ul>\n  <script src="app.js"></script>\n</body>\n</html>\n',
  'styles.css': 'body {\n  font-family: sans-serif;\n  margin: 2rem;\n  background: #f5f5f5;\n}\n\nh1 {\n  color: #333;\n}\n',
  'app.js': "const productos = ['Camiseta', 'Taza', 'Libreta'];\n\nconst lista = document.getElementById('productos');\nfor (const p of productos) {\n  const li = document.createElement('li');\n  li.textContent = p;\n  lista.appendChild(li);\n}\n",
};

export const TEAM = {
  lead: { name: 'Laura Méndez', email: 'laura@equipo.dev', username: 'laura-lead', role: 'Desarrolladora principal' },
  frontend: { name: 'Diego Frontend', email: 'diego@equipo.dev', username: 'diego-front', role: 'Desarrollador frontend' },
  backend: { name: 'Ana Backend', email: 'ana@equipo.dev', username: 'ana-back', role: 'Desarrolladora backend' },
  reviewer: { name: 'Carlos Revisor', email: 'carlos@equipo.dev', username: 'carlos-review', role: 'Revisor de código' },
} as const;

export type TeamKey = keyof typeof TEAM;
