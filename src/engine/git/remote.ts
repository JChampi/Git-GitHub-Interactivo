/**
 * Repositorios remotos: remote, fetch, pull, push, clone.
 */
import { parseArgs } from '../args';
import {
  aheadBehind,
  applyTreeSwitch,
  copyObjects,
  createRepository,
  currentBranch,
  getCommit,
  headSha,
  isAncestor,
  recordReflog,
  short,
} from '../repo';
import { canonicalUrl, getServer, protectionFor, runWorkflows, webUrl } from '../server';
import type { RemoteServer, Repository } from '../types';
import { basename, exists, isDir, listDir, mkdirp, resolvePath } from '../vfs';
import { type GitCtx, requireRepo } from './context';
import { mergeInto } from './branch';
import { gitRebase } from './branch';

function notFound(ctx: GitCtx, url: string) {
  ctx.out.error(`remote: Repository not found.\nfatal: repository '${url.replace(/\.git$/, '')}/' not found`);
  ctx.out.hint('La URL no corresponde a ningún repositorio del GitHub simulado. Créalo primero en el módulo GitHub o revisa git remote -v.');
}

function serverForRemote(ctx: GitCtx, repo: Repository, remote: string): RemoteServer | null {
  const url = repo.remotes[remote];
  if (!url) {
    // ¿Es una URL directa?
    if (/^(https?:\/\/|git@)/.test(remote)) {
      const s = getServer(ctx.world, remote);
      if (!s) notFound(ctx, remote);
      return s;
    }
    ctx.out.error(`fatal: '${remote}' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.`);
    ctx.out.hint(Object.keys(repo.remotes).length ? `Remotos configurados: ${Object.keys(repo.remotes).join(', ')}` : 'No hay remotos configurados. Añade uno con: git remote add origin <url>');
    return null;
  }
  const s = getServer(ctx.world, url);
  if (!s) notFound(ctx, url);
  return s;
}

// ---------------------------------------------------------------------------
// remote
// ---------------------------------------------------------------------------

export function gitRemote(ctx: GitCtx, argv: string[]): void {
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out } = ctx;
  const verbose = argv[0] === '-v' || argv[0] === '--verbose';
  const sub = verbose ? undefined : argv[0];
  const args = argv.slice(1);
  switch (sub) {
    case undefined:
      for (const [name, url] of Object.entries(repo.remotes)) {
        if (verbose) {
          out.line(`${name}\t${url} (fetch)`);
          out.line(`${name}\t${url} (push)`);
        } else out.line(name);
      }
      if (!Object.keys(repo.remotes).length) out.hint('Este repositorio no tiene remotos. Conéctalo con GitHub: git remote add origin https://github.com/usuario/repo.git');
      return;
    case 'add': {
      const [name, url] = args.filter((x) => !x.startsWith('-'));
      if (!name || !url) {
        out.error('usage: git remote add [<options>] <name> <url>');
        return;
      }
      if (name in repo.remotes) {
        out.error(`error: remote ${name} already exists.`);
        out.hint(`Para cambiar su URL usa: git remote set-url ${name} <url-nueva>`);
        return;
      }
      repo.remotes[name] = url;
      if (!getServer(ctx.world, url)) out.hint('El remoto se guardó, pero esa URL no existe en el GitHub simulado: fetch/push fallarán hasta que crees el repositorio.');
      if (args.includes('-f')) gitFetch(ctx, [name]);
      return;
    }
    case 'remove':
    case 'rm': {
      const name = args[0];
      if (!name || !(name in repo.remotes)) {
        out.error(`error: No such remote: '${name ?? ''}'`);
        return;
      }
      delete repo.remotes[name];
      for (const r of Object.keys(repo.remoteRefs)) if (r.startsWith(name + '/')) delete repo.remoteRefs[r];
      for (const [b, up] of Object.entries(repo.upstream)) if (up.remote === name) delete repo.upstream[b];
      return;
    }
    case 'rename': {
      const [from, to] = args;
      if (!from || !to) {
        out.error('usage: git remote rename <old> <new>');
        return;
      }
      if (!(from in repo.remotes)) {
        out.error(`error: No such remote: '${from}'`);
        return;
      }
      if (to in repo.remotes) {
        out.error(`error: remote ${to} already exists.`);
        return;
      }
      repo.remotes[to] = repo.remotes[from];
      delete repo.remotes[from];
      for (const r of Object.keys(repo.remoteRefs)) {
        if (r.startsWith(from + '/')) {
          repo.remoteRefs[to + r.slice(from.length)] = repo.remoteRefs[r];
          delete repo.remoteRefs[r];
        }
      }
      for (const up of Object.values(repo.upstream)) if (up.remote === from) up.remote = to;
      return;
    }
    case 'get-url': {
      const url = repo.remotes[args[0]];
      if (!url) {
        out.error(`error: No such remote '${args[0] ?? ''}'`);
        return;
      }
      out.line(url);
      return;
    }
    case 'set-url': {
      const [name, url] = args;
      if (!name || !url) {
        out.error('usage: git remote set-url <name> <newurl>');
        return;
      }
      if (!(name in repo.remotes)) {
        out.error(`error: No such remote '${name}'`);
        return;
      }
      repo.remotes[name] = url;
      return;
    }
    case 'show': {
      const name = args[0];
      if (!name) {
        for (const n of Object.keys(repo.remotes)) out.line(n);
        return;
      }
      const server = serverForRemote(ctx, repo, name);
      if (!server) return;
      out.line(`* remote ${name}`);
      out.line(`  Fetch URL: ${repo.remotes[name]}`);
      out.line(`  Push  URL: ${repo.remotes[name]}`);
      out.line(`  HEAD branch: ${server.defaultBranch}`);
      out.line('  Remote branches:');
      for (const b of Object.keys(server.heads).sort()) out.line(`    ${b.padEnd(20)} ${`${name}/${b}` in repo.remoteRefs ? 'tracked' : 'new (next fetch will store in remotes/' + name + ')'}`);
      const ups = Object.entries(repo.upstream).filter(([, u]) => u.remote === name);
      if (ups.length) {
        out.line("  Local branches configured for 'git pull':");
        for (const [b, u] of ups) out.line(`    ${b.padEnd(20)} merges with remote ${u.branch}`);
      }
      return;
    }
    case 'prune': {
      const name = args[0];
      const server = name ? serverForRemote(ctx, repo, name) : null;
      if (!server) return;
      for (const r of Object.keys(repo.remoteRefs)) {
        if (r.startsWith(name + '/') && !(r.slice(name.length + 1) in server.heads)) {
          out.line(` * [pruned] ${r}`);
          delete repo.remoteRefs[r];
        }
      }
      return;
    }
    default:
      out.error(`error: unknown subcommand: \`${sub}'`);
      out.hint('Subcomandos: git remote [-v], add, remove, rename, get-url, set-url, show, prune');
  }
}

// ---------------------------------------------------------------------------
// fetch
// ---------------------------------------------------------------------------

export function fetchRemote(ctx: GitCtx, repo: Repository, remote: string, prune: boolean, quiet = false): boolean {
  const server = serverForRemote(ctx, repo, remote);
  if (!server) return false;
  const { out } = ctx;
  copyObjects(server.objects, repo.objects, [...Object.values(server.heads), ...Object.values(server.tags).map((t) => t.target)]);
  const lines: string[] = [];
  for (const [b, sha] of Object.entries(server.heads)) {
    const ref = `${remote}/${b}`;
    const old = repo.remoteRefs[ref];
    if (old === sha) continue;
    if (!old) lines.push(` * [new branch]      ${b.padEnd(10)} -> ${ref}`);
    else if (isAncestor(repo.objects, old, sha)) lines.push(`   ${short(old)}..${short(sha)}  ${b.padEnd(10)} -> ${ref}`);
    else lines.push(` + ${short(old)}...${short(sha)} ${b.padEnd(10)} -> ${ref}  (forced update)`);
    repo.remoteRefs[ref] = sha;
  }
  for (const [t, tag] of Object.entries(server.tags)) {
    if (!(t in repo.tags)) {
      repo.tags[t] = structuredClone(tag);
      lines.push(` * [new tag]         ${t.padEnd(10)} -> ${t}`);
    }
  }
  if (prune) {
    for (const r of Object.keys(repo.remoteRefs)) {
      if (r.startsWith(remote + '/') && !(r.slice(remote.length + 1) in server.heads)) {
        lines.push(` - [deleted]         (none)     -> ${r}`);
        delete repo.remoteRefs[r];
      }
    }
  }
  if (lines.length && !quiet) {
    out.line(`From ${webUrl(server)}`);
    for (const l of lines) out.line(l);
  }
  return true;
}

export function gitFetch(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['all', 'p', 'prune', 'v', 'q', 'quiet', 'tags'], alias: { p: 'prune', q: 'quiet' } });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const remotes = a.flags['all'] ? Object.keys(repo.remotes) : [a.positional[0] ?? (() => {
    const cur = currentBranch(repo);
    return (cur && repo.upstream[cur]?.remote) || 'origin';
  })()];
  if (!remotes.length || (!a.flags['all'] && !(remotes[0] in repo.remotes) && !/^(https?:|git@)/.test(remotes[0]))) {
    if (!Object.keys(repo.remotes).length) {
      ctx.out.error("fatal: 'origin' does not appear to be a git repository\nfatal: Could not read from remote repository.");
      ctx.out.hint('Primero conecta el repositorio con un remoto: git remote add origin <url>');
      return;
    }
  }
  const before = JSON.stringify(repo.remoteRefs);
  for (const r of remotes) if (!fetchRemote(ctx, repo, r, !!a.flags['prune'], !!a.flags['quiet'])) return;
  if (before === JSON.stringify(repo.remoteRefs)) ctx.out.hint('fetch terminó sin novedades: tus ramas remotas ya estaban al día.');
  else ctx.out.hint('fetch descargó commits y actualizó las ramas remotas (origin/*), pero NO tocó tus ramas locales ni tus archivos. Intégralos con git merge o git pull.');
}

// ---------------------------------------------------------------------------
// pull
// ---------------------------------------------------------------------------

export function gitPull(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['rebase', 'r', 'no-rebase', 'ff-only', 'ff', 'no-ff', 'q', 'quiet', 'v', 'all', 'prune', 'p'], alias: { r: 'rebase', q: 'quiet', p: 'prune' } });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out, world } = ctx;
  const cur = currentBranch(repo);
  if (repo.operation) {
    out.error(`error: You have not concluded your ${repo.operation.kind}.\nhint: Please, commit your changes before merging.\nfatal: Exiting because of unfinished merge.`);
    return;
  }
  let remote = a.positional[0];
  let branch = a.positional[1];
  if (!remote) {
    const up = cur ? repo.upstream[cur] : undefined;
    if (!up) {
      if (!Object.keys(repo.remotes).length) {
        out.error('fatal: No remote repository specified.  Please, specify either a URL or a\nremote name from which new revisions should be fetched.');
        return;
      }
      out.error(
        `There is no tracking information for the current branch.\nPlease specify which branch you want to merge with.\nSee git-pull(1) for details.\n\n    git pull <remote> <branch>\n\nIf you wish to set tracking information for this branch you can do so with:\n\n    git branch --set-upstream-to=origin/<branch> ${cur ?? '<branch>'}\n`,
      );
      out.hint('Tu rama local no está vinculada a una rama remota. Usa git push -u origin <rama> la primera vez o indica remoto y rama: git pull origin main');
      return;
    }
    remote = up.remote;
    branch = up.branch;
  }
  if (!branch) {
    const up = cur ? repo.upstream[cur] : undefined;
    branch = up && up.remote === remote ? up.branch : cur ?? 'main';
  }
  const server = serverForRemote(ctx, repo, remote);
  if (!server) return;
  if (!(branch in server.heads)) {
    out.error(`fatal: couldn't find remote ref ${branch}`);
    return;
  }
  fetchRemote(ctx, repo, remote, !!a.flags['prune']);
  const ref = `${remote}/${branch}`;
  const theirs = repo.remoteRefs[ref];
  const head = headSha(repo);
  const rebase = a.flags['rebase'] || (!a.flags['no-rebase'] && world.globalConfig['pull.rebase'] === 'true');
  if (head && theirs && !isAncestor(repo.objects, head, theirs) && !isAncestor(repo.objects, theirs, head)) {
    if (!rebase && !a.flags['no-rebase'] && !a.flags['ff-only'] && !a.flags['no-ff'] && world.globalConfig['pull.rebase'] === undefined && repo.config['pull.rebase'] === undefined) {
      out.error(
        'hint: You have divergent branches and need to specify how to reconcile them.\nhint: You can do so by running one of the following commands sometime before\nhint: your next pull:\nhint:\nhint:   git config pull.rebase false  # merge\nhint:   git config pull.rebase true   # rebase\nhint:   git config pull.ff only       # fast-forward only\nhint:\nfatal: Need to specify how to reconcile divergent branches.',
      );
      out.hint('Tu rama y la remota tienen commits distintos. Elige: git pull --no-rebase (crea merge) o git pull --rebase (reaplica tus commits encima).');
      return;
    }
  }
  if (rebase && head) {
    gitRebase(ctx, [ref]);
    return;
  }
  const { ahead, behind } = head && theirs ? aheadBehind(repo.objects, head, theirs) : { ahead: 0, behind: 1 };
  void ahead;
  if (behind === 0) {
    out.line('Already up to date.');
    return;
  }
  const ok = mergeInto(ctx, repo, theirs, ref, {
    ffOnly: !!a.flags['ff-only'],
    noFF: !!a.flags['no-ff'],
    defaultMessage: `Merge branch '${branch}' of ${webUrl(server)}`,
  });
  if (ok && !cur) return;
  if (ok) out.hint('pull = fetch + merge: descargó los commits remotos y los integró en tu rama actual.');
}

// ---------------------------------------------------------------------------
// push
// ---------------------------------------------------------------------------

export function gitPush(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, {
    bool: ['u', 'set-upstream', 'f', 'force', 'force-with-lease', 'd', 'delete', 'tags', 'all', 'n', 'dry-run', 'q', 'quiet', 'v'],
    alias: { u: 'set-upstream', f: 'force', d: 'delete', n: 'dry-run', q: 'quiet' },
  });
  const repo = requireRepo(ctx);
  if (!repo) return;
  const { out, world } = ctx;
  const cur = currentBranch(repo);
  let remote = a.positional[0];
  let refspecs = a.positional.slice(1);
  if (!remote) {
    if (!Object.keys(repo.remotes).length) {
      out.error('fatal: No configured push destination.\nEither specify the URL from the command-line or configure a remote repository using\n\n    git remote add <name> <url>\n\nand then push using the remote name\n\n    git push <name>\n');
      return;
    }
    if (!cur) {
      out.error('fatal: You are not currently on a branch.\nTo push the history leading to the current (detached HEAD)\nstate now, use\n\n    git push origin HEAD:<name-of-remote-branch>\n');
      return;
    }
    const up = repo.upstream[cur];
    if (!up && !a.flags['all'] && !a.flags['tags']) {
      const r = Object.keys(repo.remotes)[0];
      out.error(`fatal: The current branch ${cur} has no upstream branch.\nTo push the current branch and set the remote as upstream, use\n\n    git push --set-upstream ${r} ${cur}\n\nTo have this happen automatically for branches without a tracking\nupstream, see 'push.autoSetupRemote' in 'git help config'.\n`);
      out.hint(`La primera vez que publicas una rama debes indicar destino. Atajo habitual: git push -u ${r} ${cur}`);
      return;
    }
    remote = up?.remote ?? Object.keys(repo.remotes)[0];
    if (up) refspecs = [`${cur}:${up.branch}`];
  }
  const server = serverForRemote(ctx, repo, remote);
  if (!server) return;
  const url = repo.remotes[remote] ?? canonicalUrl(remote);

  if (a.flags['all']) refspecs = Object.keys(repo.heads);
  if (!refspecs.length && !a.flags['tags']) {
    if (!cur) {
      out.error('fatal: You are not currently on a branch.');
      return;
    }
    refspecs = [cur];
  }

  const results: string[] = [];
  const errors: string[] = [];
  const remoteMsgs: string[] = [];
  let pushedObjects = 0;
  let rejected = false;

  for (const spec of refspecs) {
    let [src, dst] = spec.includes(':') ? spec.split(':') : [spec, spec];
    if (src === 'HEAD') src = cur ?? headSha(repo) ?? 'HEAD';
    if (!dst) dst = src;
    // Borrar rama remota: --delete rama  o  :rama
    if (a.flags['delete'] || spec.startsWith(':')) {
      const target = spec.startsWith(':') ? spec.slice(1) : src;
      if (!(target in server.heads)) {
        errors.push(`error: unable to delete '${target}': remote ref does not exist`);
        rejected = true;
        continue;
      }
      if (target === server.defaultBranch) {
        results.push(` ! [remote rejected] ${target} (refusing to delete the current branch: refs/heads/${target})`);
        rejected = true;
        continue;
      }
      if (protectionFor(server, target)) {
        remoteMsgs.push(`remote: error: GH006: Protected branch update failed for refs/heads/${target}.`, 'remote: error: Cannot delete this protected branch');
        results.push(` ! [remote rejected] ${target} (protected branch hook declined)`);
        rejected = true;
        continue;
      }
      if (!a.flags['dry-run']) {
        delete server.heads[target];
        delete repo.remoteRefs[`${remote}/${target}`];
      }
      results.push(` - [deleted]         ${target}`);
      continue;
    }
    const sha = repo.heads[src] ?? (repo.tags[src]?.target) ?? (src.length >= 4 ? Object.keys(repo.objects.commits).find((s) => s.startsWith(src)) : undefined);
    if (!sha) {
      errors.push(`error: src refspec ${src} does not match any`);
      if (!headSha(repo)) out.hint('No puedes subir una rama sin commits. Crea al menos un commit antes de hacer push.');
      else out.hint(`No existe una rama local llamada "${src}". Revisa el nombre con git branch.`);
      rejected = true;
      continue;
    }
    if (src in repo.tags && !(src in repo.heads)) {
      if (server.tags[src]) {
        results.push(` ! [rejected]        ${src} -> ${src} (already exists)`);
        rejected = true;
      } else {
        if (!a.flags['dry-run']) {
          pushedObjects += copyObjects(repo.objects, server.objects, [sha]);
          server.tags[src] = structuredClone(repo.tags[src]);
        }
        results.push(` * [new tag]         ${src} -> ${src}`);
      }
      continue;
    }
    const remoteSha = server.heads[dst];
    const force = !!a.flags['force'] || !!a.flags['force-with-lease'] || src.startsWith('+');
    if (remoteSha === sha) {
      results.push('UPTODATE');
      continue;
    }
    const prot = protectionFor(server, dst);
    if (prot && prot.requirePullRequest) {
      remoteMsgs.push(
        `remote: error: GH006: Protected branch update failed for refs/heads/${dst}.`,
        'remote: error: Changes must be made through a pull request.',
      );
      results.push(` ! [remote rejected] ${src} -> ${dst} (protected branch hook declined)`);
      rejected = true;
      out.hint(`La rama ${dst} está protegida en GitHub: no admite push directo. Sube tu trabajo a otra rama y abre un Pull Request.`);
      continue;
    }
    if (remoteSha) {
      const known = !!repo.objects.commits[remoteSha];
      const ff = known && isAncestor(repo.objects, remoteSha, sha);
      if (!ff && !force) {
        results.push(` ! [rejected]        ${src} -> ${dst} (${known ? 'non-fast-forward' : 'fetch first'})`);
        rejected = true;
        out.push([]);
        errors.push(
          known
            ? `hint: Updates were rejected because the tip of your current branch is behind\nhint: its remote counterpart. If you want to integrate the remote changes,\nhint: use 'git pull' before pushing again.\nhint: See the 'Note about fast-forwards' in 'git push --help' for details.`
            : `hint: Updates were rejected because the remote contains work that you do not\nhint: have locally. This is usually caused by another repository pushing to\nhint: the same ref. If you want to integrate the remote changes, use\nhint: 'git pull' before pushing again.\nhint: See the 'Note about fast-forwards' in 'git push --help' for details.`,
        );
        continue;
      }
      if (!ff && force) {
        if (prot && !prot.allowForcePush) {
          remoteMsgs.push(`remote: error: GH006: Protected branch update failed for refs/heads/${dst}.`, 'remote: error: Cannot force-push to this branch');
          results.push(` ! [remote rejected] ${src} -> ${dst} (protected branch hook declined)`);
          rejected = true;
          continue;
        }
        if (a.flags['force-with-lease'] && repo.remoteRefs[`${remote}/${dst}`] !== remoteSha) {
          results.push(` ! [rejected]        ${src} -> ${dst} (stale info)`);
          rejected = true;
          out.hint('--force-with-lease se negó: el remoto cambió desde tu último fetch. Así evita borrar el trabajo de un compañero.');
          continue;
        }
        if (!a.flags['dry-run']) pushedObjects += copyObjects(repo.objects, server.objects, [sha]);
        results.push(` + ${short(remoteSha)}...${short(sha)} ${src} -> ${dst} (forced update)`);
      } else {
        if (!a.flags['dry-run']) pushedObjects += copyObjects(repo.objects, server.objects, [sha]);
        results.push(`   ${short(remoteSha)}..${short(sha)}  ${src} -> ${dst}`);
      }
    } else {
      if (!a.flags['dry-run']) pushedObjects += copyObjects(repo.objects, server.objects, [sha]);
      results.push(` * [new branch]      ${src} -> ${dst}`);
      if (dst !== server.defaultBranch) {
        remoteMsgs.push(
          'remote: ',
          `remote: Create a pull request for '${dst}' on GitHub by visiting:`,
          `remote:      ${webUrl(server)}/pull/new/${dst}`,
          'remote: ',
        );
      }
    }
    if (a.flags['dry-run']) continue;
    server.heads[dst] = sha;
    repo.remoteRefs[`${remote}/${dst}`] = sha;
    runWorkflows(world, server, dst, sha, 'push');
    if (a.flags['set-upstream'] && src in repo.heads) {
      repo.upstream[src] = { remote, branch: dst };
    }
  }
  if (a.flags['tags']) {
    for (const [t, tag] of Object.entries(repo.tags)) {
      if (server.tags[t]) continue;
      if (!a.flags['dry-run']) {
        pushedObjects += copyObjects(repo.objects, server.objects, [tag.target]);
        server.tags[t] = structuredClone(tag);
      }
      results.push(` * [new tag]         ${t} -> ${t}`);
    }
  }

  const real = results.filter((r) => r !== 'UPTODATE');
  if (!real.length && !errors.length) {
    out.line('Everything up-to-date');
    out.hint('No había commits nuevos que subir: el remoto ya tiene todo lo de tu rama.');
    return;
  }
  if (pushedObjects) {
    out.line(`Enumerating objects: ${pushedObjects * 3}, done.`);
    out.line(`Counting objects: 100% (${pushedObjects * 3}/${pushedObjects * 3}), done.`);
    out.line(`Writing objects: 100% (${pushedObjects * 3}/${pushedObjects * 3}), done.`);
    out.line(`Total ${pushedObjects * 3} (delta 0), reused 0 (delta 0), pack-reused 0`);
  }
  for (const m of remoteMsgs) out.line(m);
  out.line(`To ${url}`);
  for (const r of real) out.line([r, r.includes('!') ? 'red' : undefined]);
  if (rejected || errors.length) {
    for (const e of errors) out.line([e, e.startsWith('hint') ? 'yellow' : 'error']);
    out.error(`error: failed to push some refs to '${url}'`);
    if (results.some((r) => r.includes('fetch first') || r.includes('non-fast-forward'))) {
      out.hint('Alguien subió commits que tú no tienes. Ejecuta git pull para integrarlos y luego vuelve a hacer push.');
    }
  }
  if (a.flags['set-upstream'] && !rejected) {
    for (const spec of refspecs) {
      const src = spec.split(':')[0] === 'HEAD' ? cur : spec.split(':')[0];
      if (src && repo.upstream[src]) out.line(`branch '${src}' set up to track '${remote}/${repo.upstream[src].branch}'.`);
    }
  }
  if (a.flags['force'] && !rejected) out.hint('Force push sobrescribió la historia remota. En ramas compartidas usa --force-with-lease, que es más seguro.');
}

// ---------------------------------------------------------------------------
// clone
// ---------------------------------------------------------------------------

export function gitClone(ctx: GitCtx, argv: string[]): void {
  const a = parseArgs(argv, { bool: ['q', 'quiet', 'bare', 'single-branch'], value: ['b', 'branch', 'depth', 'o', 'origin'], alias: { b: 'branch', q: 'quiet', o: 'origin' } });
  const { out, world } = ctx;
  const url = a.positional[0];
  if (!url) {
    out.error('fatal: You must specify a repository to clone.\n\nusage: git clone [<options>] [--] <repo> [<dir>]');
    return;
  }
  const server = getServer(world, url);
  const name = basename(url.replace(/\.git$/, '').replace(/\/+$/, ''));
  const dir = resolvePath(world.cwd, a.positional[1] ?? name, world.home);
  if (exists(world.fs, dir) && (!isDir(world.fs, dir) || listDir(world.fs, dir).length)) {
    out.error(`fatal: destination path '${a.positional[1] ?? name}' already exists and is not an empty directory.`);
    return;
  }
  out.line(`Cloning into '${a.positional[1] ?? name}'...`);
  if (!server) {
    notFound(ctx, canonicalUrl(url));
    return;
  }
  mkdirp(world.fs, dir);
  const repo = createRepository(dir, server.defaultBranch);
  const remoteName = (a.flags['origin'] as string) || 'origin';
  repo.remotes[remoteName] = url;
  world.repos[dir] = repo;
  const sub: GitCtx = { ...ctx };
  fetchRemote(sub, repo, remoteName, false, true);
  const count = Object.keys(repo.objects.commits).length;
  if (!count) {
    out.line('warning: You appear to have cloned an empty repository.');
    return;
  }
  out.line(`remote: Enumerating objects: ${count * 3}, done.`);
  out.line(`remote: Counting objects: 100% (${count * 3}/${count * 3}), done.`);
  out.line(`remote: Total ${count * 3} (delta 0), reused ${count * 3} (delta 0), pack-reused 0`);
  out.line(`Receiving objects: 100% (${count * 3}/${count * 3}), done.`);
  const branch = (a.flags['branch'] as string) || server.defaultBranch;
  const sha = repo.remoteRefs[`${remoteName}/${branch}`];
  if (!sha) {
    out.error(`warning: Could not find remote branch ${branch} to clone.\nfatal: Remote branch ${branch} not found in upstream origin`);
    return;
  }
  repo.heads[branch] = sha;
  repo.head = { kind: 'branch', name: branch };
  repo.upstream[branch] = { remote: remoteName, branch };
  applyTreeSwitch(world, repo, {}, getCommit(repo, sha).tree);
  recordReflog(world, repo, sha, null, `clone: from ${url}`);
  out.hint(`Se creó la carpeta "${a.positional[1] ?? name}" con todo el historial. Entra con: cd ${a.positional[1] ?? name}`);
}
