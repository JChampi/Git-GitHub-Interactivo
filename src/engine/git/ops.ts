/**
 * Operaciones compartidas entre comandos: aplicar fusiones de tres vías,
 * resetear el árbol de trabajo, cambiar de rama.
 */
import { mergeTrees } from '../merge';
import { hashBlob } from '../sha1';
import {
  applyTreeSwitch,
  checkTreeSwitch,
  computeStatus,
  currentBranch,
  deleteWork,
  formatSwitchError,
  getCommit,
  headSha,
  headTree,
  readBlob,
  recordReflog,
  storeBlob,
  treeContents,
  worktree,
  writeWork,
} from '../repo';
import type { Repository, Tree } from '../types';
import type { GitCtx } from './context';

export interface ThreeWayResult {
  conflicts: string[];
  tree: Tree;
  autoMerged: string[];
}

/**
 * Calcula la fusión de tres árboles sin modificar nada.
 */
export function computeThreeWay(
  repo: Repository,
  baseTree: Tree,
  oursTree: Tree,
  theirsTree: Tree,
  oursLabel: string,
  theirsLabel: string,
) {
  const entries = mergeTrees(
    treeContents(repo.objects, baseTree),
    treeContents(repo.objects, oursTree),
    treeContents(repo.objects, theirsTree),
    oursLabel,
    theirsLabel,
  );
  return entries;
}

/**
 * Comprueba si los cambios locales impiden fusionar: Git exige que los
 * archivos afectados por la fusión no tengan cambios sin confirmar.
 */
export function checkMergeSafety(ctx: GitCtx, repo: Repository, oursTree: Tree, resultPaths: string[]): string | null {
  const work = worktree(ctx.world, repo);
  const st = computeStatus(ctx.world, repo);
  const dirty = new Set([...st.staged.map((c) => c.path), ...st.unstaged.map((c) => c.path)]);
  const blocked = resultPaths.filter((p) => dirty.has(p));
  const untrackedBlocked = resultPaths.filter((p) => !(p in oursTree) && !(p in repo.index) && p in work);
  if (blocked.length) {
    return (
      'error: Your local changes to the following files would be overwritten by merge:\n' +
      blocked.map((p) => '\t' + p).join('\n') +
      '\nPlease commit your changes or stash them before you merge.\nAborting'
    );
  }
  if (untrackedBlocked.length) {
    return (
      'error: The following untracked working tree files would be overwritten by merge:\n' +
      untrackedBlocked.map((p) => '\t' + p).join('\n') +
      '\nPlease move or remove them before you merge.\nAborting'
    );
  }
  return null;
}

/**
 * Aplica una fusión de tres vías sobre el índice y el working directory.
 * Devuelve los conflictos y el árbol resultante (válido solo si no hay conflictos).
 */
export function applyThreeWay(
  ctx: GitCtx,
  repo: Repository,
  baseTree: Tree,
  oursTree: Tree,
  theirsTree: Tree,
  oursLabel: string,
  theirsLabel: string,
  report = true,
): ThreeWayResult | { error: string } {
  const entries = computeThreeWay(repo, baseTree, oursTree, theirsTree, oursLabel, theirsLabel);
  const touched = entries
    .filter((e) => {
      const cur = oursTree[e.path];
      if (e.content === null) return cur !== undefined;
      return cur === undefined || readBlob(repo.objects, cur) !== e.content || !!e.conflict;
    })
    .map((e) => e.path);
  const err = checkMergeSafety(ctx, repo, oursTree, touched);
  if (err) return { error: err };

  const { out, world } = ctx;
  const conflicts: string[] = [];
  const autoMerged: string[] = [];
  const tree: Tree = {};
  for (const e of entries) {
    const inBase = e.path in baseTree;
    const changedBoth =
      e.path in oursTree && e.path in theirsTree && oursTree[e.path] !== baseTree[e.path] && theirsTree[e.path] !== baseTree[e.path];
    if (changedBoth || (e.conflict === 'add/add')) {
      autoMerged.push(e.path);
      if (report) out.line(`Auto-merging ${e.path}`);
    }
    if (e.conflict) {
      conflicts.push(e.path);
      if (report) {
        if (e.conflict === 'modify/delete') {
          const deleter = e.deletedBy === 'ours' ? oursLabel : theirsLabel;
          const keeper = e.deletedBy === 'ours' ? theirsLabel : oursLabel;
          out.line(`CONFLICT (modify/delete): ${e.path} deleted in ${deleter} and modified in ${keeper}.  Version ${keeper} of ${e.path} left in tree.`);
        } else out.line(`CONFLICT (${e.conflict}): Merge conflict in ${e.path}`);
      }
      writeWork(world, repo, e.path, e.content ?? '');
      if (oursTree[e.path]) repo.index[e.path] = oursTree[e.path];
      else delete repo.index[e.path];
      continue;
    }
    if (e.content === null) {
      if (e.path in oursTree || e.path in repo.index) {
        delete repo.index[e.path];
        deleteWork(world, repo, e.path);
      }
      continue;
    }
    const sha = storeBlob(repo.objects, e.content);
    tree[e.path] = sha;
    if (oursTree[e.path] !== sha) {
      repo.index[e.path] = sha;
      writeWork(world, repo, e.path, e.content);
    }
    void inBase;
  }
  return { conflicts, tree, autoMerged };
}

/** Restaura índice y working directory (archivos rastreados) al árbol indicado. */
export function hardResetTree(ctx: GitCtx, repo: Repository, target: Tree): void {
  const paths = new Set([...Object.keys(repo.index), ...Object.keys(headTree(repo)), ...Object.keys(target), ...(repo.operation?.conflicts ?? [])]);
  for (const p of paths) {
    if (p in target) writeWork(ctx.world, repo, p, readBlob(repo.objects, target[p]));
    else deleteWork(ctx.world, repo, p);
  }
  repo.index = { ...target };
}

/** Archivos con cambios locales que se mantienen tras cambiar de rama. */
export function carriedChanges(ctx: GitCtx, repo: Repository): string[] {
  const st = computeStatus(ctx.world, repo);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of [...st.staged, ...st.unstaged]) {
    if (seen.has(c.path)) continue;
    seen.add(c.path);
    out.push(`${c.kind === 'deleted' ? 'D' : c.kind === 'added' ? 'A' : 'M'}\t${c.path}`);
  }
  return out;
}

/**
 * Cambia HEAD a una rama o commit actualizando índice y working directory.
 * Devuelve false si hay cambios locales que se perderían.
 */
export function switchTo(
  ctx: GitCtx,
  repo: Repository,
  target: { branch?: string; sha: string | null },
  action: 'checkout' | 'switch',
): boolean {
  const from = headTree(repo);
  const to = target.sha ? getCommit(repo, target.sha).tree : {};
  const err = checkTreeSwitch(ctx.world, repo, from, to);
  if (err) {
    ctx.out.error(formatSwitchError(err, 'checkout'));
    ctx.out.hint(
      'Tienes cambios sin confirmar en archivos que son distintos en la rama destino.\n' +
        'Opciones: confírmalos (git commit), guárdalos temporalmente (git stash) o descártalos (git restore).',
    );
    return false;
  }
  const prevLabel = currentBranch(repo) ?? headSha(repo) ?? '';
  const prev = headSha(repo);
  applyTreeSwitch(ctx.world, repo, from, to);
  repo.head = target.branch ? { kind: 'branch', name: target.branch } : { kind: 'detached', sha: target.sha! };
  const toLabel = target.branch ?? target.sha!;
  if (target.sha) recordReflog(ctx.world, repo, target.sha, prev, `${action === 'switch' ? 'checkout' : 'checkout'}: moving from ${prevLabel} to ${toLabel}`);
  return true;
}

export function workContentHash(ctx: GitCtx, repo: Repository, p: string): string | undefined {
  const c = worktree(ctx.world, repo)[p];
  return c === undefined ? undefined : hashBlob(c);
}
