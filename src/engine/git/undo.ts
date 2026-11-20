/**
 * Deshacer cambios: restore, reset, reflog, clean.
 * (revert está en branch.ts porque comparte el secuenciador con cherry-pick)
 */
import { parseArgs } from '../args';
import { isIgnored } from '../ignore';
import { hashBlob } from '../sha1';
import {
  collapseUntracked,
  computeStatus,
  currentBranch,
  decorations,
  firstLine,
  getCommit,
  headSha,
  headTree,
  ignoreRules,
  readBlob,
  resolveRev,
  short,
  updateHead,
  worktree,
  writeWork,
  deleteWork,
} from '../repo';
import type { Tree } from '../types';
import { remove } from '../vfs';
import { displayPath, type GitCtx, matchPathspecs, requireRepo } from './context';
import { hardResetTree } from './ops';
import { decoSegs } from './render';

export function gitRestore(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, {
    bool: ['S', 'staged', 'W', 'worktree', 'q', 'quiet', 'ours', 'theirs'],
    value: ['s', 'source'],
    alias: { S: 'staged', W: 'worktree', s: 'source', q: 'quiet' },
  });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out, world } = ctx;
  const specs = [...a.positional, ...a.paths];
  if (!specs.length) {
    out.error('fatal: you must specify path(s) to restore');
    out.hint('Ejemplos: git restore archivo.txt (descarta cambios) · git restore --staged archivo.txt (lo saca de staging)');
    return;
  }
  const staged = !!a.flags['staged'];
  const worktreeFlag = !!a.flags['worktree'] || !staged;
  const sourceRev = a.flags['source'] as string | undefined;
  let source: Tree;
  if (sourceRev) {
    const sha = resolveRev(repo, sourceRev);
    if (!sha) {
      out.error(`fatal: could not resolve ${sourceRev}`);
      return;
    }
    source = getCommit(repo, sha).tree;
  } else if (staged) {
    if (!headSha(repo)) {
      out.error('fatal: could not resolve HEAD');
      out.hint('Aún no hay commits. Para sacar un archivo del staging en un repositorio nuevo usa: git rm --cached <archivo>');
      return;
    }
    source = headTree(repo);
  } else source = repo.index;

  const conflicts = repo.operation?.conflicts ?? [];
  if (a.flags['ours'] || a.flags['theirs']) {
    const op = repo.operation;
    if (!op) {
      out.error('error: --ours/--theirs solo tienen sentido durante un conflicto');
      return;
    }
    const tree = a.flags['ours'] ? headTree(repo) : getCommit(repo, op.theirs).tree;
    const { matched } = matchPathspecs(ctx, repo, specs, conflicts);
    for (const p of matched) {
      if (p in tree) writeWork(world, repo, p, readBlob(repo.objects, tree[p]));
      else deleteWork(world, repo, p);
    }
    out.hint(`Se escribió la versión ${a.flags['ours'] ? '"ours" (rama actual)' : '"theirs" (rama fusionada)'}. Revisa el archivo y márcalo como resuelto con git add.`);
    return;
  }

  // Rutas candidatas: las del origen y, si se restaura staging o worktree, las actuales.
  const work = worktree(world, repo);
  const candidates = [...new Set([...Object.keys(source), ...(staged ? Object.keys(repo.index) : []), ...(sourceRev ? Object.keys(repo.index) : [])])];
  const { matched, unmatched } = matchPathspecs(ctx, repo, specs, candidates);
  if (unmatched.length) {
    out.error(`error: pathspec '${unmatched[0]}' did not match any file(s) known to git`);
    const rel = unmatched[0];
    if (rel in work) out.hint(`"${rel}" no está rastreado (untracked): Git no tiene ninguna versión guardada a la que volver. Para borrarlo usa rm o git clean.`);
    return;
  }
  for (const p of matched) {
    if (conflicts.includes(p) && !staged) {
      out.error(`error: path '${p}' is unmerged`);
      continue;
    }
    if (staged) {
      if (p in source) repo.index[p] = source[p];
      else delete repo.index[p];
      if (repo.operation) repo.operation.conflicts = repo.operation.conflicts.filter((c) => c !== p);
    }
    if (worktreeFlag) {
      if (p in source) writeWork(world, repo, p, readBlob(repo.objects, source[p]));
      else if (staged || sourceRev) deleteWork(world, repo, p);
    }
  }
  if (!out.ok) return;
  if (staged && !a.flags['worktree']) out.hint('Los archivos salieron del staging area, pero tus cambios siguen intactos en el working directory.');
  else if (staged) out.hint('Se restauraron staging y working directory: los cambios de esos archivos se perdieron.');
  else out.hint(`Se descartaron los cambios no preparados${sourceRev ? ` (contenido tomado de ${sourceRev})` : ''}. Esta operación no se puede deshacer con Git.`);
}

export function gitReset(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['soft', 'mixed', 'hard', 'keep', 'merge', 'q', 'quiet'], alias: { q: 'quiet' } });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out, world } = ctx;
  const modes = ['soft', 'mixed', 'hard', 'keep', 'merge'].filter((m) => a.flags[m]);
  if (modes.length > 1) {
    out.error(`fatal: options '--${modes[0]}' and '--${modes[1]}' cannot be used together`);
    return;
  }
  const mode = modes[0] ?? 'mixed';
  if (mode === 'keep' || mode === 'merge') {
    out.error(`error: --${mode} no está disponible en el simulador; usa --soft, --mixed o --hard.`);
    return;
  }
  // ¿git reset [<rev>] [--] <rutas>?
  let rev = 'HEAD';
  let specs = [...a.paths];
  if (a.positional.length) {
    const first = a.positional[0];
    const knownPaths = [...new Set([...Object.keys(worktree(world, repo)), ...Object.keys(repo.index), ...Object.keys(headTree(repo))])];
    const isPath = matchPathspecs(ctx, repo, [first], knownPaths).matched.length > 0;
    if (first === 'HEAD' || resolveRev(repo, first) || (!isPath && !a.dashDash)) {
      rev = first;
      specs.push(...a.positional.slice(1));
    } else specs = [...a.positional, ...specs];
  }
  const head = headSha(repo);
  const target = rev === 'HEAD' && !head ? null : resolveRev(repo, rev);
  if (rev !== 'HEAD' && !target) {
    out.error(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`);
    if (/^HEAD~\d+$/.test(rev)) out.hint('No hay tantos commits anteriores en esta rama. Revisa el historial con git log --oneline.');
    return;
  }
  const targetTree: Tree = target ? getCommit(repo, target).tree : {};

  if (specs.length) {
    if (mode !== 'mixed') {
      out.error(`fatal: Cannot do ${mode} reset with paths.`);
      out.hint('Con rutas, git reset solo actualiza el staging area. Para descartar cambios de un archivo usa git restore.');
      return;
    }
    const { matched, unmatched } = matchPathspecs(ctx, repo, specs, [...new Set([...Object.keys(repo.index), ...Object.keys(targetTree)])]);
    if (unmatched.length) {
      out.error(`error: pathspec '${unmatched[0]}' did not match any file(s) known to git`);
      return;
    }
    for (const p of matched) {
      if (p in targetTree) repo.index[p] = targetTree[p];
      else delete repo.index[p];
    }
    const st = computeStatus(world, repo);
    if (st.unstaged.length || matched.length) {
      const lines = st.unstaged.map((c) => `${c.kind === 'deleted' ? 'D' : 'M'}\t${displayPath(ctx, repo, c.path)}`);
      if (lines.length) {
        out.line('Unstaged changes after reset:');
        for (const l of lines) out.line(l);
      }
    }
    out.hint('Equivale a git restore --staged: el archivo sale del staging pero conserva tus cambios.');
    return;
  }

  if (!target) {
    // reset en un repositorio sin commits: vacía el índice.
    repo.index = {};
    return;
  }
  const prevHead = head;
  if (mode === 'hard') hardResetTree(ctx, repo, targetTree);
  else if (mode === 'mixed') repo.index = { ...targetTree };
  if (repo.operation) repo.operation = null;
  repo.config['__ORIG_HEAD'] = prevHead ?? '';
  updateHead(world, repo, target, `reset: moving to ${rev}`);

  if (mode === 'hard') {
    out.line(`HEAD is now at ${short(target)} ${firstLine(getCommit(repo, target).message)}`);
    out.hint('--hard movió la rama Y sobrescribió staging y working directory. Los commits "perdidos" aún se pueden recuperar con git reflog.');
  } else if (mode === 'mixed') {
    const st = computeStatus(world, repo);
    if (st.unstaged.length) {
      out.line('Unstaged changes after reset:');
      for (const c of st.unstaged) out.line(`${c.kind === 'deleted' ? 'D' : 'M'}\t${displayPath(ctx, repo, c.path)}`);
    }
    out.hint('--mixed movió la rama y vació el staging, pero tus archivos conservan los cambios (ahora sin preparar).');
  } else {
    out.hint('--soft solo movió la rama: los cambios de los commits deshechos quedaron preparados en staging.');
  }
}

export function gitReflog(ctx: GitCtx, argv: string[]): void {
  const sub = argv[0] && !argv[0].startsWith('-') && ['show', 'expire', 'delete'].includes(argv[0]) ? argv[0] : 'show';
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out } = ctx;
  if (sub !== 'show') {
    out.error(`error: "git reflog ${sub}" no está disponible en el simulador.`);
    return;
  }
  const a = parseArgs(argv[0] === 'show' ? argv.slice(1) : argv, { value: ['n'], bool: ['all'] });
  if (!repo.reflog.length) {
    if (!headSha(repo)) out.error(`fatal: your current branch '${currentBranch(repo)}' does not have any commits yet`);
    return;
  }
  const deco = decorations(repo);
  const limit = a.flags['n'] ? parseInt(a.flags['n'] as string, 10) : Infinity;
  repo.reflog.slice(0, limit).forEach((e, i) => {
    out.line([short(e.sha), 'yellow'], ...(i === 0 ? decoSegs(deco[e.sha]) : []), ` HEAD@{${i}}: ${e.message}`);
  });
  out.hint('El reflog registra cada movimiento de HEAD en TU repositorio local. Usa git reset --hard HEAD@{n} o git branch rescate <sha> para recuperar trabajo.');
}

export function gitClean(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['f', 'force', 'n', 'dry-run', 'd', 'x', 'X', 'i', 'interactive', 'q', 'quiet'], alias: { f: 'force', n: 'dry-run', i: 'interactive', q: 'quiet' } });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out, world } = ctx;
  if (a.flags['interactive']) {
    out.error('error: el modo interactivo de git clean no está disponible. Usa -n para previsualizar.');
    return;
  }
  if (!a.flags['force'] && !a.flags['dry-run']) {
    out.error('fatal: clean.requireForce defaults to true and neither -i, -n, nor -f given; refusing to clean');
    out.hint('git clean borra archivos sin rastrear de forma permanente. Primero mira qué borraría con git clean -n y después usa -f.');
    return;
  }
  const st = computeStatus(world, repo);
  const rules = ignoreRules(world, repo);
  let candidates = st.untracked;
  if (a.flags['x']) candidates = [...st.untracked, ...st.ignored];
  else if (a.flags['X']) candidates = st.ignored;
  const filter = a.positional.length || a.paths.length ? matchPathspecs(ctx, repo, [...a.positional, ...a.paths], candidates).matched : candidates;
  const grouped = collapseUntracked(filter, repo.index);
  const verb = a.flags['dry-run'] ? 'Would remove' : 'Removing';
  let removed = 0;
  for (const g of grouped) {
    if (g.endsWith('/') && !a.flags['d']) continue;
    if (g.endsWith('/') && !a.flags['x'] && !a.flags['X']) {
      // No borrar carpetas que solo contienen archivos ignorados sin -x.
    }
    out.line(`${verb} ${displayPath(ctx, repo, g.replace(/\/$/, ''))}${g.endsWith('/') ? '/' : ''}`);
    removed++;
    if (!a.flags['dry-run']) remove(world.fs, `${repo.root}/${g.replace(/\/$/, '')}`);
  }
  void rules;
  void isIgnored;
  void hashBlob;
  if (!removed && grouped.some((g) => g.endsWith('/')) && !a.flags['d']) {
    out.hint('Hay carpetas sin rastrear. git clean no las borra sin la opción -d.');
  }
  if (a.flags['dry-run'] && removed) out.hint('Esto era una simulación (-n). Ejecuta git clean -f (y -d para carpetas) para borrarlos de verdad.');
}
