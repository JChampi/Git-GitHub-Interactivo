/**
 * Sistema de archivos virtual (rutas POSIX absolutas).
 * Los archivos se guardan en un mapa ruta → contenido y los directorios en un
 * conjunto, de modo que pueden existir carpetas vacías.
 */
import type { VirtualFS, World } from './types';

export function normalize(path: string): string {
  const parts: string[] = [];
  for (const p of path.split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') parts.pop();
    else parts.push(p);
  }
  return '/' + parts.join('/');
}

export function resolvePath(cwd: string, path: string, home = '/home/estudiante'): string {
  if (path === '~') return home;
  if (path.startsWith('~/')) return normalize(home + '/' + path.slice(2));
  if (path.startsWith('/')) return normalize(path);
  return normalize(cwd + '/' + path);
}

export function dirname(path: string): string {
  const n = normalize(path);
  const idx = n.lastIndexOf('/');
  return idx <= 0 ? '/' : n.slice(0, idx);
}

export function basename(path: string): string {
  const n = normalize(path);
  return n.slice(n.lastIndexOf('/') + 1);
}

export function join(...parts: string[]): string {
  return normalize(parts.join('/'));
}

/** Ruta relativa de `path` respecto a `root` (sin barra inicial). */
export function relative(root: string, path: string): string {
  const r = normalize(root);
  const p = normalize(path);
  if (r === '/') return p.slice(1);
  if (p === r) return '';
  return p.startsWith(r + '/') ? p.slice(r.length + 1) : p;
}

export function isInside(root: string, path: string): boolean {
  const r = normalize(root);
  const p = normalize(path);
  return r === '/' || p === r || p.startsWith(r + '/');
}

export function createFS(): VirtualFS {
  return { files: {}, dirs: { '/': true } };
}

export function exists(fs: VirtualFS, path: string): boolean {
  const p = normalize(path);
  return p in fs.files || p in fs.dirs;
}

export function isDir(fs: VirtualFS, path: string): boolean {
  return normalize(path) in fs.dirs;
}

export function isFile(fs: VirtualFS, path: string): boolean {
  return normalize(path) in fs.files;
}

export function mkdirp(fs: VirtualFS, path: string): void {
  let cur = '';
  for (const part of normalize(path).split('/').filter(Boolean)) {
    cur += '/' + part;
    fs.dirs[cur] = true;
  }
  fs.dirs['/'] = true;
}

export function writeFile(fs: VirtualFS, path: string, content: string): void {
  const p = normalize(path);
  mkdirp(fs, dirname(p));
  fs.files[p] = content;
}

export function readFile(fs: VirtualFS, path: string): string | undefined {
  return fs.files[normalize(path)];
}

/** Elimina un archivo o un directorio de forma recursiva. */
export function remove(fs: VirtualFS, path: string): void {
  const p = normalize(path);
  delete fs.files[p];
  if (p in fs.dirs) {
    for (const f of Object.keys(fs.files)) if (f.startsWith(p + '/')) delete fs.files[f];
    for (const d of Object.keys(fs.dirs)) if (d === p || d.startsWith(p + '/')) delete fs.dirs[d];
  }
  fs.dirs['/'] = true;
}

/** Mueve un archivo o directorio. */
export function move(fs: VirtualFS, from: string, to: string): void {
  const a = normalize(from);
  const b = normalize(to);
  if (a in fs.files) {
    const c = fs.files[a];
    delete fs.files[a];
    writeFile(fs, b, c);
    return;
  }
  if (a in fs.dirs) {
    mkdirp(fs, b);
    for (const d of Object.keys(fs.dirs)) {
      if (d.startsWith(a + '/')) fs.dirs[b + d.slice(a.length)] = true;
    }
    for (const f of Object.keys(fs.files)) {
      if (f.startsWith(a + '/')) {
        fs.files[b + f.slice(a.length)] = fs.files[f];
        delete fs.files[f];
      }
    }
    for (const d of Object.keys(fs.dirs)) if (d === a || d.startsWith(a + '/')) delete fs.dirs[d];
  }
}

export interface DirEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

export function listDir(fs: VirtualFS, path: string): DirEntry[] {
  const p = normalize(path);
  const prefix = p === '/' ? '/' : p + '/';
  const seen = new Map<string, DirEntry>();
  for (const d of Object.keys(fs.dirs)) {
    if (d !== p && d.startsWith(prefix) && !d.slice(prefix.length).includes('/')) {
      const name = d.slice(prefix.length);
      seen.set(name, { name, path: d, type: 'dir' });
    }
  }
  for (const f of Object.keys(fs.files)) {
    if (f.startsWith(prefix) && !f.slice(prefix.length).includes('/')) {
      const name = f.slice(prefix.length);
      seen.set(name, { name, path: f, type: 'file' });
    }
  }
  return [...seen.values()].sort((x, y) =>
    x.type === y.type ? x.name.localeCompare(y.name) : x.type === 'dir' ? -1 : 1,
  );
}

/** Todos los archivos (rutas absolutas) bajo un directorio. */
export function filesUnder(fs: VirtualFS, dir: string): string[] {
  const p = normalize(dir);
  const prefix = p === '/' ? '/' : p + '/';
  return Object.keys(fs.files)
    .filter((f) => f.startsWith(prefix))
    .sort();
}

export function now(world: World): number {
  if (world.deterministicClock) {
    world.clock += 60_000;
    return world.clock;
  }
  world.clock = Math.max(Date.now(), world.clock + 1000);
  return world.clock;
}
