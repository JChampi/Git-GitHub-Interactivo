/**
 * Núcleo del repositorio: objetos, referencias, resolución de revisiones,
 * working directory, staging area (índice) y cálculo del estado.
 */
import { hashBlob, sha1 } from './sha1';
import { isIgnored, parseGitignore, type IgnoreRule } from './ignore';
import type { Commit, ObjectStore, Person, Repository, Tree, World } from './types';
import { filesUnder, isInside, join, normalize, now, relative, remove, writeFile } from './vfs';

export const EMPTY_TREE: Tree = {};

export function createRepository(root: string, initialBranch = 'main'): Repository {
  return {
    root: normalize(root),
    objects: { commits: {}, blobs: {} },
    heads: {},
    remoteRefs: {},
    tags: {},
    head: { kind: 'branch', name: initialBranch },
    index: {},
    reflog: [],
    remotes: {},
    upstream: {},
    config: {},
    operation: null,
    stash: [],
  };
}

// ---------------------------------------------------------------------------
// Objetos
// ---------------------------------------------------------------------------

export function storeBlob(objects: ObjectStore, content: string): string {
  const sha = hashBlob(content);
  objects.blobs[sha] = content;
  return sha;
}

export function readBlob(objects: ObjectStore, sha: string): string {
  return objects.blobs[sha] ?? '';
}

export function treeContents(objects: ObjectStore, tree: Tree): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [p, sha] of Object.entries(tree)) out[p] = readBlob(objects, sha);
  return out;
}

export function treeFromContents(objects: ObjectStore, contents: Record<string, string>): Tree {
  const tree: Tree = {};
  for (const [p, c] of Object.entries(contents)) tree[p] = storeBlob(objects, c);
  return tree;
}

export function treesEqual(a: Tree, b: Tree): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

export function createCommit(
  world: World,
  objects: ObjectStore,
  data: { tree: Tree; parents: string[]; message: string; author: Person; committer?: Person; timestamp?: number },
): Commit {
  const timestamp = data.timestamp ?? now(world);
  const committer = data.committer ?? data.author;
  const treeText = Object.keys(data.tree)
    .sort()
    .map((p) => `${data.tree[p]} ${p}`)
    .join('\n');
  const body = [
    `tree ${sha1(treeText)}`,
    ...data.parents.map((p) => `parent ${p}`),
    `author ${data.author.name} <${data.author.email}> ${Math.floor(timestamp / 1000)}`,
    `committer ${committer.name} <${committer.email}> ${Math.floor(timestamp / 1000)}`,
    '',
    data.message,
  ].join('\n');
  let sha = sha1(`commit ${body.length}\0${body}`);
  // Evita colisiones si dos commits idénticos se crean en el mismo segundo.
  let salt = 0;
  while (objects.commits[sha]) sha = sha1(`${body}\n${++salt}`);
  const commit: Commit = { sha, tree: { ...data.tree }, parents: [...data.parents], message: data.message, author: data.author, committer, timestamp };
  objects.commits[sha] = commit;
  return commit;
}

/** Copia los commits (y blobs) alcanzables desde `tips` de un almacén a otro. */
export function copyObjects(from: ObjectStore, to: ObjectStore, tips: string[]): number {
  let copied = 0;
  const stack = [...tips];
  const seen = new Set<string>();
  while (stack.length) {
    const sha = stack.pop()!;
    if (seen.has(sha) || to.commits[sha]) continue;
    seen.add(sha);
    const c = from.commits[sha];
    if (!c) continue;
    to.commits[sha] = structuredClone(c);
    copied++;
    for (const b of Object.values(c.tree)) if (from.blobs[b] !== undefined) to.blobs[b] = from.blobs[b];
    stack.push(...c.parents);
  }
  return copied;
}

export function short(sha: string): string {
  return sha.slice(0, 7);
}

export function firstLine(message: string): string {
  return message.split('\n')[0];
}

// ---------------------------------------------------------------------------
// Referencias y revisiones
// ---------------------------------------------------------------------------

export function headSha(repo: Repository): string | null {
  if (repo.head.kind === 'detached') return repo.head.sha;
  return repo.heads[repo.head.name] ?? null;
}

export function currentBranch(repo: Repository): string | null {
  return repo.head.kind === 'branch' ? repo.head.name : null;
}

export function headTree(repo: Repository): Tree {
  const sha = headSha(repo);
  return sha ? repo.objects.commits[sha].tree : {};
}

export function getCommit(repo: { objects: ObjectStore }, sha: string): Commit {
  return repo.objects.commits[sha];
}

/** Mueve HEAD (o la rama a la que apunta) y registra la operación en el reflog. */
export function updateHead(world: World, repo: Repository, sha: string, reflogMessage: string): void {
  const prev = headSha(repo);
  if (repo.head.kind === 'branch') repo.heads[repo.head.name] = sha;
  else repo.head = { kind: 'detached', sha };
  repo.reflog.unshift({ sha, prev, message: reflogMessage, timestamp: now(world) });
}

export function recordReflog(world: World, repo: Repository, sha: string, prev: string | null, message: string) {
  repo.reflog.unshift({ sha, prev, message, timestamp: now(world) });
}

export interface ResolveResult {
  sha: string | null;
  error?: string;
}

/**
 * Resuelve una revisión: HEAD, @, ramas, ramas remotas (origin/main),
 * etiquetas, SHA abreviado, sufijos ~n y ^n, y HEAD@{n} del reflog.
 */
export function resolveRev(repo: Repository, rev: string): string | null {
  const m = /^(.*?)((?:[~^]\d*)*)$/.exec(rev);
  if (!m) return null;
  const baseRev = m[1];
  const suffix = m[2];
  let sha = resolveBase(repo, baseRev);
  if (!sha) return null;
  const re = /([~^])(\d*)/g;
  let part: RegExpExecArray | null;
  while ((part = re.exec(suffix))) {
    const n = part[2] === '' ? 1 : parseInt(part[2], 10);
    const commit: Commit | undefined = repo.objects.commits[sha!];
    if (!commit) return null;
    if (part[1] === '~') {
      let cur: string | undefined = sha!;
      for (let i = 0; i < n; i++) {
        cur = cur ? repo.objects.commits[cur]?.parents[0] : undefined;
      }
      if (!cur) return null;
      sha = cur;
    } else {
      if (n === 0) continue;
      const p: string | undefined = commit.parents[n - 1];
      if (!p) return null;
      sha = p;
    }
  }
  return sha;
}

function resolveBase(repo: Repository, rev: string): string | null {
  if (rev === 'HEAD' || rev === '@' || rev === '') return headSha(repo);
  const reflogMatch = /^(?:HEAD)?@\{(\d+)\}$/.exec(rev);
  if (reflogMatch) return repo.reflog[parseInt(reflogMatch[1], 10)]?.sha ?? null;
  if (rev === 'ORIG_HEAD') return repo.config['__ORIG_HEAD'] ?? null;
  if (rev === 'MERGE_HEAD') return repo.operation?.kind === 'merge' ? repo.operation.theirs : null;
  if (rev in repo.heads) return repo.heads[rev];
  if (rev.startsWith('refs/heads/') && rev.slice(11) in repo.heads) return repo.heads[rev.slice(11)];
  if (rev in repo.tags) return repo.tags[rev].target;
  if (rev in repo.remoteRefs) return repo.remoteRefs[rev];
  if (rev.startsWith('remotes/') && rev.slice(8) in repo.remoteRefs) return repo.remoteRefs[rev.slice(8)];
  if (/^[0-9a-f]{4,40}$/.test(rev)) {
    const found = Object.keys(repo.objects.commits).filter((s) => s.startsWith(rev));
    if (found.length === 1) return found[0];
  }
  return null;
}

export function ancestors(objects: ObjectStore, sha: string): Set<string> {
  const seen = new Set<string>();
  const stack = [sha];
  while (stack.length) {
    const s = stack.pop()!;
    if (seen.has(s)) continue;
    const c = objects.commits[s];
    if (!c) continue;
    seen.add(s);
    stack.push(...c.parents);
  }
  return seen;
}

/** ¿`a` es ancestro de (o igual a) `b`? */
export function isAncestor(objects: ObjectStore, a: string, b: string): boolean {
  return ancestors(objects, b).has(a);
}

export function mergeBase(objects: ObjectStore, a: string, b: string): string | null {
  const ancA = ancestors(objects, a);
  const common = [...ancestors(objects, b)].filter((s) => ancA.has(s));
  if (!common.length) return null;
  // Mejor ancestro común: el que no es ancestro de otro común.
  const best = common.filter((c) => !common.some((o) => o !== c && isAncestor(objects, c, o)));
  best.sort((x, y) => objects.commits[y].timestamp - objects.commits[x].timestamp);
  return best[0];
}

/** Commits alcanzables desde `tips`, en orden cronológico inverso respetando la topología. */
export function logOrder(objects: ObjectStore, tips: string[], exclude: string[] = []): Commit[] {
  const excluded = new Set<string>();
  for (const e of exclude) for (const s of ancestors(objects, e)) excluded.add(s);
  const reachable = new Set<string>();
  for (const t of tips) for (const s of ancestors(objects, t)) if (!excluded.has(s)) reachable.add(s);
  const childCount = new Map<string, number>();
  for (const s of reachable) childCount.set(s, 0);
  for (const s of reachable) {
    for (const p of objects.commits[s].parents) if (reachable.has(p)) childCount.set(p, (childCount.get(p) ?? 0) + 1);
  }
  const ready = [...reachable].filter((s) => childCount.get(s) === 0);
  const out: Commit[] = [];
  while (ready.length) {
    ready.sort((x, y) => objects.commits[y].timestamp - objects.commits[x].timestamp || (x < y ? -1 : 1));
    const s = ready.shift()!;
    const c = objects.commits[s];
    out.push(c);
    for (const p of c.parents) {
      if (!reachable.has(p)) continue;
      const n = (childCount.get(p) ?? 1) - 1;
      childCount.set(p, n);
      if (n === 0) ready.push(p);
    }
  }
  return out;
}

/** Nombres de referencias que apuntan a cada commit (para decoraciones). */
export function decorations(repo: Repository): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (sha: string, label: string) => (out[sha] ??= []).push(label);
  const hs = headSha(repo);
  if (repo.head.kind === 'detached' && hs) add(hs, 'HEAD');
  for (const [b, sha] of Object.entries(repo.heads)) {
    add(sha, repo.head.kind === 'branch' && repo.head.name === b ? `HEAD -> ${b}` : b);
  }
  for (const [r, sha] of Object.entries(repo.remoteRefs)) add(sha, r);
  for (const [t, tag] of Object.entries(repo.tags)) add(tag.target, `tag: ${t}`);
  for (const k of Object.keys(out)) {
    out[k].sort((a, b) => (a.startsWith('HEAD') ? -1 : b.startsWith('HEAD') ? 1 : 0));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Working directory
// ---------------------------------------------------------------------------

export function findRepo(world: World, path: string = world.cwd): Repository | null {
  let best: Repository | null = null;
  for (const repo of Object.values(world.repos)) {
    if (isInside(repo.root, path) && (!best || repo.root.length > best.root.length)) best = repo;
  }
  return best;
}

/** Archivos del working directory (ruta relativa → contenido). */
export function worktree(world: World, repo: Repository): Record<string, string> {
  const nested = Object.keys(world.repos).filter((r) => r !== repo.root && isInside(repo.root, r));
  const out: Record<string, string> = {};
  for (const abs of filesUnder(world.fs, repo.root)) {
    if (nested.some((n) => isInside(n, abs))) continue;
    out[relative(repo.root, abs)] = world.fs.files[abs];
  }
  return out;
}

export function ignoreRules(world: World, repo: Repository): IgnoreRule[] {
  const wt = worktree(world, repo);
  const rules: IgnoreRule[] = [];
  const ignoreFiles = Object.keys(wt)
    .filter((p) => p === '.gitignore' || p.endsWith('/.gitignore'))
    .sort((a, b) => a.split('/').length - b.split('/').length);
  for (const f of ignoreFiles) {
    const base = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '';
    rules.push(...parseGitignore(wt[f], base, f));
  }
  return rules;
}

export function absPath(repo: Repository, rel: string): string {
  return join(repo.root, rel);
}

export function writeWork(world: World, repo: Repository, rel: string, content: string): void {
  writeFile(world.fs, absPath(repo, rel), content);
}

export function deleteWork(world: World, repo: Repository, rel: string): void {
  remove(world.fs, absPath(repo, rel));
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

export type ChangeKind = 'added' | 'modified' | 'deleted' | 'renamed';

export interface Change {
  path: string;
  kind: ChangeKind;
  from?: string;
}

export interface Status {
  staged: Change[];
  unstaged: Change[];
  untracked: string[];
  ignored: string[];
  unmerged: string[];
}

export function computeStatus(world: World, repo: Repository): Status {
  const head = headTree(repo);
  const index = repo.index;
  const work = worktree(world, repo);
  const unmerged = repo.operation?.conflicts ?? [];
  const unmergedSet = new Set(unmerged);

  const staged: Change[] = [];
  for (const p of [...new Set([...Object.keys(head), ...Object.keys(index)])].sort()) {
    if (unmergedSet.has(p)) continue;
    if (!(p in head)) staged.push({ path: p, kind: 'added' });
    else if (!(p in index)) staged.push({ path: p, kind: 'deleted' });
    else if (head[p] !== index[p]) staged.push({ path: p, kind: 'modified' });
  }
  // Detección simple de renombrados: un archivo eliminado y otro añadido con el mismo blob.
  for (const del of staged.filter((c) => c.kind === 'deleted')) {
    const add = staged.find((c) => c.kind === 'added' && index[c.path] === head[del.path]);
    if (add) {
      add.kind = 'renamed';
      add.from = del.path;
      staged.splice(staged.indexOf(del), 1);
    }
  }

  const unstaged: Change[] = [];
  for (const p of Object.keys(index).sort()) {
    if (unmergedSet.has(p)) continue;
    if (!(p in work)) unstaged.push({ path: p, kind: 'deleted' });
    else if (hashBlob(work[p]) !== index[p]) unstaged.push({ path: p, kind: 'modified' });
  }

  const rules = ignoreRules(world, repo);
  const untracked: string[] = [];
  const ignored: string[] = [];
  for (const p of Object.keys(work).sort()) {
    if (p in index || unmergedSet.has(p)) continue;
    if (isIgnored(rules, p)) ignored.push(p);
    else untracked.push(p);
  }
  return { staged, unstaged, untracked, ignored, unmerged };
}

export function isClean(status: Status): boolean {
  return !status.staged.length && !status.unstaged.length && !status.unmerged.length;
}

/** Agrupa archivos no rastreados en su carpeta más alta sin archivos rastreados (como Git). */
export function collapseUntracked(paths: string[], index: Tree): string[] {
  const tracked = Object.keys(index);
  const out = new Set<string>();
  for (const p of paths) {
    const parts = p.split('/');
    let shown = p;
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!tracked.some((t) => t.startsWith(dir + '/'))) {
        shown = dir + '/';
        break;
      }
    }
    out.add(shown);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Cambio de árbol (switch / checkout / merge fast-forward / reset --hard)
// ---------------------------------------------------------------------------

export interface TreeSwitchError {
  overwritten: string[];
  untrackedOverwritten: string[];
}

/**
 * Comprueba si se puede pasar del árbol `from` al árbol `to` sin perder
 * cambios locales, siguiendo las reglas de Git: los cambios no confirmados se
 * conservan si el archivo no cambia entre ambos árboles.
 */
export function checkTreeSwitch(world: World, repo: Repository, from: Tree, to: Tree): TreeSwitchError | null {
  const work = worktree(world, repo);
  const overwritten: string[] = [];
  const untrackedOverwritten: string[] = [];
  for (const p of [...new Set([...Object.keys(from), ...Object.keys(to)])].sort()) {
    if (from[p] === to[p]) continue;
    const idx = repo.index[p];
    const dirtyIndex = idx !== from[p];
    const dirtyWork = p in work ? hashBlob(work[p]) !== (idx ?? '') : idx !== undefined;
    if (dirtyIndex || dirtyWork) {
      if (!(p in from) && !(p in repo.index)) {
        if (p in work && hashBlob(work[p]) !== to[p]) untrackedOverwritten.push(p);
      } else if (!(idx === to[p] && (p in work ? hashBlob(work[p]) === to[p] : to[p] === undefined))) {
        overwritten.push(p);
      }
    }
  }
  return overwritten.length || untrackedOverwritten.length ? { overwritten, untrackedOverwritten } : null;
}

export function applyTreeSwitch(world: World, repo: Repository, from: Tree, to: Tree): void {
  for (const p of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (from[p] === to[p]) continue;
    if (p in to) {
      repo.index[p] = to[p];
      writeWork(world, repo, p, readBlob(repo.objects, to[p]));
    } else {
      delete repo.index[p];
      deleteWork(world, repo, p);
    }
  }
}

export function formatSwitchError(err: TreeSwitchError, action: string): string {
  const parts: string[] = [];
  if (err.overwritten.length) {
    parts.push(
      `error: Your local changes to the following files would be overwritten by ${action}:\n` +
        err.overwritten.map((p) => `\t${p}`).join('\n') +
        `\nPlease commit your changes or stash them before you ${action === 'checkout' ? 'switch branches' : action}.`,
    );
  }
  if (err.untrackedOverwritten.length) {
    parts.push(
      `error: The following untracked working tree files would be overwritten by ${action}:\n` +
        err.untrackedOverwritten.map((p) => `\t${p}`).join('\n') +
        `\nPlease move or remove them before you ${action === 'checkout' ? 'switch branches' : action}.`,
    );
  }
  return parts.join('\n') + '\nAborting';
}

export function identity(world: World, repo: Repository | null): Person | null {
  const name = repo?.config['user.name'] ?? world.globalConfig['user.name'];
  const email = repo?.config['user.email'] ?? world.globalConfig['user.email'];
  if (!name || !email) return null;
  return { name, email };
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n: number) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const tz = `${sign}${pad(Math.floor(Math.abs(off) / 60))}${pad(Math.abs(off) % 60)}`;
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getFullYear()} ${tz}`;
}

export function aheadBehind(objects: ObjectStore, local: string, remote: string): { ahead: number; behind: number } {
  const a = ancestors(objects, local);
  const b = ancestors(objects, remote);
  let ahead = 0;
  let behind = 0;
  for (const s of a) if (!b.has(s)) ahead++;
  for (const s of b) if (!a.has(s)) behind++;
  return { ahead, behind };
}
