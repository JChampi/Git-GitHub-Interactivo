/**
 * Consultas sobre el estado simulado para validar retos, lecciones guiadas,
 * escenarios y evaluaciones. Se evalúa el RESULTADO, no la memorización.
 */
import { ancestors, computeStatus, findRepo, getCommit, headSha, headTree, isAncestor, readBlob } from '../engine/repo';
import { getServer } from '../engine/server';
import type { CommandRecord, Repository, World } from '../engine/types';
import { join } from '../engine/vfs';
import { HOME } from '../engine/world';

export interface Check {
  id: string;
  label: string;
  test: (w: World, log: CommandRecord[]) => boolean;
}

export const PROJ = join(HOME, 'proyecto');

export function repoAt(w: World, path = PROJ): Repository | null {
  return w.repos[path] ?? null;
}

/** Repo en la carpeta indicada o, si no, el del cwd. */
export function repoOf(w: World, path?: string): Repository | null {
  return path ? repoAt(w, path) : findRepo(w);
}

export function commitCount(repo: Repository | null, ref?: string): number {
  if (!repo) return 0;
  const sha = ref ? repo.heads[ref] : headSha(repo);
  return sha ? ancestors(repo.objects, sha).size : 0;
}

export function branchCommitsSince(repo: Repository | null, branch: string, base: string): number {
  if (!repo || !repo.heads[branch] || !repo.heads[base]) return 0;
  const b = ancestors(repo.objects, repo.heads[base]);
  return [...ancestors(repo.objects, repo.heads[branch])].filter((s) => !b.has(s)).length;
}

export function fileInHead(repo: Repository | null, path: string, ref?: string): boolean {
  if (!repo) return false;
  const sha = ref ? repo.heads[ref] : headSha(repo);
  return !!sha && path in getCommit(repo, sha).tree;
}

export function headContent(repo: Repository | null, path: string, ref?: string): string | null {
  if (!repo) return null;
  const sha = ref ? repo.heads[ref] : headSha(repo);
  if (!sha) return null;
  const t = getCommit(repo, sha).tree;
  return path in t ? readBlob(repo.objects, t[path]) : null;
}

export function isMerged(repo: Repository | null, branch: string, into = 'main'): boolean {
  if (!repo) return false;
  const b = repo.heads[branch];
  const i = repo.heads[into];
  return !!b && !!i && isAncestor(repo.objects, b, i);
}

export function cleanTree(w: World, repo: Repository | null): boolean {
  if (!repo) return false;
  const st = computeStatus(w, repo);
  return !st.staged.length && !st.unstaged.length && !st.unmerged.length && !repo.operation;
}

export function used(log: CommandRecord[], command: string, ok = true): boolean {
  return log.some((r) => r.command === command && (!ok || r.ok));
}

export function usedArg(log: CommandRecord[], command: string, arg: string | RegExp): boolean {
  return log.some((r) => r.command === command && r.ok && r.argv.some((a) => (typeof arg === 'string' ? a === arg : arg.test(a))));
}

export function lastMessage(repo: Repository | null): string {
  const sha = repo && headSha(repo);
  return sha ? getCommit(repo!, sha).message : '';
}

export function server(w: World, owner: string, name: string) {
  return getServer(w, `https://github.com/${owner}/${name}.git`);
}

export function stagedPaths(w: World, repo: Repository | null): string[] {
  return repo ? computeStatus(w, repo).staged.map((c) => c.path) : [];
}

export function unstagedPaths(w: World, repo: Repository | null): string[] {
  return repo ? computeStatus(w, repo).unstaged.map((c) => c.path) : [];
}

export function workContent(w: World, path: string): string | undefined {
  return w.fs.files[path.startsWith('/') ? path : join(PROJ, path)];
}

export { headTree, headSha };
