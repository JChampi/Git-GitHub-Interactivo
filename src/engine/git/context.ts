import { Out } from '../output';
import { findRepo, worktree } from '../repo';
import type { Repository, ShellEvent, World } from '../types';
import { isInside, relative, resolvePath } from '../vfs';

export interface GitCtx {
  world: World;
  out: Out;
  events: ShellEvent[];
  /** Respuesta del usuario a una confirmación previa (operaciones destructivas). */
  confirmed?: boolean;
}

export function requireRepo(ctx: GitCtx): Repository | null {
  const repo = findRepo(ctx.world);
  if (!repo) {
    ctx.out.error('fatal: not a git repository (or any of the parent directories): .git');
    ctx.out.hint(
      'Esta carpeta no es un repositorio Git. Ejecuta "git init" para crear uno aquí,\n' +
        'o usa "cd" para entrar en la carpeta de un repositorio existente.',
    );
  }
  return repo;
}

/** Convierte una ruta escrita por el usuario (relativa al cwd) en ruta relativa al repo. */
export function toRepoPath(ctx: GitCtx, repo: Repository, userPath: string): string | null {
  const abs = resolvePath(ctx.world.cwd, userPath, ctx.world.home);
  if (!isInside(repo.root, abs)) return null;
  return relative(repo.root, abs);
}

/** Ruta relativa al cwd para mostrar en la salida (como hace Git). */
export function displayPath(ctx: GitCtx, repo: Repository, rel: string): string {
  const abs = repo.root === '/' ? '/' + rel : `${repo.root}/${rel}`;
  const cwd = ctx.world.cwd;
  if (cwd === repo.root) return rel;
  const cwdParts = cwd.split('/').filter(Boolean);
  const absParts = abs.split('/').filter(Boolean);
  let i = 0;
  while (i < cwdParts.length && i < absParts.length && cwdParts[i] === absParts[i]) i++;
  return [...Array(cwdParts.length - i).fill('..'), ...absParts.slice(i)].join('/') || '.';
}

function globToRegex(glob: string): RegExp {
  const re = glob
    .split('')
    .map((ch) => (ch === '*' ? '.*' : ch === '?' ? '.' : /[.+^${}()|[\]\\]/.test(ch) ? '\\' + ch : ch))
    .join('');
  return new RegExp('^' + re + '$');
}

/**
 * Filtra `candidates` (rutas relativas al repo) según una lista de pathspecs.
 * Devuelve las coincidencias y los pathspecs que no coincidieron con nada.
 */
export function matchPathspecs(
  ctx: GitCtx,
  repo: Repository,
  specs: string[],
  candidates: string[],
): { matched: string[]; unmatched: string[]; outside: string[] } {
  const matched = new Set<string>();
  const unmatched: string[] = [];
  const outside: string[] = [];
  for (const spec of specs) {
    const hasGlob = /[*?]/.test(spec);
    let found = false;
    if (hasGlob) {
      const baseRel = toRepoPath(ctx, repo, '.') ?? '';
      const full = baseRel ? `${baseRel}/${spec}` : spec;
      const re = globToRegex(full);
      const reName = !spec.includes('/') ? globToRegex(spec) : null;
      for (const c of candidates) {
        const inBase = !baseRel || c.startsWith(baseRel + '/');
        if (re.test(c) || (reName && inBase && reName.test(c.slice(c.lastIndexOf('/') + 1)))) {
          matched.add(c);
          found = true;
        }
      }
    } else {
      const rel = toRepoPath(ctx, repo, spec);
      if (rel === null) {
        outside.push(spec);
        continue;
      }
      for (const c of candidates) {
        if (rel === '' || c === rel || c.startsWith(rel + '/')) {
          matched.add(c);
          found = true;
        }
      }
    }
    if (!found) unmatched.push(spec);
  }
  return { matched: [...matched].sort(), unmatched, outside };
}

export function allPaths(ctx: GitCtx, repo: Repository, extra: string[] = []): string[] {
  return [...new Set([...Object.keys(worktree(ctx.world, repo)), ...Object.keys(repo.index), ...extra])].sort();
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
