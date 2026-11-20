/**
 * Autocompletado de la terminal: comandos, subcomandos de git, opciones,
 * ramas, remotos y rutas de archivos.
 */
import { GIT_COMMANDS } from './git';
import { SHELL_COMMANDS } from './shell';
import { findRepo } from './repo';
import type { World } from './types';
import { listDir, resolvePath } from './vfs';

const GIT_FLAGS: Record<string, string[]> = {
  add: ['.', '-A', '--all', '-u', '--update', '-f', '--force', '-n', '--dry-run'],
  commit: ['-m', '-a', '-am', '--amend', '--no-edit', '--allow-empty'],
  status: ['-s', '--short', '-b', '--ignored'],
  log: ['--oneline', '--graph', '--all', '--stat', '-p', '-n', '--author=', '--reverse'],
  diff: ['--staged', '--cached', '--stat', '--name-only'],
  branch: ['-a', '-r', '-v', '-vv', '-d', '-D', '-m', '--merged', '--no-merged', '--show-current', '-u'],
  switch: ['-c', '-C', '--detach', '-'],
  checkout: ['-b', '--'],
  merge: ['--no-ff', '--ff-only', '--squash', '--abort', '--continue', '-m'],
  reset: ['--soft', '--mixed', '--hard', 'HEAD~1', 'HEAD'],
  restore: ['--staged', '--source=', '--worktree', '.'],
  revert: ['--no-edit', '--abort', '--continue', 'HEAD'],
  push: ['-u', 'origin', '--force-with-lease', '--delete', '--tags'],
  pull: ['--rebase', '--no-rebase', '--ff-only', 'origin'],
  fetch: ['--all', '--prune', 'origin'],
  remote: ['-v', 'add', 'remove', 'rename', 'get-url', 'set-url', 'show'],
  stash: ['push', '-m', 'list', 'pop', 'apply', 'drop', 'show', 'clear', '-u'],
  clean: ['-n', '-f', '-fd', '-d', '-x'],
  tag: ['-a', '-m', '-d', '-l'],
  rebase: ['--continue', '--abort', '--skip'],
  'cherry-pick': ['--continue', '--abort'],
  rm: ['--cached', '-r', '-f'],
  config: ['--global', '--list', 'user.name', 'user.email', 'init.defaultBranch'],
  init: ['-b'],
  clone: [],
};

const BRANCH_CMDS = new Set(['switch', 'checkout', 'merge', 'rebase', 'branch', 'cherry-pick', 'log', 'diff', 'reset', 'revert', 'show']);
const PATH_GIT_CMDS = new Set(['add', 'restore', 'rm', 'mv', 'diff', 'checkout', 'log', 'reset']);
const PATH_SHELL_CMDS = new Set(['cat', 'cd', 'ls', 'rm', 'mv', 'cp', 'nano', 'code', 'vim', 'edit', 'touch', 'tree', 'head', 'tail', 'rmdir']);

export interface Completion {
  /** Texto completo propuesto para la línea. */
  line: string;
  /** Opciones posibles para mostrar cuando hay varias. */
  options: string[];
}

function commonPrefix(items: string[]): string {
  if (!items.length) return '';
  let p = items[0];
  for (const s of items) while (!s.startsWith(p)) p = p.slice(0, -1);
  return p;
}

function pathCandidates(world: World, partial: string, dirsOnly: boolean): string[] {
  const slash = partial.lastIndexOf('/');
  const dirPart = slash >= 0 ? partial.slice(0, slash + 1) : '';
  const namePart = slash >= 0 ? partial.slice(slash + 1) : partial;
  const abs = resolvePath(world.cwd, dirPart || '.', world.home);
  return listDir(world.fs, abs)
    .filter((e) => e.name.startsWith(namePart) && (!dirsOnly || e.type === 'dir') && (namePart.startsWith('.') || !e.name.startsWith('.')))
    .map((e) => dirPart + e.name + (e.type === 'dir' ? '/' : ''));
}

export function complete(world: World, line: string): Completion {
  const endsWithSpace = /\s$/.test(line);
  const parts = line.trimStart().split(/\s+/);
  if (endsWithSpace) parts.push('');
  const word = parts[parts.length - 1];
  const before = line.slice(0, line.length - word.length);
  let candidates: string[] = [];

  if (parts.length === 1) {
    candidates = Object.keys(SHELL_COMMANDS).filter((c) => c.startsWith(word));
  } else if (parts[0] === 'git' && parts.length === 2) {
    candidates = Object.keys(GIT_COMMANDS).filter((c) => c.startsWith(word));
  } else if (parts[0] === 'git') {
    const sub = parts[1];
    const repo = findRepo(world);
    const flags = (GIT_FLAGS[sub] ?? []).filter((f) => f.startsWith(word));
    if (word.startsWith('-')) candidates = flags;
    else {
      const set = new Set<string>(flags.filter((f) => !f.startsWith('-')));
      if (repo && BRANCH_CMDS.has(sub)) {
        for (const b of Object.keys(repo.heads)) if (b.startsWith(word)) set.add(b);
        if (sub !== 'branch' && sub !== 'switch') for (const r of Object.keys(repo.remoteRefs)) if (r.startsWith(word)) set.add(r);
        for (const t of Object.keys(repo.tags)) if (t.startsWith(word) && sub !== 'switch') set.add(t);
      }
      if (repo && (sub === 'push' || sub === 'pull' || sub === 'fetch')) {
        if (parts.length === 3) for (const r of Object.keys(repo.remotes)) if (r.startsWith(word)) set.add(r);
        else for (const b of Object.keys(repo.heads)) if (b.startsWith(word)) set.add(b);
      }
      if (PATH_GIT_CMDS.has(sub) || !BRANCH_CMDS.has(sub)) for (const p of pathCandidates(world, word, false)) set.add(p);
      candidates = [...set];
    }
  } else if (PATH_SHELL_CMDS.has(parts[0])) {
    candidates = pathCandidates(world, word, parts[0] === 'cd');
  }
  candidates.sort();
  if (!candidates.length) return { line, options: [] };
  if (candidates.length === 1) {
    const c = candidates[0];
    return { line: before + c + (c.endsWith('/') || c.endsWith('=') ? '' : ' '), options: [] };
  }
  const prefix = commonPrefix(candidates);
  return { line: before + (prefix.length > word.length ? prefix : word), options: candidates };
}
