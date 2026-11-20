/**
 * Ramas y fusiones: branch, switch, checkout, merge, tag, stash,
 * cherry-pick y rebase.
 */
import { parseArgs } from '../args';
import { Out } from '../output';
import { hashBlob } from '../sha1';
import { mergeText } from '../merge';
import {
  aheadBehind,
  computeStatus,
  createCommit,
  currentBranch,
  firstLine,
  getCommit,
  headSha,
  headTree,
  identity,
  isAncestor,
  isClean,
  logOrder,
  mergeBase,
  readBlob,
  recordReflog,
  resolveRev,
  short,
  storeBlob,
  treesEqual,
  updateHead,
  worktree,
  writeWork,
  deleteWork,
  applyTreeSwitch,
  checkTreeSwitch,
  formatSwitchError,
  formatDate,
} from '../repo';
import type { Repository, Tree } from '../types';
import { type GitCtx, matchPathspecs, requireRepo, allPaths } from './context';
import { trackingInfo } from './basic';
import { applyThreeWay, carriedChanges, hardResetTree, switchTo } from './ops';
import { commitSummary, renderStat, treeDeltas } from './render';

export function validBranchName(name: string): boolean {
  if (!name || name.startsWith('-') || name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock')) return false;
  if (/[\s~^:?*[\\]|\.\.|@\{|\/\/|^\/|\/\./.test(name)) return false;
  if (name === 'HEAD' || name === '@') return false;
  return true;
}

function previousBranch(repo: Repository): string | null {
  for (const e of repo.reflog) {
    const m = /^checkout: moving from (\S+) to (\S+)$/.exec(e.message);
    if (m) return m[1];
  }
  return null;
}

function isMergedIntoHeadOrUpstream(repo: Repository, branch: string): boolean {
  const sha = repo.heads[branch];
  const head = headSha(repo);
  if (head && isAncestor(repo.objects, sha, head)) return true;
  const up = repo.upstream[branch];
  const upSha = up ? repo.remoteRefs[`${up.remote}/${up.branch}`] : undefined;
  return !!upSha && isAncestor(repo.objects, sha, upSha);
}

// ---------------------------------------------------------------------------
// branch
// ---------------------------------------------------------------------------

export function gitBranch(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, {
    bool: ['a', 'all', 'r', 'remotes', 'v', 'vv', 'verbose', 'd', 'delete', 'D', 'm', 'move', 'M', 'f', 'force', 'show-current', 'unset-upstream', 'list', 'l', 'c', 'copy'],
    value: ['u', 'set-upstream-to', 'merged', 'no-merged', 'contains'],
    alias: { a: 'all', r: 'remotes', d: 'delete', m: 'move', f: 'force', u: 'set-upstream-to', l: 'list', c: 'copy' },
  });
  // --merged/--no-merged sin valor equivalen a HEAD
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out } = ctx;
  const cur = currentBranch(repo);
  const head = headSha(repo);

  if (a.flags['show-current']) {
    if (cur) out.line(cur);
    return;
  }

  if (a.flags['delete'] || a.flags['D']) {
    const force = !!a.flags['D'] || !!a.flags['force'];
    if (!a.positional.length) {
      out.error('fatal: branch name required');
      return;
    }
    if (a.flags['remotes']) {
      for (const name of a.positional) {
        if (!(name in repo.remoteRefs)) {
          out.error(`error: remote-tracking branch '${name}' not found`);
          continue;
        }
        out.line(`Deleted remote-tracking branch ${name} (was ${short(repo.remoteRefs[name])}).`);
        delete repo.remoteRefs[name];
      }
      return;
    }
    for (const name of a.positional) {
      if (!(name in repo.heads)) {
        out.error(`error: branch '${name}' not found`);
        out.hint('Lista las ramas existentes con "git branch" (o "git branch -a" para incluir las remotas).');
        continue;
      }
      if (name === cur) {
        out.error(`error: cannot delete branch '${name}' used by worktree at '${repo.root}'`);
        out.hint('No puedes borrar la rama en la que estás. Cámbiate primero a otra: git switch main');
        continue;
      }
      if (!force && !isMergedIntoHeadOrUpstream(repo, name)) {
        out.error(`error: the branch '${name}' is not fully merged\nhint: If you are sure you want to delete it, run 'git branch -D ${name}'`);
        out.hint('La rama tiene commits que no están en ninguna otra rama. Fusiónala antes o usa -D si quieres descartarlos (se pueden recuperar con git reflog).');
        continue;
      }
      out.line(`Deleted branch ${name} (was ${short(repo.heads[name])}).`);
      delete repo.heads[name];
      delete repo.upstream[name];
    }
    return;
  }

  if (a.flags['move'] || a.flags['M'] || a.flags['copy']) {
    const copy = !!a.flags['copy'];
    const [x, y] = a.positional;
    const oldName = y ? x : cur;
    const newName = y ?? x;
    if (!newName || !oldName) {
      out.error('fatal: branch name required');
      return;
    }
    if (!(oldName in repo.heads)) {
      if (oldName === cur && !head) {
        // Rama sin commits: solo cambia el nombre de HEAD.
        repo.head = { kind: 'branch', name: newName };
        return;
      }
      out.error(`error: refname refs/heads/${oldName} not found\nfatal: Branch rename failed`);
      return;
    }
    if (!validBranchName(newName)) {
      out.error(`fatal: '${newName}' is not a valid branch name`);
      return;
    }
    if (newName in repo.heads && !a.flags['M'] && !a.flags['force']) {
      out.error(`fatal: a branch named '${newName}' already exists`);
      return;
    }
    repo.heads[newName] = repo.heads[oldName];
    if (!copy) {
      delete repo.heads[oldName];
      if (repo.upstream[oldName]) {
        repo.upstream[newName] = repo.upstream[oldName];
        delete repo.upstream[oldName];
      }
      if (cur === oldName) repo.head = { kind: 'branch', name: newName };
    }
    return;
  }

  if (a.flags['set-upstream-to'] !== undefined) {
    const target = a.flags['set-upstream-to'] as string;
    const branch = a.positional[0] ?? cur;
    if (!branch) {
      out.error('fatal: could not set upstream of HEAD to ' + target + ' when it does not point to any branch.');
      return;
    }
    if (!(target in repo.remoteRefs)) {
      out.error(`error: the requested upstream branch '${target}' does not exist`);
      out.hint('Ejecuta "git fetch" para descargar las ramas remotas, o publica la rama con git push -u origin ' + branch);
      return;
    }
    const [remote, ...rest] = target.split('/');
    repo.upstream[branch] = { remote, branch: rest.join('/') };
    out.line(`branch '${branch}' set up to track '${target}'.`);
    return;
  }
  if (a.flags['unset-upstream']) {
    const branch = a.positional[0] ?? cur;
    if (!branch || !repo.upstream[branch]) {
      out.error(`fatal: branch '${branch}' has no upstream information`);
      return;
    }
    delete repo.upstream[branch];
    return;
  }

  // Crear rama
  if (a.positional.length && !a.flags['list']) {
    const [name, start] = a.positional;
    if (!validBranchName(name)) {
      out.error(`fatal: '${name}' is not a valid branch name`);
      out.hint('Los nombres no pueden contener espacios, "..", "~", "^", ":" ni empezar por "-". Ejemplo válido: feature/login');
      return;
    }
    if (name in repo.heads && !a.flags['force']) {
      out.error(`fatal: a branch named '${name}' already exists`);
      return;
    }
    const sha = start ? resolveRev(repo, start) : head;
    if (!sha) {
      out.error(`fatal: not a valid object name: '${start ?? cur}'`);
      if (!head) out.hint('Una rama es un puntero a un commit. Necesitas al menos un commit antes de crear ramas.');
      return;
    }
    repo.heads[name] = sha;
    if (start && start in repo.remoteRefs) {
      const [remote, ...rest] = start.split('/');
      repo.upstream[name] = { remote, branch: rest.join('/') };
      out.line(`branch '${name}' set up to track '${start}'.`);
    }
    return;
  }

  // Listar
  const verbose = a.flags['verbose'] || a.flags['v'] || a.flags['vv'];
  let names = Object.keys(repo.heads).sort();
  const mergedRef = a.flags['merged'] ?? (argv.includes('--merged') ? 'HEAD' : undefined);
  const filterSha = (ref: string | boolean | undefined) => (typeof ref === 'string' ? resolveRev(repo, ref) : null);
  if (mergedRef !== undefined) {
    const t = filterSha(mergedRef);
    if (t) names = names.filter((n) => isAncestor(repo.objects, repo.heads[n], t));
  }
  if (a.flags['no-merged'] !== undefined) {
    const t = filterSha(a.flags['no-merged']);
    if (t) names = names.filter((n) => !isAncestor(repo.objects, repo.heads[n], t));
  }
  if (a.flags['contains'] !== undefined) {
    const t = filterSha(a.flags['contains']);
    if (t) names = names.filter((n) => isAncestor(repo.objects, t, repo.heads[n]));
  }
  const width = Math.max(0, ...names.map((n) => n.length));
  if (!a.flags['remotes']) {
    if (repo.head.kind === 'detached') out.line('* ', [`(HEAD detached at ${short(repo.head.sha)})`, 'green']);
    for (const n of names) {
      const isCur = n === cur;
      const segs: [string, 'green' | 'yellow' | 'blue' | undefined][] = [[isCur ? '* ' : '  ', undefined], [verbose ? n.padEnd(width) : n, isCur ? 'green' : undefined]];
      if (verbose) {
        const c = getCommit(repo, repo.heads[n]);
        segs.push([' ' + short(c.sha), 'yellow']);
        const up = repo.upstream[n];
        if (a.flags['vv'] && up) {
          const ref = `${up.remote}/${up.branch}`;
          const rs = repo.remoteRefs[ref];
          let info = ref;
          if (!rs) info += ': gone';
          else {
            const ab = aheadBehind(repo.objects, repo.heads[n], rs);
            const parts = [];
            if (ab.ahead) parts.push(`ahead ${ab.ahead}`);
            if (ab.behind) parts.push(`behind ${ab.behind}`);
            if (parts.length) info += ': ' + parts.join(', ');
          }
          segs.push([' [', undefined], [info, 'blue'], [']', undefined]);
        }
        segs.push([' ' + firstLine(c.message), undefined]);
      }
      out.line(...segs);
    }
    if (!names.length && !head && cur && !a.flags['all']) {
      out.hint(`La rama "${cur}" aún no existe: se creará cuando hagas el primer commit.`);
    }
  }
  if (a.flags['all'] || a.flags['remotes']) {
    const remotes = Object.keys(repo.remoteRefs).sort();
    for (const r of remotes) {
      const label = a.flags['all'] ? `remotes/${r}` : r;
      if (verbose) {
        const c = getCommit(repo, repo.remoteRefs[r]);
        out.line('  ', [label, 'red'], [' ' + short(c.sha), 'yellow'], ' ' + firstLine(c.message));
      } else out.line('  ', [label, 'red']);
    }
    if (a.flags['remotes'] && !remotes.length) {
      out.hint('No hay ramas remotas registradas. Configura un remoto (git remote add) y ejecuta git fetch.');
    }
  }
}

// ---------------------------------------------------------------------------
// switch / checkout
// ---------------------------------------------------------------------------

function announceSwitch(ctx: GitCtx, repo: Repository, branch: string, created: boolean, carried: string[]) {
  for (const c of carried) ctx.out.line(c);
  ctx.out.line(created ? `Switched to a new branch '${branch}'` : `Switched to branch '${branch}'`);
  for (const l of trackingInfo(repo)) ctx.out.line(l);
}

function detachedMessage(ctx: GitCtx, rev: string, sha: string, repo: Repository) {
  ctx.out.text(
    `Note: switching to '${rev}'.\n\nYou are in 'detached HEAD' state. You can look around, make experimental\nchanges and commit them, and you can discard any commits you make in this\nstate without impacting any branches by switching back to a branch.\n\nIf you want to create a new branch to retain commits you create, you may\ndo so (now or later) by using -c with the switch command. Example:\n\n  git switch -c <new-branch-name>\n\nOr undo this operation with:\n\n  git switch -\n\nHEAD is now at ${short(sha)} ${firstLine(getCommit(repo, sha).message)}`,
  );
  ctx.out.hint('HEAD ya no apunta a una rama sino directamente a un commit. Si haces commits aquí, crea una rama para no perderlos.');
}

/** Crea una rama local que sigue a la remota si existe origin/<name> (comportamiento DWIM). */
function dwimRemote(repo: Repository, name: string): string | null {
  const matches = Object.keys(repo.remoteRefs).filter((r) => r.split('/').slice(1).join('/') === name);
  return matches.length === 1 ? matches[0] : null;
}

function createAndSwitch(ctx: GitCtx, repo: Repository, name: string, start: string | undefined, force: boolean): void {
  const { out } = ctx;
  if (!validBranchName(name)) {
    out.error(`fatal: '${name}' is not a valid branch name`);
    out.hint('Ejemplos de nombres válidos: feature/login, fix/error-login, docs/actualizar-readme');
    return;
  }
  if (name in repo.heads && !force) {
    out.error(`fatal: a branch named '${name}' already exists`);
    out.hint(`Para cambiarte a ella usa: git switch ${name}`);
    return;
  }
  const head = headSha(repo);
  const sha = start ? resolveRev(repo, start) : head;
  if (start && !sha) {
    out.error(`fatal: invalid reference: ${start}`);
    return;
  }
  if (!sha) {
    // Rama sin commits: solo se renombra HEAD.
    repo.head = { kind: 'branch', name };
    out.line(`Switched to a new branch '${name}'`);
    return;
  }
  const carried = sha === head ? carriedChanges(ctx, repo) : [];
  const prevHeads = { ...repo.heads };
  repo.heads[name] = sha;
  if (!switchTo(ctx, repo, { branch: name, sha }, 'switch')) {
    repo.heads = prevHeads;
    return;
  }
  if (start && start in repo.remoteRefs) {
    const [remote, ...rest] = start.split('/');
    repo.upstream[name] = { remote, branch: rest.join('/') };
    out.line(`branch '${name}' set up to track '${start}'.`);
  }
  announceSwitch(ctx, repo, name, true, carried);
}

function switchBranch(ctx: GitCtx, repo: Repository, name: string): void {
  const { out } = ctx;
  if (name === currentBranch(repo)) {
    out.line(`Already on '${name}'`);
    for (const l of trackingInfo(repo)) out.line(l);
    return;
  }
  const sha = repo.heads[name];
  const carried = sha === headSha(repo) ? carriedChanges(ctx, repo) : [];
  if (!switchTo(ctx, repo, { branch: name, sha }, 'switch')) return;
  announceSwitch(ctx, repo, name, false, carried.length ? carried : carriedChanges(ctx, repo));
}

export function gitSwitch(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, {
    bool: ['d', 'detach', 'f', 'force', 'discard-changes', 'q', 'quiet', 't', 'track'],
    value: ['c', 'create', 'C', 'force-create', 'orphan'],
    alias: { c: 'create', C: 'force-create', d: 'detach', f: 'force' },
  });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out } = ctx;
  if (repo.operation) {
    out.error(`fatal: cannot switch branch while ${repo.operation.kind === 'merge' ? 'merging' : repo.operation.kind === 'rebase' ? 'rebasing' : repo.operation.kind + 'ing'}\nConsider "git ${repo.operation.kind} --quit" or "git worktree add".`);
    out.hint(`Termina la operación en curso (resuelve conflictos y confirma) o cancélala con git ${repo.operation.kind} --abort.`);
    return;
  }
  const create = (a.flags['create'] ?? a.flags['force-create']) as string | undefined;
  if (create) return createAndSwitch(ctx, repo, create, a.positional[0], !!a.flags['force-create']);
  let target = a.positional[0];
  if (!target) {
    out.error('fatal: missing branch or commit argument');
    out.hint('Uso: git switch <rama>   ·   git switch -c <rama-nueva>');
    return;
  }
  if (target === '-') {
    const prev = previousBranch(repo);
    if (!prev) {
      out.error("fatal: invalid reference: @{-1}");
      return;
    }
    target = prev;
  }
  if (a.flags['detach']) {
    const sha = resolveRev(repo, target);
    if (!sha) {
      out.error(`fatal: invalid reference: ${target}`);
      return;
    }
    if (!switchTo(ctx, repo, { sha }, 'switch')) return;
    out.line(`HEAD is now at ${short(sha)} ${firstLine(getCommit(repo, sha).message)}`);
    return;
  }
  if (target in repo.heads) return switchBranch(ctx, repo, target);
  const remote = dwimRemote(repo, target);
  if (remote) return createAndSwitch(ctx, repo, target, remote, false);
  const sha = resolveRev(repo, target);
  if (sha) {
    out.error(`fatal: a branch is expected, got commit '${target}'\nhint: If you want to detach HEAD at the commit, try again with the --detach option.`);
    return;
  }
  out.error(`fatal: invalid reference: ${target}`);
  out.hint(`La rama "${target}" no existe. Para crearla y cambiarte a ella: git switch -c ${target}`);
}

export function gitCheckout(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['f', 'force', 'q', 'quiet', 'detach', 't', 'track'], value: ['b', 'B', 'orphan'], alias: { f: 'force', q: 'quiet' } });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out } = ctx;
  const newBranch = (a.flags['b'] ?? a.flags['B']) as string | undefined;
  if (newBranch) {
    if (repo.operation) {
      out.error(`fatal: cannot switch branch while ${repo.operation.kind}ing`);
      return;
    }
    return createAndSwitch(ctx, repo, newBranch, a.positional[0], !!a.flags['B']);
  }

  // Forma de archivos: git checkout [rev] -- <rutas>
  const restoreFiles = (rev: string | null, specs: string[]) => {
    const sourceSha = rev ? resolveRev(repo, rev) : null;
    if (rev && !sourceSha) {
      out.error(`fatal: invalid reference: ${rev}`);
      return;
    }
    const sourceTree: Tree = sourceSha ? getCommit(repo, sourceSha).tree : repo.index;
    const { matched, unmatched } = matchPathspecs(ctx, repo, specs, Object.keys(sourceTree));
    if (unmatched.length) {
      out.error(`error: pathspec '${unmatched[0]}' did not match any file(s) known to git`);
      return;
    }
    for (const p of matched) {
      writeWork(ctx.world, repo, p, readBlob(repo.objects, sourceTree[p]));
      if (sourceSha) repo.index[p] = sourceTree[p];
    }
    out.line(`Updated ${matched.length} path${matched.length === 1 ? '' : 's'} from ${sourceSha ? short(sourceSha) : 'the index'}`);
    out.hint('Esta es la forma antigua. Hoy se recomienda git restore <archivo> (o git restore --source=<commit> <archivo>).');
  };

  if (a.dashDash) {
    if (!a.paths.length) {
      out.error('fatal: you must specify path(s) to restore');
      return;
    }
    return restoreFiles(a.positional[0] ?? null, a.paths);
  }
  let target = a.positional[0];
  if (!target) {
    out.error('fatal: you must specify a branch, commit or path');
    out.hint('Ejemplos: git checkout main · git checkout -b feature/x · git checkout -- archivo.txt');
    return;
  }
  if (a.positional.length > 1) {
    return restoreFiles(target, a.positional.slice(1));
  }
  if (target === '-') target = previousBranch(repo) ?? '-';
  if (repo.operation && (target in repo.heads || resolveRev(repo, target))) {
    out.error(`error: you need to resolve your current index first`);
    out.hint(`Hay un ${repo.operation.kind} en curso. Termínalo o usa git ${repo.operation.kind} --abort.`);
    return;
  }
  if (target in repo.heads) return switchBranch(ctx, repo, target);
  const remote = dwimRemote(repo, target);
  if (remote) return createAndSwitch(ctx, repo, target, remote, false);
  const sha = resolveRev(repo, target);
  if (sha) {
    if (!switchTo(ctx, repo, { sha }, 'checkout')) return;
    detachedMessage(ctx, target, sha, repo);
    return;
  }
  // ¿Es una ruta? (git checkout archivo)
  const { matched } = matchPathspecs(ctx, repo, [target], allPaths(ctx, repo));
  if (matched.length) return restoreFiles(null, [target]);
  out.error(`error: pathspec '${target}' did not match any file(s) known to git`);
  out.hint(`No existe una rama, commit ni archivo llamado "${target}". Para crear la rama: git checkout -b ${target}`);
}

// ---------------------------------------------------------------------------
// merge
// ---------------------------------------------------------------------------

export function mergeInto(
  ctx: GitCtx,
  repo: Repository,
  theirsSha: string,
  theirsLabel: string,
  opts: { noFF?: boolean; ffOnly?: boolean; squash?: boolean; noCommit?: boolean; message?: string; defaultMessage?: string },
): boolean {
  const { out, world } = ctx;
  const ours = headSha(repo);
  const cur = currentBranch(repo);
  if (!ours) {
    // Rama sin commits: se adopta directamente el historial ajeno.
    const err = checkTreeSwitch(world, repo, {}, getCommit(repo, theirsSha).tree);
    if (err) {
      out.error(formatSwitchError(err, 'merge'));
      return false;
    }
    applyTreeSwitch(world, repo, {}, getCommit(repo, theirsSha).tree);
    updateHead(world, repo, theirsSha, `merge ${theirsLabel}: Fast-forward`);
    return true;
  }
  if (isAncestor(repo.objects, theirsSha, ours)) {
    out.line('Already up to date.');
    return true;
  }
  const canFF = isAncestor(repo.objects, ours, theirsSha);
  if (canFF && !opts.noFF && !opts.squash) {
    const from = headTree(repo);
    const to = getCommit(repo, theirsSha).tree;
    const err = checkTreeSwitch(world, repo, from, to);
    if (err) {
      out.error(formatSwitchError(err, 'merge'));
      return false;
    }
    out.line(`Updating ${short(ours)}..${short(theirsSha)}`);
    out.line('Fast-forward');
    renderStat(out, treeDeltas(repo.objects, from, to));
    for (const m of commitSummary(repo.objects, from, to).modes) out.line(m);
    applyTreeSwitch(world, repo, from, to);
    updateHead(world, repo, theirsSha, `merge ${theirsLabel}: Fast-forward`);
    out.hint('Fast-forward: la rama actual no tenía commits propios, así que Git solo movió el puntero hacia delante (sin commit de merge).');
    return true;
  }
  if (opts.ffOnly) {
    out.error('fatal: Not possible to fast-forward, aborting.');
    out.hint('Las ramas han divergido: cada una tiene commits que la otra no tiene. Necesitas un merge normal o un rebase.');
    return false;
  }
  const st = computeStatus(world, repo);
  if (st.staged.length) {
    out.error('error: Your local changes to the following files would be overwritten by merge:\n' + st.staged.map((c) => '\t' + c.path).join('\n') + '\nPlease commit your changes or stash them before you merge.\nAborting');
    return false;
  }
  const baseSha = mergeBase(repo.objects, ours, theirsSha);
  const baseTree = baseSha ? getCommit(repo, baseSha).tree : {};
  const oursTree = headTree(repo);
  const theirsTree = getCommit(repo, theirsSha).tree;
  const res = applyThreeWay(ctx, repo, baseTree, oursTree, theirsTree, 'HEAD', theirsLabel);
  if ('error' in res) {
    out.error(res.error);
    return false;
  }
  const message =
    opts.message ??
    opts.defaultMessage ??
    (theirsLabel.includes('/') && theirsLabel in repo.remoteRefs
      ? `Merge remote-tracking branch '${theirsLabel}'`
      : `Merge branch '${theirsLabel}'${cur && cur !== 'main' && cur !== 'master' ? ` into ${cur}` : ''}`);

  if (opts.squash) {
    out.line('Squash commit -- not updating HEAD');
    if (res.conflicts.length) {
      out.line('Automatic merge failed; fix conflicts and then commit the result.');
      repo.operation = { kind: 'merge', theirs: theirsSha, theirsLabel, origHead: ours, origBranch: cur, message, conflicts: res.conflicts };
      repo.operation.kind = 'merge';
      return false;
    }
    out.line('Automatic merge went well; stopped before committing as requested');
    out.hint('--squash deja todos los cambios de la rama preparados en staging como un único cambio. Confírmalos con git commit.');
    return true;
  }
  if (res.conflicts.length || opts.noCommit) {
    repo.operation = { kind: 'merge', theirs: theirsSha, theirsLabel, origHead: ours, origBranch: cur, message, conflicts: res.conflicts };
    repo.config['__ORIG_HEAD'] = ours;
    if (res.conflicts.length) {
      out.error('Automatic merge failed; fix conflicts and then commit the result.');
      out.hint(
        'Ambas ramas modificaron las mismas líneas. Pasos para resolverlo:\n' +
          '1) git status para ver los archivos en conflicto\n' +
          '2) edita cada archivo (o usa git mergetool) y elimina los marcadores <<<<<<< ======= >>>>>>>\n' +
          '3) git add <archivo>   4) git commit   — o cancela con git merge --abort',
      );
    } else out.line('Automatic merge went well; stopped before committing as requested');
    return false;
  }
  const who = identity(world, repo);
  if (!who) {
    out.error('fatal: unable to auto-detect email address (configura user.name y user.email)');
    return false;
  }
  const commit = createCommit(world, repo.objects, { tree: res.tree, parents: [ours, theirsSha], message, author: who });
  repo.config['__ORIG_HEAD'] = ours;
  updateHead(world, repo, commit.sha, `merge ${theirsLabel}: Merge made by the 'ort' strategy.`);
  out.line("Merge made by the 'ort' strategy.");
  renderStat(out, treeDeltas(repo.objects, oursTree, res.tree));
  for (const m of commitSummary(repo.objects, oursTree, res.tree).modes) out.line(m);
  out.hint('Se creó un commit de merge con dos padres: une el historial de ambas ramas.');
  return true;
}

export function gitMerge(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, {
    bool: ['abort', 'continue', 'no-ff', 'ff-only', 'ff', 'squash', 'no-commit', 'commit', 'quit', 'no-edit', 'edit', 'q', 'quiet', 'stat', 'allow-unrelated-histories'],
    value: ['m', 'message', 's', 'strategy', 'X'],
    alias: { m: 'message' },
  });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out } = ctx;
  const op = repo.operation;
  if (a.flags['abort'] || a.flags['quit']) {
    if (!op || op.kind !== 'merge') {
      out.error('fatal: There is no merge to abort (MERGE_HEAD missing).');
      return;
    }
    if (a.flags['abort']) hardResetTree(ctx, repo, headTree(repo));
    repo.operation = null;
    out.hint('Merge cancelado: el repositorio volvió al estado anterior a git merge.');
    return;
  }
  if (a.flags['continue']) {
    if (!op || op.kind !== 'merge') {
      out.error('fatal: There is no merge in progress (MERGE_HEAD missing).');
      return;
    }
    if (op.conflicts.length) {
      out.error('error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use \'git add/rm <file>\'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.');
      return;
    }
    const who = identity(ctx.world, repo)!;
    const commit = createCommit(ctx.world, repo.objects, { tree: { ...repo.index }, parents: [headSha(repo)!, op.theirs], message: op.message, author: who });
    updateHead(ctx.world, repo, commit.sha, `commit (merge): ${op.message}`);
    repo.operation = null;
    out.line(`[${currentBranch(repo) ?? 'detached HEAD'} ${short(commit.sha)}] ${op.message}`);
    return;
  }
  if (op) {
    out.error(op.kind === 'merge'
      ? 'error: Merging is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use \'git add/rm <file>\'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.'
      : `fatal: You have not concluded your ${op.kind} (${op.kind === 'rebase' ? 'rebase' : op.kind.toUpperCase().replace('-', '_') + '_HEAD'} exists).`);
    return;
  }
  const target = a.positional[0];
  if (!target) {
    const cur = currentBranch(repo);
    const up = cur ? repo.upstream[cur] : undefined;
    if (!up) {
      out.error('fatal: No remote for the current branch.');
      out.hint('Indica la rama que quieres fusionar en la actual: git merge <rama>');
      return;
    }
    return void gitMerge(ctx, [...argv, `${up.remote}/${up.branch}`]);
  }
  if (a.positional.length > 1) {
    out.error('error: el simulador solo admite fusionar una rama a la vez (octopus merge no disponible).');
    return;
  }
  const sha = resolveRev(repo, target);
  if (!sha) {
    out.error(`merge: ${target} - not something we can merge`);
    out.hint('Comprueba el nombre de la rama con git branch -a. Si es remota, ejecuta antes git fetch.');
    return;
  }
  if (target === currentBranch(repo)) {
    out.line('Already up to date.');
    return;
  }
  const head = headSha(repo);
  if (head && !mergeBase(repo.objects, head, sha) && !a.flags['allow-unrelated-histories']) {
    out.error('fatal: refusing to merge unrelated histories');
    out.hint('Las dos ramas no comparten ningún commit. Si es intencionado usa --allow-unrelated-histories.');
    return;
  }
  mergeInto(ctx, repo, sha, target, {
    noFF: !!a.flags['no-ff'],
    ffOnly: !!a.flags['ff-only'],
    squash: !!a.flags['squash'],
    noCommit: !!a.flags['no-commit'],
    message: a.flags['message'] as string | undefined,
  });
}

export function gitMergetool(ctx: GitCtx, argv: string[]): void {
  void argv;
  const repo = requireRepo(ctx);
  if (!repo) return;
  const conflicts = repo.operation?.conflicts ?? [];
  if (!conflicts.length) {
    ctx.out.line('No files need merging');
    return;
  }
  ctx.out.line('Merging:');
  for (const c of conflicts) ctx.out.line(c);
  ctx.out.blank();
  ctx.out.line(`Normal merge conflict for '${conflicts[0]}':`);
  ctx.out.line('  {local}: modified file');
  ctx.out.line('  {remote}: modified file');
  ctx.out.hint('Se abrió el editor visual de conflictos del laboratorio. Elige qué versión conservar en cada bloque.');
  ctx.events.push({ type: 'open-mergetool', path: `${repo.root}/${conflicts[0]}` });
}

// ---------------------------------------------------------------------------
// tag
// ---------------------------------------------------------------------------

export function gitTag(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['a', 'annotate', 'd', 'delete', 'l', 'list', 'f', 'force', 'n'], value: ['m', 'message'], alias: { a: 'annotate', d: 'delete', l: 'list', m: 'message', f: 'force' } });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out, world } = ctx;
  if (a.flags['delete']) {
    for (const t of a.positional) {
      if (!(t in repo.tags)) {
        out.error(`error: tag '${t}' not found.`);
        continue;
      }
      out.line(`Deleted tag '${t}' (was ${short(repo.tags[t].target)})`);
      delete repo.tags[t];
    }
    return;
  }
  const [name, rev] = a.positional;
  if (!name || a.flags['list']) {
    const pattern = a.flags['list'] && name ? new RegExp('^' + name.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$') : null;
    for (const t of Object.keys(repo.tags).sort()) {
      if (pattern && !pattern.test(t)) continue;
      out.line(a.flags['n'] ? `${t.padEnd(15)} ${repo.tags[t].message ?? firstLine(getCommit(repo, repo.tags[t].target).message)}` : t);
    }
    return;
  }
  if (!validBranchName(name)) {
    out.error(`fatal: '${name}' is not a valid tag name.`);
    return;
  }
  if (name in repo.tags && !a.flags['force']) {
    out.error(`fatal: tag '${name}' already exists`);
    return;
  }
  const sha = rev ? resolveRev(repo, rev) : headSha(repo);
  if (!sha) {
    out.error(`fatal: Failed to resolve '${rev ?? 'HEAD'}' as a valid ref.`);
    return;
  }
  const annotated = !!a.flags['annotate'] || a.flags['message'] !== undefined;
  if (annotated && !a.flags['message']) {
    out.error('fatal: no tag message?');
    out.hint('Las etiquetas anotadas necesitan mensaje: git tag -a v1.0.0 -m "Primera versión estable"');
    return;
  }
  const who = identity(world, repo);
  repo.tags[name] = {
    name,
    target: sha,
    annotated,
    message: annotated ? (a.flags['message'] as string) : undefined,
    tagger: annotated && who ? who : undefined,
    timestamp: annotated ? Date.now() : undefined,
  };
  out.hint(`Etiqueta "${name}" creada en ${short(sha)}. Las etiquetas no se suben solas: usa git push origin ${name} o git push --tags.`);
}

// ---------------------------------------------------------------------------
// stash
// ---------------------------------------------------------------------------

export function gitStash(ctx: GitCtx, argv: string[]): void {
  const sub = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'push';
  const rest = argv[0] && !argv[0].startsWith('-') ? argv.slice(1) : argv;
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out, world } = ctx;
  const head = headSha(repo);
  const ref = (s?: string) => {
    if (!s) return 0;
    const m = /^(?:stash@\{)?(\d+)\}?$/.exec(s);
    return m ? parseInt(m[1], 10) : -1;
  };
  const describe = (n: number) => `stash@{${n}}: ${repo.stash[n].message}`;

  switch (sub) {
    case 'push':
    case 'save': {
      const a = parseArgs(rest, { bool: ['u', 'include-untracked', 'k', 'keep-index', 'q'], value: ['m', 'message'], alias: { u: 'include-untracked', m: 'message', k: 'keep-index' } });
      if (!head) {
        out.error('You do not have the initial commit yet');
        return;
      }
      if (repo.operation) {
        out.error('error: no puedes hacer stash con conflictos sin resolver.');
        return;
      }
      const st = computeStatus(world, repo);
      const work = worktree(world, repo);
      const untracked = a.flags['include-untracked'] ? st.untracked : [];
      if (!st.staged.length && !st.unstaged.length && !untracked.length) {
        out.line('No local changes to save');
        if (st.untracked.length) out.hint('Los archivos nuevos (untracked) no se guardan por defecto. Usa git stash -u para incluirlos.');
        return;
      }
      const wt: Record<string, string | null> = {};
      for (const p of new Set([...Object.keys(repo.index), ...Object.keys(headTree(repo)), ...untracked])) {
        const cur = p in work ? work[p] : null;
        const base = headTree(repo)[p];
        if (cur === null ? base !== undefined || p in repo.index : hashBlob(cur) !== base) {
          wt[p] = cur;
          if (cur !== null) storeBlob(repo.objects, cur);
        }
      }
      const c = getCommit(repo, head);
      const msg = (a.flags['message'] as string | undefined) ?? (sub === 'save' && a.positional.length ? a.positional.join(' ') : undefined);
      const label = msg ? `On ${currentBranch(repo) ?? '(no branch)'}: ${msg}` : `WIP on ${currentBranch(repo) ?? '(no branch)'}: ${short(head)} ${firstLine(c.message)}`;
      repo.stash.unshift({ message: label, base: head, index: { ...repo.index }, worktree: wt, timestamp: Date.now() });
      const keep = a.flags['keep-index'] ? { ...repo.index } : null;
      hardResetTree(ctx, repo, headTree(repo));
      for (const p of untracked) deleteWork(world, repo, p);
      if (keep) {
        for (const [p, s] of Object.entries(keep)) {
          repo.index[p] = s;
          writeWork(world, repo, p, readBlob(repo.objects, s));
        }
      }
      out.line(`Saved working directory and index state ${label}`);
      out.hint('Tus cambios se guardaron en la pila de stash y el working directory quedó limpio. Recupéralos con git stash pop.');
      return;
    }
    case 'list':
      repo.stash.forEach((_, i) => out.line(describe(i)));
      return;
    case 'show': {
      const n = ref(rest.find((r) => !r.startsWith('-')));
      const s = repo.stash[n];
      if (!s) {
        out.error(n === 0 ? 'error: No stash entries found.' : `error: stash@{${n}} is not a valid reference`);
        return;
      }
      const base = getCommit(repo, s.base).tree;
      const after: Record<string, string> = {};
      for (const [p, sha] of Object.entries(base)) after[p] = readBlob(repo.objects, sha);
      for (const [p, c] of Object.entries(s.worktree)) {
        if (c === null) delete after[p];
        else after[p] = c;
      }
      renderStat(out, treeDeltas(repo.objects, base, after, false));
      return;
    }
    case 'drop':
    case 'clear': {
      if (sub === 'clear') {
        repo.stash = [];
        return;
      }
      const n = ref(rest[0]);
      if (!repo.stash[n]) {
        out.error(n === 0 ? 'error: No stash entries found.' : `error: stash@{${n}} is not a valid reference`);
        return;
      }
      out.line(`Dropped stash@{${n}} (${hashBlob(repo.stash[n].message).slice(0, 40)})`);
      repo.stash.splice(n, 1);
      return;
    }
    case 'apply':
    case 'pop': {
      const n = ref(rest.find((r) => !r.startsWith('-')));
      const s = repo.stash[n];
      if (!s) {
        out.error(n === 0 ? 'error: No stash entries found.' : `error: stash@{${n}} is not a valid reference`);
        return;
      }
      const work = worktree(world, repo);
      const headT = headTree(repo);
      const baseT = getCommit(repo, s.base).tree;
      const dirty: string[] = [];
      for (const p of Object.keys(s.worktree)) {
        const local = p in work ? hashBlob(work[p]) : undefined;
        if (local !== headT[p] && local !== (s.worktree[p] === null ? undefined : hashBlob(s.worktree[p]!))) dirty.push(p);
      }
      if (dirty.length) {
        out.error('error: Your local changes to the following files would be overwritten by merge:\n' + dirty.map((p) => '\t' + p).join('\n') + '\nPlease commit your changes or stash them before you merge.\nAborting');
        out.line('The stash entry is kept in case you need it again.');
        return;
      }
      let conflict = false;
      for (const [p, content] of Object.entries(s.worktree)) {
        const baseC = baseT[p] ? readBlob(repo.objects, baseT[p]) : '';
        const curC = headT[p] ? readBlob(repo.objects, headT[p]) : '';
        if (content === null) {
          if (p in headT) {
            deleteWork(world, repo, p);
          }
          continue;
        }
        if (headT[p] === baseT[p]) writeWork(world, repo, p, content);
        else {
          const m = mergeText(baseC, curC, content, 'Updated upstream', 'Stashed changes');
          writeWork(world, repo, p, m.content);
          if (!m.clean) {
            conflict = true;
            out.line(`CONFLICT (content): Merge conflict in ${p}`);
          } else out.line(`Auto-merging ${p}`);
        }
        // Los archivos nuevos que estaban en staging vuelven a estarlo.
        if (!(p in baseT) && p in s.index) repo.index[p] = storeBlob(repo.objects, content);
      }
      const sub2 = new Out();
      // Muestra un resumen de estado como Git.
      const st = computeStatus(world, repo);
      for (const c of st.staged) sub2.line(['\t' + c.kind + ': ' + c.path, 'green']);
      for (const c of st.unstaged) sub2.line(['\t' + c.kind + ': ' + c.path, 'red']);
      out.line(`On branch ${currentBranch(repo) ?? 'HEAD'}`);
      out.push(sub2.lines);
      if (conflict) {
        out.line('The stash entry is kept in case you need it again.');
        out.ok = false;
        return;
      }
      if (sub === 'pop') {
        out.line(`Dropped stash@{${n}} (${hashBlob(s.message).slice(0, 40)})`);
        repo.stash.splice(n, 1);
      }
      return;
    }
    default:
      out.error(`error: unknown subcommand: \`${sub}'`);
      out.hint('Subcomandos: git stash [push -m "msg"], list, show, apply, pop, drop, clear');
  }
}

// ---------------------------------------------------------------------------
// cherry-pick / revert (base común) y rebase
// ---------------------------------------------------------------------------

/** Aplica el cambio introducido por `commitSha` sobre HEAD (o lo invierte). */
export function replayCommit(
  ctx: GitCtx,
  repo: Repository,
  commitSha: string,
  mode: 'cherry-pick' | 'revert' | 'rebase',
): { ok: true; tree: Tree } | { ok: false; conflicts: string[] } | { ok: false; error: string } {
  const c = getCommit(repo, commitSha);
  const parentTree = c.parents[0] ? getCommit(repo, c.parents[0]).tree : {};
  const oursTree = headTree(repo);
  const label = `${short(c.sha)} (${firstLine(c.message)})`;
  const res =
    mode === 'revert'
      ? applyThreeWay(ctx, repo, c.tree, oursTree, parentTree, 'HEAD', `parent of ${label}`)
      : applyThreeWay(ctx, repo, parentTree, oursTree, c.tree, 'HEAD', label);
  if ('error' in res) return { ok: false, error: res.error };
  if (res.conflicts.length) return { ok: false, conflicts: res.conflicts };
  return { ok: true, tree: res.tree };
}

export function gitCherryPick(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['abort', 'continue', 'skip', 'n', 'no-commit', 'x', 'e', 'edit'], value: ['m', 'mainline'], alias: { n: 'no-commit' } });
  const repo = requireRepo(ctx);
  if (!repo) return;
  sequencer(ctx, repo, 'cherry-pick', a);
}

export function gitRevert(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['abort', 'continue', 'skip', 'n', 'no-commit', 'no-edit', 'edit'], value: ['m', 'mainline'], alias: { n: 'no-commit' } });
  const repo = requireRepo(ctx);
  if (!repo) return;
  sequencer(ctx, repo, 'revert', a);
}

function sequencer(ctx: GitCtx, repo: Repository, kind: 'cherry-pick' | 'revert', a: ReturnType<typeof parseArgs>): void {
  const { out, world } = ctx;
  const op = repo.operation;
  if (a.flags['abort']) {
    if (!op || op.kind !== kind) {
      out.error(`error: no ${kind} in progress\nfatal: ${kind} failed`);
      return;
    }
    hardResetTree(ctx, repo, headTree(repo));
    repo.operation = null;
    return;
  }
  if (a.flags['continue']) {
    if (!op || op.kind !== kind) {
      out.error(`error: no ${kind} in progress\nfatal: ${kind} failed`);
      return;
    }
    if (op.conflicts.length) {
      out.error(`error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.\nU\t${op.conflicts.join('\nU\t')}`);
      return;
    }
    const who = identity(world, repo)!;
    const author = kind === 'cherry-pick' ? getCommit(repo, op.theirs).author : who;
    const commit = createCommit(world, repo.objects, { tree: { ...repo.index }, parents: [headSha(repo)!], message: op.message, author, committer: who });
    updateHead(world, repo, commit.sha, `${kind}: ${firstLine(op.message)}`);
    repo.operation = null;
    out.line(`[${currentBranch(repo) ?? 'detached HEAD'} ${short(commit.sha)}] ${firstLine(op.message)}`);
    return;
  }
  if (a.flags['skip']) {
    if (!op || op.kind !== kind) {
      out.error(`error: no ${kind} in progress`);
      return;
    }
    hardResetTree(ctx, repo, headTree(repo));
    repo.operation = null;
    return;
  }
  if (op) {
    out.error(`error: ${kind === 'revert' ? 'Reverting' : 'Cherry-picking'} is not possible because you have unmerged files.\nfatal: ${kind} failed`);
    out.hint(`Hay una operación "${op.kind}" en curso. Termínala o cancélala con git ${op.kind} --abort.`);
    return;
  }
  if (!a.positional.length) {
    out.error(`usage: git ${kind} [<options>] <commit-ish>...`);
    return;
  }
  const head = headSha(repo);
  if (!head) {
    out.error(`fatal: your current branch '${currentBranch(repo)}' does not have any commits yet`);
    return;
  }
  const st = computeStatus(world, repo);
  if (!isClean(st)) {
    out.error(`error: your local changes would be overwritten by ${kind}.\nhint: commit your changes or stash them to proceed.\nfatal: ${kind} failed`);
    return;
  }
  const who = identity(world, repo);
  if (!who) {
    out.error('fatal: unable to auto-detect email address');
    return;
  }
  for (const rev of a.positional) {
    // Rango A..B
    let shas: string[];
    const range = /^(.+)\.\.(.+)$/.exec(rev);
    if (range) {
      const from = resolveRev(repo, range[1]);
      const to = resolveRev(repo, range[2]);
      if (!from || !to) {
        out.error(`fatal: bad revision '${rev}'`);
        return;
      }
      shas = logOrder(repo.objects, [to], [from]).reverse().map((c) => c.sha);
    } else {
      const s = resolveRev(repo, rev);
      if (!s) {
        out.error(`fatal: bad revision '${rev}'`);
        return;
      }
      shas = [s];
    }
    for (const sha of shas) {
      const c = getCommit(repo, sha);
      if (c.parents.length > 1 && !a.flags['mainline']) {
        out.error(`error: commit ${sha} is a merge but no -m option was given.\nfatal: ${kind} failed`);
        out.hint('Para revertir un commit de merge debes indicar qué padre conservar: git revert -m 1 <sha>');
        return;
      }
      const message = kind === 'revert' ? `Revert "${firstLine(c.message)}"\n\nThis reverts commit ${c.sha}.` : c.message;
      let res;
      if (c.parents.length > 1) {
        // revert -m N: usa el padre N como base
        const mainline = parseInt(a.flags['mainline'] as string, 10);
        const parent = c.parents[mainline - 1];
        if (!parent) {
          out.error(`error: commit ${sha} does not have parent ${mainline}`);
          return;
        }
        const r = applyThreeWay(ctx, repo, kind === 'revert' ? c.tree : getCommit(repo, parent).tree, headTree(repo), kind === 'revert' ? getCommit(repo, parent).tree : c.tree, 'HEAD', short(sha));
        res = 'error' in r ? { ok: false as const, error: r.error } : r.conflicts.length ? { ok: false as const, conflicts: r.conflicts } : { ok: true as const, tree: r.tree };
      } else res = replayCommit(ctx, repo, sha, kind);
      if (!res.ok) {
        if ('error' in res) {
          out.error(res.error);
          return;
        }
        repo.operation = { kind, theirs: sha, theirsLabel: short(sha), origHead: headSha(repo), origBranch: currentBranch(repo), message, conflicts: res.conflicts };
        out.error(
          `error: could not ${kind === 'revert' ? 'revert' : 'apply'} ${short(sha)}... ${firstLine(c.message)}\nhint: After resolving the conflicts, mark them with\nhint: "git add/rm <pathspec>", then run\nhint: "git ${kind} --continue".\nhint: You can instead skip this commit with "git ${kind} --skip".\nhint: To abort and get back to the state before "git ${kind}",\nhint: run "git ${kind} --abort".`,
        );
        return;
      }
      if (treesEqual(res.tree, headTree(repo))) {
        out.error(`The previous ${kind} is now empty, possibly due to conflict resolution.`);
        out.hint('Los cambios de ese commit ya están presentes en tu rama: no hay nada que aplicar.');
        continue;
      }
      if (a.flags['no-commit']) {
        out.hint('Cambios aplicados al staging area sin crear commit (--no-commit).');
        continue;
      }
      const parentTree = headTree(repo);
      const commit = createCommit(world, repo.objects, {
        tree: res.tree,
        parents: [headSha(repo)!],
        message,
        author: kind === 'cherry-pick' ? c.author : who,
        committer: who,
      });
      updateHead(world, repo, commit.sha, `${kind}: ${firstLine(message)}`);
      out.line(`[${currentBranch(repo) ?? 'detached HEAD'} ${short(commit.sha)}] ${firstLine(message)}`);
      if (kind === 'cherry-pick') out.line(` Date: ${formatDate(c.timestamp)}`);
      out.line(commitSummary(repo.objects, parentTree, res.tree).line);
    }
  }
  if (kind === 'revert') out.hint('git revert NO borra historia: crea un commit nuevo que deshace los cambios. Es seguro en ramas compartidas.');
  else out.hint('cherry-pick copia el cambio de un commit como commit nuevo (con otro SHA) en la rama actual.');
}

export function gitRebase(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['abort', 'continue', 'skip', 'i', 'interactive', 'quit'], value: ['onto'], alias: { i: 'interactive' } });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out, world } = ctx;
  const op = repo.operation;
  if (a.flags['interactive']) {
    out.error('error: el rebase interactivo (-i) no está disponible en el simulador.');
    out.hint('git rebase -i permite reordenar, unir (squash) o editar commits en un editor. Aquí puedes practicar el rebase normal.');
    return;
  }
  if (a.flags['abort'] || a.flags['quit']) {
    if (!op || op.kind !== 'rebase' || !op.rebase) {
      out.error('fatal: No rebase in progress?');
      return;
    }
    if (a.flags['abort']) {
      const orig = op.origHead!;
      hardResetTree(ctx, repo, getCommit(repo, orig).tree);
      if (op.rebase.branch) {
        repo.heads[op.rebase.branch] = orig;
        repo.head = { kind: 'branch', name: op.rebase.branch };
      } else repo.head = { kind: 'detached', sha: orig };
      recordReflog(world, repo, orig, null, `rebase (abort): returning to ${op.rebase.branch ? 'refs/heads/' + op.rebase.branch : orig}`);
    }
    repo.operation = null;
    return;
  }
  if (a.flags['continue'] || a.flags['skip']) {
    if (!op || op.kind !== 'rebase' || !op.rebase) {
      out.error('fatal: No rebase in progress?');
      return;
    }
    if (a.flags['skip']) {
      hardResetTree(ctx, repo, headTree(repo));
      op.conflicts = [];
    } else {
      if (op.conflicts.length) {
        out.error(`${op.conflicts.map((c) => `${c}: needs merge`).join('\n')}\nYou must edit all merge conflicts and then\nmark them as resolved using git add`);
        return;
      }
      const st = computeStatus(world, repo);
      if (st.unstaged.length) {
        out.error('error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.');
        return;
      }
      if (!treesEqual(repo.index, headTree(repo))) {
        const c = getCommit(repo, op.rebase.current);
        const commit = createCommit(world, repo.objects, { tree: { ...repo.index }, parents: [headSha(repo)!], message: c.message, author: c.author, committer: identity(world, repo) ?? c.author });
        updateHead(world, repo, commit.sha, `rebase (continue): ${firstLine(c.message)}`);
      }
    }
    runRebase(ctx, repo, op.rebase.remaining, op.rebase.onto, op.rebase.branch, op.origHead!, op.rebase.upstreamLabel);
    return;
  }
  if (op) {
    out.error(`fatal: It seems that there is already a ${op.kind} in progress.`);
    return;
  }
  const upstreamName = a.positional[0] ?? (() => {
    const cur = currentBranch(repo);
    const up = cur ? repo.upstream[cur] : undefined;
    return up ? `${up.remote}/${up.branch}` : undefined;
  })();
  if (!upstreamName) {
    out.error('There is no tracking information for the current branch.\nPlease specify which branch you want to rebase against.');
    return;
  }
  const upstream = resolveRev(repo, upstreamName);
  if (!upstream) {
    out.error(`fatal: invalid upstream '${upstreamName}'`);
    return;
  }
  const onto = a.flags['onto'] ? resolveRev(repo, a.flags['onto'] as string) : upstream;
  if (!onto) {
    out.error(`fatal: Does not point to a valid commit '${a.flags['onto']}'`);
    return;
  }
  const head = headSha(repo);
  if (!head) {
    out.error('fatal: no hay commits que rebasar');
    return;
  }
  const st = computeStatus(world, repo);
  if (!isClean(st)) {
    out.error('error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.');
    out.hint('El rebase reescribe tus commits uno a uno, así que necesita un working directory limpio. Usa git stash o confirma tus cambios.');
    return;
  }
  const branch = currentBranch(repo);
  if (isAncestor(repo.objects, onto, head) && onto === upstream) {
    out.line(`Current branch ${branch ?? 'HEAD'} is up to date.`);
    return;
  }
  const toReplay = logOrder(repo.objects, [head], [upstream])
    .filter((c) => c.parents.length < 2)
    .reverse()
    .map((c) => c.sha);
  // Desacopla HEAD en el commit destino.
  const from = headTree(repo);
  applyTreeSwitch(world, repo, from, getCommit(repo, onto).tree);
  repo.head = { kind: 'detached', sha: onto };
  recordReflog(world, repo, onto, head, `rebase (start): checkout ${upstreamName}`);
  runRebase(ctx, repo, toReplay, onto, branch, head, upstreamName);
}

function runRebase(ctx: GitCtx, repo: Repository, queue: string[], onto: string, branch: string | null, origHead: string, upstreamLabel: string): void {
  const { out, world } = ctx;
  const remaining = [...queue];
  while (remaining.length) {
    const sha = remaining.shift()!;
    const c = getCommit(repo, sha);
    const res = replayCommit(ctx, repo, sha, 'rebase');
    if (!res.ok) {
      if ('error' in res) {
        out.error(res.error);
        return;
      }
      repo.operation = {
        kind: 'rebase',
        theirs: sha,
        theirsLabel: short(sha),
        origHead,
        origBranch: branch,
        message: c.message,
        conflicts: res.conflicts,
        rebase: { onto, upstreamLabel, remaining, current: sha, branch },
      };
      out.error(
        `error: could not apply ${short(sha)}... ${firstLine(c.message)}\nhint: Resolve all conflicts manually, mark them as resolved with\nhint: "git add/rm <conflicted_files>", then run "git rebase --continue".\nhint: You can instead skip this commit: run "git rebase --skip".\nhint: To abort and get back to the state before "git rebase", run "git rebase --abort".\nCould not apply ${short(sha)}... ${firstLine(c.message)}`,
      );
      return;
    }
    if (treesEqual(res.tree, headTree(repo))) continue; // ya aplicado
    const commit = createCommit(world, repo.objects, { tree: res.tree, parents: [headSha(repo)!], message: c.message, author: c.author, committer: identity(world, repo) ?? c.author });
    updateHead(world, repo, commit.sha, `rebase (pick): ${firstLine(c.message)}`);
  }
  const final = headSha(repo)!;
  if (branch) {
    repo.heads[branch] = final;
    repo.head = { kind: 'branch', name: branch };
  }
  repo.operation = null;
  repo.config['__ORIG_HEAD'] = origHead;
  recordReflog(world, repo, final, origHead, `rebase (finish): returning to refs/heads/${branch ?? 'HEAD'}`);
  out.line(`Successfully rebased and updated refs/heads/${branch ?? 'HEAD'}.`);
  out.hint(`Tus commits se reaplicaron encima de ${upstreamLabel} con SHA nuevos. Si la rama ya estaba publicada, necesitarás git push --force-with-lease.`);
}
