/**
 * Comandos básicos: init, config, status, add, commit, rm, mv, log, show,
 * diff, ls-files, rev-parse, cat-file, hash-object.
 */
import { parseArgs } from '../args';
import { Out } from '../output';
import { hasConflictMarkers } from '../merge';
import { hashBlob } from '../sha1';
import {
  collapseUntracked,
  computeStatus,
  createCommit,
  createRepository,
  currentBranch,
  decorations,
  findRepo,
  firstLine,
  formatDate,
  getCommit,
  headSha,
  headTree,
  identity,
  logOrder,
  mergeBase,
  readBlob,
  resolveRev,
  short,
  storeBlob,
  treesEqual,
  updateHead,
  worktree,
  aheadBehind,
  ignoreRules,
  deleteWork,
  writeWork,
} from '../repo';
import { isIgnored } from '../ignore';
import type { Commit, Repository, Tree } from '../types';
import { exists, isDir, join, mkdirp, resolvePath, move } from '../vfs';
import { allPaths, displayPath, type GitCtx, matchPathspecs, requireRepo, toRepoPath } from './context';
import { commitSummary, decoSegs, renderCommitHeader, renderStat, renderUnifiedDiff, treeDeltas, type FileDelta } from './render';

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

export function gitInit(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['q', 'quiet', 'bare'], value: ['b', 'initial-branch'], alias: { b: 'initial-branch', q: 'quiet' } });
  const { world, out } = ctx;
  const target = a.positional[0] ? resolvePath(world.cwd, a.positional[0], world.home) : world.cwd;
  if (a.flags['bare']) {
    out.error('fatal: --bare no está disponible en el simulador.');
    out.hint('Los repositorios "bare" (sin working directory) se usan en servidores. Aquí el servidor remoto lo simula GitHub.');
    return;
  }
  mkdirp(world.fs, target);
  const existing = world.repos[target];
  if (existing) {
    out.line(`Reinitialized existing Git repository in ${target}/.git/`);
    out.hint('El repositorio ya existía: git init no borra el historial, solo lo "reinicializa".');
    return;
  }
  const parent = findRepo(world, target);
  const branch = (a.flags['initial-branch'] as string) || world.globalConfig['init.defaultBranch'] || 'main';
  world.repos[target] = createRepository(target, branch);
  if (!a.flags['quiet']) out.line(`Initialized empty Git repository in ${target}/.git/`);
  if (parent) {
    out.hint(
      `Ojo: has creado un repositorio dentro de otro (${parent.root}). Los repositorios anidados\n` +
        'suelen ser un error; para incluir otro proyecto se usan submódulos (.gitmodules).',
    );
  }
}

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

const KNOWN_CONFIG = new Set([
  'user.name',
  'user.email',
  'init.defaultBranch',
  'core.editor',
  'color.ui',
  'pull.rebase',
  'push.default',
  'core.autocrlf',
  'alias.st',
  'alias.co',
  'alias.br',
  'alias.lg',
  'merge.tool',
]);

export function gitConfig(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['global', 'local', 'list', 'l', 'unset', 'get', 'system'], alias: { l: 'list' } });
  const { world, out } = ctx;
  const repo = findRepo(world);
  if (a.flags['system']) {
    out.error('error: el simulador no tiene configuración de sistema; usa --global o --local.');
    return;
  }
  const useGlobal = !!a.flags['global'];
  if (!useGlobal && (a.flags['local'] || a.positional.length > 1) && !repo) {
    out.error('fatal: --local can only be used inside a git repository');
    out.hint('Para la configuración de usuario fuera de un repositorio usa: git config --global user.name "Tu Nombre"');
    return;
  }
  if (a.flags['list']) {
    const entries: [string, string][] = [];
    if (!a.flags['local']) for (const [k, v] of Object.entries(world.globalConfig)) entries.push([k, v]);
    if (!useGlobal && repo) {
      entries.push(['core.repositoryformatversion', '0'], ['core.bare', 'false']);
      for (const [k, v] of Object.entries(repo.config)) if (!k.startsWith('__')) entries.push([k, v]);
      for (const [name, url] of Object.entries(repo.remotes)) {
        entries.push([`remote.${name}.url`, url], [`remote.${name}.fetch`, `+refs/heads/*:refs/remotes/${name}/*`]);
      }
      for (const [b, up] of Object.entries(repo.upstream)) {
        entries.push([`branch.${b}.remote`, up.remote], [`branch.${b}.merge`, `refs/heads/${up.branch}`]);
      }
    }
    for (const [k, v] of entries) out.line(`${k}=${v}`);
    return;
  }
  const [key, ...rest] = a.positional;
  if (!key) {
    out.error('usage: git config [<options>]\n\n    --global              use global config file\n    --local               use repository config file\n    -l, --list            list all\n    --unset               remove a variable');
    return;
  }
  if (!/^[a-zA-Z][\w-]*\.[\w.-]+$/.test(key)) {
    out.error(`error: key does not contain a section: ${key}`);
    out.hint('Las claves de configuración tienen la forma seccion.clave, por ejemplo user.name o user.email.');
    return;
  }
  const store = useGlobal || !repo ? world.globalConfig : repo.config;
  if (a.flags['unset']) {
    if (!(key in store)) {
      out.ok = false;
      return;
    }
    delete store[key];
    return;
  }
  if (rest.length === 0 || a.flags['get']) {
    const v = (repo && !useGlobal ? repo.config[key] : undefined) ?? world.globalConfig[key];
    if (v === undefined) {
      out.ok = false;
      return;
    }
    out.line(v);
    return;
  }
  store[key] = rest.join(' ');
  if (!KNOWN_CONFIG.has(key) && !key.startsWith('alias.')) {
    out.hint(`Guardado "${key}". Esa clave no tiene efecto en el simulador, pero Git real la almacenaría igual.`);
  }
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<string, string> = {
  added: 'new file:   ',
  modified: 'modified:   ',
  deleted: 'deleted:    ',
  renamed: 'renamed:    ',
};

export function trackingInfo(repo: Repository): string[] {
  const branch = currentBranch(repo);
  if (!branch) return [];
  const up = repo.upstream[branch];
  if (!up) return [];
  const refName = `${up.remote}/${up.branch}`;
  const remoteSha = repo.remoteRefs[refName];
  const local = repo.heads[branch];
  if (!remoteSha) {
    return [`Your branch is based on '${refName}', but the upstream is gone.`, '  (use "git branch --unset-upstream" to fixup)'];
  }
  if (!local) return [];
  const { ahead, behind } = aheadBehind(repo.objects, local, remoteSha);
  if (!ahead && !behind) return [`Your branch is up to date with '${refName}'.`];
  if (ahead && !behind) {
    return [
      `Your branch is ahead of '${refName}' by ${ahead} commit${ahead > 1 ? 's' : ''}.`,
      '  (use "git push" to publish your local commits)',
    ];
  }
  if (behind && !ahead) {
    return [
      `Your branch is behind '${refName}' by ${behind} commit${behind > 1 ? 's' : ''}, and can be fast-forwarded.`,
      '  (use "git pull" to update your local branch)',
    ];
  }
  return [
    `Your branch and '${refName}' have diverged,`,
    `and have ${ahead} and ${behind} different commits each, respectively.`,
    '  (use "git pull" if you want to integrate the remote branch with yours)',
  ];
}

export function gitStatus(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['s', 'short', 'b', 'branch', 'ignored', 'porcelain'], alias: { s: 'short', b: 'branch' } });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out } = ctx;
  const st = computeStatus(ctx.world, repo);
  const dp = (p: string) => displayPath(ctx, repo, p);
  const branch = currentBranch(repo);

  if (a.flags['short'] || a.flags['porcelain']) {
    if (a.flags['branch']) out.line(['## ', undefined], [branch ?? 'HEAD (no branch)', 'green']);
    const rows = new Map<string, [string, string]>();
    for (const c of st.staged) rows.set(c.path, [c.kind === 'added' ? 'A' : c.kind === 'deleted' ? 'D' : c.kind === 'renamed' ? 'R' : 'M', ' ']);
    for (const c of st.unstaged) {
      const r = rows.get(c.path) ?? [' ', ' '];
      r[1] = c.kind === 'deleted' ? 'D' : 'M';
      rows.set(c.path, r);
    }
    for (const p of st.unmerged) out.line(['UU', 'red'], ' ' + dp(p));
    for (const [p, [x, y]] of [...rows.entries()].sort()) out.line([x, 'green'], [y, 'red'], ' ' + dp(p));
    for (const p of collapseUntracked(st.untracked, repo.index)) out.line(['??', 'red'], ' ' + dp(p));
    if (a.flags['ignored']) for (const p of st.ignored) out.line(['!!', 'dim'], ' ' + dp(p));
    return;
  }

  if (branch) out.line('On branch ', [branch, 'bold']);
  else out.line(['HEAD detached at ' + short(headSha(repo)!), 'red']);

  const op = repo.operation;
  if (op?.kind === 'rebase' && op.rebase) {
    out.line(`interactive rebase in progress; onto ${short(op.rebase.onto)}`);
    out.line(`You are currently rebasing branch '${op.rebase.branch ?? 'HEAD'}' on '${short(op.rebase.onto)}'.`);
    out.line(op.conflicts.length ? '  (fix conflicts and then run "git rebase --continue")' : '  (all conflicts fixed: run "git rebase --continue")');
    out.line('  (use "git rebase --abort" to check out the original branch)');
    out.blank();
  }
  for (const l of trackingInfo(repo)) out.line(l);
  if (!headSha(repo)) {
    out.blank();
    out.line('No commits yet');
  }
  if (op && op.kind !== 'rebase') {
    out.blank();
    if (op.conflicts.length) {
      out.line('You have unmerged paths.');
      out.line(`  (fix conflicts and run "git ${op.kind === 'merge' ? 'commit' : op.kind + ' --continue'}")`);
      out.line(`  (use "git ${op.kind} --abort" to abort the ${op.kind})`);
    } else if (op.kind === 'merge') {
      out.line('All conflicts fixed but you are still merging.');
      out.line('  (use "git commit" to conclude merge)');
    } else {
      out.line(`You are currently ${op.kind === 'revert' ? 'reverting' : 'cherry-picking'} commit ${short(op.theirs)}.`);
      out.line(`  (all conflicts fixed: run "git ${op.kind} --continue")`);
    }
  }

  if (st.staged.length) {
    out.blank();
    out.line('Changes to be committed:');
    out.line(headSha(repo) ? '  (use "git restore --staged <file>..." to unstage)' : '  (use "git rm --cached <file>..." to unstage)');
    for (const c of st.staged) {
      out.line(['\t' + KIND_LABEL[c.kind] + (c.kind === 'renamed' ? `${dp(c.from!)} -> ${dp(c.path)}` : dp(c.path)), 'green']);
    }
  }
  if (st.unmerged.length) {
    out.blank();
    out.line('Unmerged paths:');
    out.line('  (use "git add <file>..." to mark resolution)');
    for (const p of st.unmerged) {
      const inWork = p in worktree(ctx.world, repo);
      out.line(['\t' + (inWork ? 'both modified:   ' : 'deleted by us:   ') + dp(p), 'red']);
    }
  }
  if (st.unstaged.length) {
    out.blank();
    out.line('Changes not staged for commit:');
    out.line(`  (use "git add${st.unstaged.some((c) => c.kind === 'deleted') ? '/rm' : ''} <file>..." to update what will be committed)`);
    out.line('  (use "git restore <file>..." to discard changes in working directory)');
    for (const c of st.unstaged) out.line(['\t' + KIND_LABEL[c.kind] + dp(c.path), 'red']);
  }
  if (st.untracked.length) {
    out.blank();
    out.line('Untracked files:');
    out.line('  (use "git add <file>..." to include in what will be committed)');
    for (const p of collapseUntracked(st.untracked, repo.index)) out.line(['\t' + dp(p), 'red']);
  }
  if (a.flags['ignored'] && st.ignored.length) {
    out.blank();
    out.line('Ignored files:');
    out.line('  (use "git add -f <file>..." to include in what will be committed)');
    for (const p of st.ignored) out.line(['\t' + dp(p), 'dim']);
  }
  out.blank();
  if (st.staged.length || st.unmerged.length) return;
  if (st.unstaged.length) out.line('no changes added to commit (use "git add" and/or "git commit -a")');
  else if (st.untracked.length) out.line('nothing added to commit but untracked files present (use "git add" to track)');
  else if (!headSha(repo) && !Object.keys(repo.index).length) out.line('nothing to commit (create/copy files and use "git add" to track)');
  else out.line('nothing to commit, working tree clean');
}

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------

export function gitAdd(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, {
    bool: ['A', 'all', 'u', 'update', 'f', 'force', 'n', 'dry-run', 'v', 'verbose', 'p', 'patch', 'i', 'interactive'],
    alias: { A: 'all', u: 'update', f: 'force', n: 'dry-run', v: 'verbose', p: 'patch', i: 'interactive' },
  });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out, world } = ctx;
  if (a.flags['patch'] || a.flags['interactive']) {
    out.error('error: el modo interactivo (-p / -i) no está disponible en el simulador.');
    out.hint('git add -p permite elegir fragmentos (hunks) de un archivo. Aquí puedes añadir archivos completos.');
    return;
  }
  let specs = [...a.positional, ...a.paths];
  if (!specs.length) {
    if (a.flags['all'] || a.flags['update']) specs = [repo.root];
    else {
      out.line('Nothing specified, nothing added.');
      out.line(["hint: Maybe you wanted to say 'git add .'?", 'yellow']);
      out.line(['hint: Disable this message with "git config advice.addEmptyPathspec false"', 'yellow']);
      out.ok = false;
      return;
    }
  }
  const work = worktree(world, repo);
  const conflicts = repo.operation?.conflicts ?? [];
  const candidates = allPaths(ctx, repo, conflicts);
  const { matched, unmatched, outside } = matchPathspecs(ctx, repo, specs, candidates);
  if (outside.length) {
    out.error(`fatal: ${outside[0]}: '${outside[0]}' is outside repository at '${repo.root}'`);
    return;
  }
  if (unmatched.length) {
    out.error(`fatal: pathspec '${unmatched[0]}' did not match any files`);
    out.hint('Comprueba el nombre con "ls" o "git status". Recuerda que Git distingue mayúsculas y minúsculas.');
    return;
  }
  const rules = ignoreRules(world, repo);
  const ignoredExplicit: string[] = [];
  const changed: string[] = [];
  for (const p of matched) {
    const tracked = p in repo.index || conflicts.includes(p);
    if (!tracked && isIgnored(rules, p) && !a.flags['force']) {
      // Solo se avisa si el usuario nombró el archivo directamente.
      if (specs.some((s) => toRepoPath(ctx, repo, s) === p)) ignoredExplicit.push(p);
      continue;
    }
    if (a.flags['update'] && !tracked) continue;
    if (p in work) {
      const sha = hashBlob(work[p]);
      if (repo.index[p] !== sha || conflicts.includes(p)) {
        changed.push(`add '${displayPath(ctx, repo, p)}'`);
        if (!a.flags['dry-run']) {
          repo.index[p] = storeBlob(repo.objects, work[p]);
          if (conflicts.includes(p) && hasConflictMarkers(work[p])) {
            out.hint(`${p} todavía contiene marcadores de conflicto (<<<<<<<, =======, >>>>>>>). Git lo acepta, pero el código quedará roto.`);
          }
        }
      }
    } else if (tracked) {
      changed.push(`remove '${displayPath(ctx, repo, p)}'`);
      if (!a.flags['dry-run']) delete repo.index[p];
    }
    if (!a.flags['dry-run'] && repo.operation) repo.operation.conflicts = repo.operation.conflicts.filter((c) => c !== p);
  }
  if (a.flags['dry-run'] || a.flags['verbose']) for (const c of changed) out.line(c);
  if (ignoredExplicit.length) {
    out.error('The following paths are ignored by one of your .gitignore files:\n' + ignoredExplicit.join('\n'));
    out.line(['hint: Use -f if you really want to add them.', 'yellow']);
  }
}

// ---------------------------------------------------------------------------
// commit
// ---------------------------------------------------------------------------

export function gitCommit(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, {
    bool: ['a', 'all', 'amend', 'allow-empty', 'no-edit', 'q', 'quiet', 'v', 'verbose', 'allow-empty-message'],
    value: ['m', 'message', 'author', 'F', 'file'],
    alias: { a: 'all', m: 'message', q: 'quiet', F: 'file' },
  });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out, world } = ctx;
  if (a.positional.length || a.paths.length) {
    out.error(`error: pathspec '${[...a.positional, ...a.paths][0]}' did not match any file(s) known to git`);
    out.hint('Si querías escribir un mensaje usa comillas: git commit -m "mensaje con espacios"');
    return;
  }
  const who = identity(world, repo);
  if (!who) {
    out.error(
      'Author identity unknown\n\n*** Please tell me who you are.\n\nRun\n\n  git config --global user.email "you@example.com"\n  git config --global user.name "Your Name"\n\nto set your account\'s default identity.\nOmit --global to set the identity only in this repository.\n\nfatal: unable to auto-detect email address',
    );
    out.hint('Git guarda en cada commit quién lo hizo. Configura tu nombre y correo una sola vez con git config --global.');
    return;
  }
  const op = repo.operation;
  if (op && op.conflicts.length) {
    out.error(
      'error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use \'git add/rm <file>\'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.',
    );
    out.hint('Abre los archivos en conflicto, decide qué contenido conservar, elimina los marcadores y ejecuta git add <archivo>.');
    return;
  }
  if (a.flags['file']) {
    const abs = resolvePath(world.cwd, a.flags['file'] as string, world.home);
    const content = world.fs.files[abs];
    if (content === undefined) {
      out.error(`fatal: could not read log file '${a.flags['file']}': No such file or directory`);
      return;
    }
    a.multi['message'] = [content.trim()];
  }
  if (a.flags['all']) {
    const work = worktree(world, repo);
    for (const p of Object.keys(repo.index)) {
      if (!(p in work)) delete repo.index[p];
      else repo.index[p] = storeBlob(repo.objects, work[p]);
    }
  }
  const parentSha = headSha(repo);
  const amend = !!a.flags['amend'];
  if (amend && !parentSha) {
    out.error('fatal: You have nothing to amend.');
    return;
  }
  const amended = amend ? getCommit(repo, parentSha!) : null;
  let message = (a.multi['message'] ?? []).join('\n\n').trim();
  if (!message && amended && (a.flags['no-edit'] || !a.multi['message'])) message = amended.message;
  if (!message && op) message = op.message;
  if (!message) {
    if (a.multi['message']) {
      out.error('Aborting commit due to empty commit message.');
      return;
    }
    out.error('error: no se puede abrir un editor en el simulador.\nAborting commit due to empty commit message.');
    out.hint(
      'Git real abriría tu editor (core.editor) para escribir el mensaje.\nAquí usa la opción -m:  git commit -m "feat: describe el cambio"',
    );
    return;
  }

  const parentTree = amended ? (amended.parents[0] ? getCommit(repo, amended.parents[0]).tree : {}) : headTree(repo);
  const tree: Tree = { ...repo.index };
  if (!amend && !op && treesEqual(tree, headTree(repo)) && !a.flags['allow-empty']) {
    const st = computeStatus(world, repo);
    const branch = currentBranch(repo);
    out.ok = false;
    out.line(branch ? `On branch ${branch}` : `HEAD detached at ${short(parentSha ?? '')}`);
    for (const l of trackingInfo(repo)) out.line(l);
    if (st.unstaged.length) {
      out.line('Changes not staged for commit:');
      for (const c of st.unstaged) out.line(['\t' + KIND_LABEL[c.kind] + displayPath(ctx, repo, c.path), 'red']);
      out.blank();
      out.line('no changes added to commit (use "git add" and/or "git commit -a")');
    } else if (st.untracked.length) {
      out.line('Untracked files:');
      for (const p of collapseUntracked(st.untracked, repo.index)) out.line(['\t' + displayPath(ctx, repo, p), 'red']);
      out.blank();
      out.line('nothing added to commit but untracked files present (use "git add" to track)');
    } else out.line('nothing to commit, working tree clean');
    out.hint('Un commit guarda lo que hay en el staging area. Primero prepara los cambios con git add <archivo>.');
    return;
  }

  let author = who;
  if (a.flags['author']) {
    const m = /^(.*?)\s*<(.+)>$/.exec(a.flags['author'] as string);
    if (!m) {
      out.error(`fatal: --author '${a.flags['author']}' is not 'Name <email>' and matches no existing author`);
      return;
    }
    author = { name: m[1], email: m[2] };
  } else if (amended) author = amended.author;
  else if (op && (op.kind === 'cherry-pick' || op.kind === 'rebase')) author = getCommit(repo, op.theirs).author;

  let parents: string[];
  if (amended) parents = amended.parents;
  else if (op?.kind === 'merge') parents = [parentSha!, op.theirs];
  else parents = parentSha ? [parentSha] : [];

  const commit = createCommit(world, repo.objects, { tree, parents, message, author, committer: who });
  const kindLabel = amend ? 'commit (amend)' : op?.kind === 'merge' ? 'commit (merge)' : !parentSha ? 'commit (initial)' : op?.kind === 'cherry-pick' ? 'cherry-pick' : op?.kind === 'revert' ? 'revert' : 'commit';
  updateHead(world, repo, commit.sha, `${kindLabel}: ${firstLine(message)}`);
  if (op && op.kind !== 'rebase') repo.operation = null;

  if (a.flags['quiet']) return;
  const branch = currentBranch(repo);
  const where = branch ?? `detached HEAD`;
  const root = parents.length === 0 ? ' (root-commit)' : '';
  out.line(`[${where}${root} ${short(commit.sha)}] ${firstLine(message)}`);
  if (amend) out.line(` Date: ${formatDate(amended!.timestamp)}`);
  const summary = commitSummary(repo.objects, parentTree, tree);
  out.line(summary.line);
  for (const m of summary.modes) out.line(m);
  if (amend) out.hint('--amend reemplaza el último commit por uno nuevo (con otro SHA). Evítalo si ya lo subiste al remoto.');
  if (message.split('\n')[0].length > 72) out.hint('Consejo: la primera línea del mensaje debería tener 50-72 caracteres como máximo.');
}

// ---------------------------------------------------------------------------
// rm / mv
// ---------------------------------------------------------------------------

export function gitRm(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['cached', 'r', 'f', 'force', 'n', 'dry-run', 'q', 'quiet'], alias: { f: 'force', n: 'dry-run', q: 'quiet' } });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out, world } = ctx;
  const specs = [...a.positional, ...a.paths];
  if (!specs.length) {
    out.error('usage: git rm [-f | --force] [-n] [-r] [--cached] [--] <pathspec>...');
    return;
  }
  const tracked = Object.keys(repo.index);
  const work = worktree(world, repo);
  const head = headTree(repo);
  const toRemove: string[] = [];
  for (const spec of specs) {
    const rel = toRepoPath(ctx, repo, spec);
    const { matched } = matchPathspecs(ctx, repo, [spec], tracked);
    if (!matched.length) {
      out.error(`fatal: pathspec '${spec}' did not match any files`);
      if (rel !== null && rel in work) out.hint(`'${spec}' existe pero no está rastreado. Para borrarlo del disco usa "rm ${spec}".`);
      return;
    }
    const isDirSpec = rel !== null && !matched.includes(rel);
    if (isDirSpec && !a.flags['r']) {
      out.error(`fatal: not removing '${spec}' recursively without -r`);
      return;
    }
    toRemove.push(...matched);
  }
  if (!a.flags['force']) {
    const staged = toRemove.filter((p) => repo.index[p] !== head[p] && p in work && hashBlob(work[p]) !== repo.index[p]);
    const localMods = toRemove.filter((p) => p in work && hashBlob(work[p]) !== repo.index[p]);
    const stagedOnly = toRemove.filter((p) => repo.index[p] !== head[p] && p in head);
    if (staged.length) {
      out.error(`error: the following file has staged content different from both the\nfile and the HEAD:\n${staged.map((p) => '    ' + p).join('\n')}\n(use -f to force removal)`);
      return;
    }
    if (localMods.length && !a.flags['cached']) {
      out.error(`error: the following file has local modifications:\n${localMods.map((p) => '    ' + p).join('\n')}\n(use --cached to keep the file, or -f to force removal)`);
      out.hint('Git protege tus cambios sin confirmar. --cached deja de rastrear el archivo pero lo conserva en disco.');
      return;
    }
    if (stagedOnly.length && !a.flags['cached']) {
      out.error(`error: the following file has changes staged in the index:\n${stagedOnly.map((p) => '    ' + p).join('\n')}\n(use --cached to keep the file, or -f to force removal)`);
      return;
    }
  }
  for (const p of toRemove) {
    out.line(`rm '${p}'`);
    if (a.flags['dry-run']) continue;
    delete repo.index[p];
    if (!a.flags['cached']) deleteWork(world, repo, p);
  }
  if (a.flags['cached'] && !a.flags['dry-run']) {
    out.hint('El archivo sigue en tu disco pero ahora aparece como "untracked". Añádelo a .gitignore si no quieres versionarlo.');
  }
}

export function gitMv(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['f', 'force', 'n', 'dry-run', 'v'], alias: { f: 'force', n: 'dry-run' } });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out, world } = ctx;
  if (a.positional.length !== 2) {
    out.error('usage: git mv [<options>] <source>... <destination>');
    return;
  }
  const [src, dst] = a.positional;
  const srcRel = toRepoPath(ctx, repo, src);
  let dstRel = toRepoPath(ctx, repo, dst);
  if (srcRel === null || dstRel === null) {
    out.error(`fatal: '${srcRel === null ? src : dst}' is outside repository`);
    return;
  }
  const absDst = join(repo.root, dstRel);
  if (isDir(world.fs, absDst)) dstRel = dstRel ? `${dstRel}/${srcRel.split('/').pop()}` : srcRel.split('/').pop()!;
  const tracked = Object.keys(repo.index).filter((p) => p === srcRel || p.startsWith(srcRel + '/'));
  if (!exists(world.fs, join(repo.root, srcRel))) {
    out.error(`fatal: bad source, source=${src}, destination=${dst}`);
    return;
  }
  if (!tracked.length) {
    out.error(`fatal: not under version control, source=${src}, destination=${dst}`);
    out.hint(`El archivo no está rastreado: añádelo primero con git add o muévelo con "mv ${src} ${dst}".`);
    return;
  }
  if (exists(world.fs, join(repo.root, dstRel)) && !a.flags['force']) {
    out.error(`fatal: destination exists, source=${src}, destination=${dst}`);
    return;
  }
  if (a.flags['dry-run']) {
    out.line(`Checking rename of '${srcRel}' to '${dstRel}'`);
    return;
  }
  move(world.fs, join(repo.root, srcRel), join(repo.root, dstRel));
  for (const p of tracked) {
    const np = dstRel + p.slice(srcRel.length);
    repo.index[np] = repo.index[p];
    delete repo.index[p];
  }
}

// ---------------------------------------------------------------------------
// log
// ---------------------------------------------------------------------------

/** Dibuja el grafo ASCII de `git log --graph`. */
export function graphRows(commits: Commit[]): { prefix: string; sha: string | null }[] {
  const rows: { prefix: string; sha: string | null }[] = [];
  const cols: (string | null)[] = [];
  const draw = (marks: Record<number, string>, skip: number[] = []) => {
    const chars: string[] = Array(cols.length * 2).fill(' ');
    cols.forEach((s, k) => {
      if (s && !skip.includes(k)) chars[2 * k] = '|';
    });
    for (const [pos, ch] of Object.entries(marks)) chars[Number(pos)] = ch;
    return chars.join('').replace(/\s+$/, '');
  };
  for (const c of commits) {
    let idx = cols.indexOf(c.sha);
    if (idx === -1) {
      idx = cols.indexOf(null);
      if (idx === -1) {
        idx = cols.length;
        cols.push(c.sha);
      } else cols[idx] = c.sha;
    }
    const dupes = cols.map((s, k) => (s === c.sha && k !== idx ? k : -1)).filter((k) => k >= 0);
    if (dupes.length) {
      // Las ramas que convergen en este commit se unen a su columna.
      const marks: Record<number, string> = {};
      for (const d of dupes) marks[2 * d - 1] = '/';
      rows.push({ prefix: draw(marks, dupes), sha: null });
      for (const d of dupes) cols[d] = null;
    }
    rows.push({ prefix: draw({ [2 * idx]: '*' }), sha: c.sha });
    const [p0, ...rest] = c.parents;
    cols[idx] = p0 ?? null;
    for (const p of rest) {
      if (cols.includes(p)) continue;
      const free = cols.indexOf(null, idx + 1);
      const at = free === -1 ? cols.length : free;
      cols[at] = p;
      rows.push({ prefix: draw({ [2 * at - 1]: '\\' }, [at]), sha: null });
    }
    while (cols.length && cols[cols.length - 1] === null) cols.pop();
  }
  return rows;
}

export function gitLog(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, {
    bool: ['oneline', 'graph', 'all', 'decorate', 'stat', 'reverse', 'p', 'patch', 'first-parent', 'no-merges', 'merges', 'name-only'],
    value: ['n', 'max-count', 'author', 'pretty', 'format', 'grep', 'since', 'until'],
    alias: { 'max-count': 'n', p: 'patch' },
  });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out } = ctx;
  if (a.flags['pretty'] === 'oneline') a.flags['oneline'] = true;
  const tips: string[] = [];
  const exclude: string[] = [];
  for (const rev of a.positional) {
    const range = /^(.*?)\.\.(.*)$/.exec(rev);
    if (range && !rev.includes('...')) {
      const from = resolveRev(repo, range[1] || 'HEAD');
      const to = resolveRev(repo, range[2] || 'HEAD');
      if (!from || !to) {
        out.error(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.`);
        return;
      }
      exclude.push(from);
      tips.push(to);
      continue;
    }
    if (rev.startsWith('^')) {
      const s = resolveRev(repo, rev.slice(1));
      if (s) exclude.push(s);
      continue;
    }
    const sha = resolveRev(repo, rev);
    if (!sha) {
      out.error(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`);
      return;
    }
    tips.push(sha);
  }
  if (a.flags['all']) {
    tips.push(...Object.values(repo.heads), ...Object.values(repo.remoteRefs), ...Object.values(repo.tags).map((t) => t.target));
    const h = headSha(repo);
    if (h) tips.push(h);
  }
  if (!tips.length && !exclude.length) {
    const h = headSha(repo);
    if (!h) {
      out.error(`fatal: your current branch '${currentBranch(repo)}' does not have any commits yet`);
      out.hint('El historial está vacío: crea tu primer commit con git add + git commit -m "mensaje".');
      return;
    }
    tips.push(h);
  }
  let commits = logOrder(repo.objects, tips.length ? tips : [headSha(repo)!], exclude);
  if (a.flags['first-parent']) {
    const fp = new Set<string>();
    let cur: string | undefined = tips[0];
    while (cur) {
      fp.add(cur);
      cur = repo.objects.commits[cur]?.parents[0];
    }
    commits = commits.filter((c) => fp.has(c.sha));
  }
  if (a.flags['no-merges']) commits = commits.filter((c) => c.parents.length < 2);
  if (a.flags['merges']) commits = commits.filter((c) => c.parents.length > 1);
  if (a.flags['author']) {
    const q = (a.flags['author'] as string).toLowerCase();
    commits = commits.filter((c) => `${c.author.name} <${c.author.email}>`.toLowerCase().includes(q));
  }
  if (a.flags['grep']) {
    const q = (a.flags['grep'] as string).toLowerCase();
    commits = commits.filter((c) => c.message.toLowerCase().includes(q));
  }
  if (a.paths.length) {
    const rels = a.paths.map((p) => toRepoPath(ctx, repo, p) ?? p);
    commits = commits.filter((c) => {
      const parent = c.parents[0] ? repo.objects.commits[c.parents[0]].tree : {};
      return rels.some((r) => Object.keys({ ...parent, ...c.tree }).some((p) => (p === r || p.startsWith(r + '/')) && parent[p] !== c.tree[p]));
    });
  }
  if (a.flags['n'] !== undefined) {
    const n = parseInt(a.flags['n'] as string, 10);
    if (isNaN(n)) {
      out.error(`fatal: '${a.flags['n']}': not an integer`);
      return;
    }
    commits = commits.slice(0, n);
  }
  if (a.flags['reverse']) commits.reverse();
  const deco = decorations(repo);
  const format = a.flags['format'] as string | undefined;

  const prefixFor = new Map<string, string>();
  const extraRows: Map<string, string[]> = new Map();
  if (a.flags['graph']) {
    const rows = graphRows(commits);
    let last: string | null = null;
    for (const r of rows) {
      if (r.sha) {
        prefixFor.set(r.sha, r.prefix);
        last = r.sha;
      } else if (last) (extraRows.get(last) ?? extraRows.set(last, []).get(last)!).push(r.prefix);
    }
  }
  const continuation = (sha: string) => (prefixFor.get(sha) ?? '').replace('*', '|');

  for (const c of commits) {
    const gp = a.flags['graph'] ? (prefixFor.get(c.sha) ?? '*') + ' ' : '';
    if (format) {
      const line = format
        .replace(/%H/g, c.sha)
        .replace(/%h/g, short(c.sha))
        .replace(/%s/g, firstLine(c.message))
        .replace(/%an/g, c.author.name)
        .replace(/%ae/g, c.author.email)
        .replace(/%ad/g, formatDate(c.timestamp))
        .replace(/%ar/g, relativeTime(c.timestamp))
        .replace(/%d/g, deco[c.sha] ? ` (${deco[c.sha].join(', ')})` : '')
        .replace(/%n/g, '\n');
      out.line(gp + line);
    } else if (a.flags['oneline']) {
      out.line([gp, 'red'], [short(c.sha), 'yellow'], ...decoSegs(deco[c.sha]), ' ' + firstLine(c.message));
    } else {
      const sub = new Out();
      renderCommitHeader(sub, c, deco[c.sha]);
      if (a.flags['stat'] || a.flags['patch'] || a.flags['name-only']) {
        const parent = c.parents[0] ? repo.objects.commits[c.parents[0]].tree : {};
        const deltas = treeDeltas(repo.objects, parent, c.tree);
        sub.blank();
        if (a.flags['name-only']) for (const d of deltas) sub.line(d.path);
        else if (a.flags['stat']) renderStat(sub, deltas);
        else renderUnifiedDiff(sub, deltas, hashBlob);
      }
      sub.lines.forEach((l, i) => {
        const p = a.flags['graph'] ? (i === 0 ? gp : continuation(c.sha) + ' ') : '';
        out.push([[{ t: p, c: 'red' }, ...l]]);
      });
      out.line(a.flags['graph'] ? continuation(c.sha) : '');
    }
    for (const extra of extraRows.get(c.sha) ?? []) out.line([extra, 'red']);
  }
}

function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts) / 1000;
  if (diff < 60) return `${Math.floor(diff)} seconds ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

// ---------------------------------------------------------------------------
// show
// ---------------------------------------------------------------------------

export function gitShow(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['stat', 'name-only', 'oneline', 'name-status', 's', 'no-patch'], alias: { s: 'no-patch' } });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out } = ctx;
  const revs = a.positional.length ? a.positional : ['HEAD'];
  for (const rev of revs) {
    const colon = rev.indexOf(':');
    if (colon >= 0) {
      const r = rev.slice(0, colon) || 'HEAD';
      const path = rev.slice(colon + 1).replace(/^\.\//, '');
      const sha = resolveRev(repo, r);
      if (!sha) {
        out.error(`fatal: invalid object name '${r}'.`);
        return;
      }
      const tree = getCommit(repo, sha).tree;
      if (!(path in tree)) {
        out.error(`fatal: path '${path}' does not exist in '${r}'`);
        return;
      }
      out.text(readBlob(repo.objects, tree[path]).replace(/\n$/, ''));
      continue;
    }
    if (rev in repo.tags && repo.tags[rev].annotated) {
      const t = repo.tags[rev];
      out.line(['tag ' + t.name, 'yellow']);
      out.line(`Tagger: ${t.tagger?.name} <${t.tagger?.email}>`);
      out.line(`Date:   ${formatDate(t.timestamp ?? 0)}`);
      out.blank();
      out.text(t.message ?? '');
      out.blank();
    }
    const sha = resolveRev(repo, rev);
    if (!sha) {
      if (!headSha(repo) && rev === 'HEAD') {
        out.error("fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.");
        out.hint('Todavía no hay commits. HEAD apunta a una rama que aún no existe ("unborn branch").');
      } else out.error(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.`);
      return;
    }
    const c = getCommit(repo, sha);
    const deco = decorations(repo)[sha];
    if (a.flags['oneline']) out.line([short(c.sha), 'yellow'], ...decoSegs(deco), ' ' + firstLine(c.message));
    else renderCommitHeader(out, c, deco);
    if (a.flags['no-patch'] || c.parents.length > 1) continue;
    const parent = c.parents[0] ? getCommit(repo, c.parents[0]).tree : {};
    const deltas = treeDeltas(repo.objects, parent, c.tree);
    out.blank();
    if (a.flags['name-only']) for (const d of deltas) out.line(d.path);
    else if (a.flags['name-status']) for (const d of deltas) out.line(`${d.oldContent === null ? 'A' : d.newContent === null ? 'D' : 'M'}\t${d.path}`);
    else if (a.flags['stat']) renderStat(out, deltas);
    else renderUnifiedDiff(out, deltas, hashBlob);
  }
}

// ---------------------------------------------------------------------------
// diff
// ---------------------------------------------------------------------------

export function gitDiff(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, {
    bool: ['staged', 'cached', 'stat', 'name-only', 'name-status', 'quiet', 'exit-code', 'word-diff'],
  });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out, world } = ctx;
  const staged = !!(a.flags['staged'] || a.flags['cached']);
  const work = worktree(world, repo);
  const filterRels = a.paths.map((p) => toRepoPath(ctx, repo, p) ?? p);
  const revArgs: string[] = [];
  // Argumentos que no son revisiones se tratan como rutas (como hace Git cuando no hay ambigüedad).
  for (const p of a.positional) {
    const isRange = /\.\./.test(p);
    if (isRange || resolveRev(repo, p)) revArgs.push(p);
    else {
      const rel = toRepoPath(ctx, repo, p);
      if (rel !== null && (rel in work || rel in repo.index || Object.keys(repo.index).some((k) => k.startsWith(rel + '/')))) filterRels.push(rel);
      else {
        out.error(`fatal: ambiguous argument '${p}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`);
        return;
      }
    }
  }
  const filter = filterRels.length ? (p: string) => filterRels.some((r) => r === '' || p === r || p.startsWith(r + '/')) : undefined;
  let deltas: FileDelta[] = [];
  const conflicts = repo.operation?.conflicts ?? [];

  const resolveOrFail = (r: string): string | null => {
    const s = resolveRev(repo, r);
    if (!s) out.error(`fatal: ambiguous argument '${r}': unknown revision or path not in the working tree.`);
    return s;
  };

  if (revArgs.length === 1 && revArgs[0].includes('..')) {
    const three = revArgs[0].includes('...');
    const [l, r] = revArgs[0].split(three ? '...' : '..');
    const left = resolveOrFail(l || 'HEAD');
    const right = resolveOrFail(r || 'HEAD');
    if (!left || !right) return;
    const base = three ? mergeBase(repo.objects, left, right) ?? left : left;
    deltas = treeDeltas(repo.objects, getCommit(repo, base).tree, getCommit(repo, right).tree, true, filter);
  } else if (revArgs.length === 2) {
    const left = resolveOrFail(revArgs[0]);
    const right = resolveOrFail(revArgs[1]);
    if (!left || !right) return;
    deltas = treeDeltas(repo.objects, getCommit(repo, left).tree, getCommit(repo, right).tree, true, filter);
  } else if (revArgs.length === 1) {
    const sha = resolveOrFail(revArgs[0]);
    if (!sha) return;
    const tree = getCommit(repo, sha).tree;
    if (staged) deltas = treeDeltas(repo.objects, tree, repo.index, true, filter);
    else {
      const tracked: Record<string, string> = {};
      for (const p of new Set([...Object.keys(repo.index), ...Object.keys(tree)])) if (p in work) tracked[p] = work[p];
      deltas = treeDeltas(repo.objects, tree, tracked, false, filter);
    }
  } else if (staged) {
    deltas = treeDeltas(repo.objects, headTree(repo), repo.index, true, (p) => !conflicts.includes(p) && (!filter || filter(p)));
  } else {
    const tracked: Record<string, string> = {};
    for (const p of Object.keys(repo.index)) if (p in work) tracked[p] = work[p];
    const indexNoConf: Tree = { ...repo.index };
    deltas = treeDeltas(repo.objects, indexNoConf, tracked, false, (p) => !conflicts.includes(p) && (!filter || filter(p)));
    // Archivos en conflicto: se muestra la versión del working directory con marcadores.
    for (const p of conflicts) {
      if (filter && !filter(p)) continue;
      out.line([`diff --cc ${p}`, 'bold']);
      const ours = headTree(repo)[p];
      const sub = new Out();
      renderUnifiedDiff(sub, [{ path: p, oldContent: ours ? readBlob(repo.objects, ours) : '', newContent: work[p] ?? '' }], hashBlob);
      out.push(sub.lines.slice(5));
    }
  }
  if (a.flags['quiet']) {
    out.ok = deltas.length === 0;
    return;
  }
  if (a.flags['name-only']) for (const d of deltas) out.line(displayPath(ctx, repo, d.path));
  else if (a.flags['name-status']) for (const d of deltas) out.line(`${d.oldContent === null ? 'A' : d.newContent === null ? 'D' : 'M'}\t${displayPath(ctx, repo, d.path)}`);
  else if (a.flags['stat']) {
    if (deltas.length) renderStat(out, deltas);
  } else renderUnifiedDiff(out, deltas, hashBlob);

  if (!deltas.length && !conflicts.length && !revArgs.length) {
    const st = computeStatus(world, repo);
    if (!staged && st.staged.length) out.hint('No hay diferencias sin preparar. Tus cambios están en staging: usa git diff --staged para verlos.');
    else if (!staged && st.untracked.length && !st.unstaged.length) out.hint('git diff no muestra archivos sin rastrear (untracked). Añádelos con git add y usa git diff --staged.');
  }
  if (a.flags['exit-code']) out.ok = deltas.length === 0;
}

// ---------------------------------------------------------------------------
// Comandos de "fontanería" educativos
// ---------------------------------------------------------------------------

export function gitLsFiles(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['s', 'stage', 'o', 'others', 'm', 'modified', 'd', 'deleted', 'i', 'ignored', 'exclude-standard', 'u', 'unmerged'], alias: { s: 'stage', o: 'others', m: 'modified', d: 'deleted', u: 'unmerged' } });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const st = computeStatus(ctx.world, repo);
  const dp = (p: string) => displayPath(ctx, repo, p);
  if (a.flags['others']) {
    for (const p of st.untracked) ctx.out.line(dp(p));
    return;
  }
  if (a.flags['modified']) {
    for (const c of st.unstaged) ctx.out.line(dp(c.path));
    return;
  }
  if (a.flags['deleted']) {
    for (const c of st.unstaged.filter((x) => x.kind === 'deleted')) ctx.out.line(dp(c.path));
    return;
  }
  if (a.flags['unmerged']) {
    for (const p of st.unmerged) ctx.out.line(`100644 ${repo.index[p] ?? '0'.repeat(40)} 2\t${dp(p)}`);
    return;
  }
  for (const p of Object.keys(repo.index).sort()) {
    ctx.out.line(a.flags['stage'] ? `100644 ${repo.index[p]} 0\t${dp(p)}` : dp(p));
  }
}

export function gitRevParse(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['short', 'abbrev-ref', 'show-toplevel', 'git-dir', 'is-inside-work-tree', 'verify'] });
  if (a.flags['is-inside-work-tree']) {
    if (findRepo(ctx.world)) ctx.out.line('true');
    else ctx.out.error('fatal: not a git repository (or any of the parent directories): .git');
    return;
  }
  const repo = requireRepo(ctx);
  if (!repo) return;
  if (a.flags['show-toplevel']) return void ctx.out.line(repo.root);
  if (a.flags['git-dir']) return void ctx.out.line('.git');
  for (const rev of a.positional.length ? a.positional : []) {
    if (a.flags['abbrev-ref']) {
      if (rev === 'HEAD') ctx.out.line(currentBranch(repo) ?? 'HEAD');
      else if (rev.endsWith('@{u}') || rev.endsWith('@{upstream}')) {
        const b = rev.split('@')[0] || currentBranch(repo) || '';
        const up = repo.upstream[b];
        if (!up) return void ctx.out.error(`fatal: no upstream configured for branch '${b}'`);
        ctx.out.line(`${up.remote}/${up.branch}`);
      } else ctx.out.line(rev);
      continue;
    }
    const sha = resolveRev(repo, rev);
    if (!sha) {
      ctx.out.error(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.`);
      return;
    }
    ctx.out.line(a.flags['short'] ? short(sha) : sha);
  }
}

export function gitCatFile(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['t', 'p', 's', 'e'] });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out } = ctx;
  const ref = a.positional[0];
  if (!ref) {
    out.error('usage: git cat-file (-t | -s | -e | -p) <object>');
    return;
  }
  const blobMatch = Object.keys(repo.objects.blobs).filter((s) => s.startsWith(ref));
  const commitSha = resolveRev(repo, ref);
  if (commitSha && !(blobMatch.length === 1 && !repo.objects.commits[commitSha])) {
    const c = getCommit(repo, commitSha);
    if (a.flags['t']) return void out.line('commit');
    if (a.flags['e']) return;
    out.line(`tree (árbol con ${Object.keys(c.tree).length} archivos)`);
    for (const p of c.parents) out.line(`parent ${p}`);
    out.line(`author ${c.author.name} <${c.author.email}> ${Math.floor(c.timestamp / 1000)}`);
    out.line(`committer ${c.committer.name} <${c.committer.email}> ${Math.floor(c.timestamp / 1000)}`);
    out.blank();
    out.text(c.message);
    out.blank();
    out.line(['--- contenido del árbol (snapshot) ---', 'dim']);
    for (const p of Object.keys(c.tree).sort()) out.line(['100644 blob ', 'dim'], [c.tree[p], 'yellow'], '\t' + p);
    return;
  }
  if (blobMatch.length === 1) {
    if (a.flags['t']) return void out.line('blob');
    if (a.flags['s']) return void out.line(String(new TextEncoder().encode(repo.objects.blobs[blobMatch[0]]).length));
    if (a.flags['e']) return;
    out.text(repo.objects.blobs[blobMatch[0]].replace(/\n$/, ''));
    return;
  }
  out.error(`fatal: Not a valid object name ${ref}`);
}

export function gitHashObject(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['w', 'stdin'] });
  const repo = findRepo(ctx.world);
  for (const p of a.positional) {
    const abs = resolvePath(ctx.world.cwd, p, ctx.world.home);
    const content = ctx.world.fs.files[abs];
    if (content === undefined) {
      ctx.out.error(`fatal: could not open '${p}' for reading: No such file or directory`);
      return;
    }
    if (a.flags['w'] && repo) storeBlob(repo.objects, content);
    ctx.out.line(hashBlob(content));
  }
}

export { writeWork };
