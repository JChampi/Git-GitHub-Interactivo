/**
 * CLI de GitHub ("gh") simulada: un subconjunto para practicar el flujo de
 * Pull Requests e issues desde la terminal.
 */
import { parseArgs, ArgError } from './args';
import type { GitCtx } from './git/context';
import { currentBranch, findRepo } from './repo';
import { canonicalUrl } from './server';
import {
  closePullRequest,
  createIssue,
  createServerRepo,
  getServer,
  mergeBlockers,
  mergePullRequest,
  openPullRequest,
  prMergeability,
  repoUrl,
  reviewSummary,
  webUrl,
} from './server';
import type { RemoteServer } from './types';

function currentServer(ctx: GitCtx): RemoteServer | null {
  const repo = findRepo(ctx.world);
  if (!repo) {
    ctx.out.error('failed to run git: fatal: not a git repository (or any of the parent directories): .git');
    return null;
  }
  const url = repo.remotes['upstream'] ?? repo.remotes['origin'];
  if (!url) {
    ctx.out.error('no git remotes found');
    ctx.out.hint('gh necesita que el repositorio tenga un remoto de GitHub (git remote add origin <url>).');
    return null;
  }
  const s = getServer(ctx.world, url);
  if (!s) ctx.out.error(`GraphQL: Could not resolve to a Repository with the name '${url}'. (repository)`);
  return s;
}

export function runGh(ctx: GitCtx, argv: string[]): string {
  const { out, world } = ctx;
  const [group, action, ...rest] = argv;
  try {
    if (!group || group === 'help' || group === '--help') {
      out.text('Work seamlessly with GitHub from the command line. (simulado)\n\nUSAGE\n  gh <command> <subcommand> [flags]\n\nCOMMANDS\n  auth status        Estado de la sesión\n  repo create        Crea un repositorio en GitHub\n  repo view          Muestra información del repositorio\n  repo fork          Hace un fork del repositorio\n  pr create          Abre un Pull Request\n  pr list            Lista los Pull Requests\n  pr view <n>        Muestra un Pull Request\n  pr merge <n>       Fusiona un Pull Request\n  pr close <n>       Cierra un Pull Request\n  issue create       Crea un issue\n  issue list         Lista los issues\n  issue close <n>    Cierra un issue');
      return 'gh';
    }
    if (group === 'auth') {
      out.line('github.com');
      out.line(['  ✓ ', 'green'], `Logged in to github.com account ${world.githubUser} (simulación local)`);
      out.hint('En la vida real tendrías que ejecutar gh auth login con tu cuenta. Aquí la sesión es simulada.');
      return 'gh auth';
    }
    if (group === 'repo' && action === 'create') {
      const a = parseArgs(rest, { bool: ['public', 'private', 'add-readme', 'clone', 'push'], value: ['description', 'd', 'source', 'remote', 'gitignore', 'license'], alias: { d: 'description' } });
      const name = a.positional[0];
      if (!name) {
        out.error('error: indica el nombre del repositorio: gh repo create <nombre> --public');
        return 'gh repo create';
      }
      if (!a.flags['public'] && !a.flags['private']) {
        out.error('X `--public`, `--private`, or `--internal` required when not running interactively');
        return 'gh repo create';
      }
      const repoName = name.includes('/') ? name.split('/')[1] : name;
      if (!/^[\w.-]+$/.test(repoName)) {
        out.error('X El nombre solo puede contener letras, números, ".", "-" y "_"');
        return 'gh repo create';
      }
      if (world.servers[repoUrl(world.githubUser, repoName)]) {
        out.error(`GraphQL: Name already exists on this account (createRepository)`);
        return 'gh repo create';
      }
      const server = createServerRepo(world, {
        owner: world.githubUser,
        name: repoName,
        description: (a.flags['description'] as string) ?? '',
        visibility: a.flags['private'] ? 'private' : 'public',
        readme: !!a.flags['add-readme'],
        gitignore: a.flags['gitignore'] as string | undefined,
        license: a.flags['license'] as string | undefined,
      });
      out.line(['✓ ', 'green'], `Created repository ${world.githubUser}/${repoName} on GitHub`);
      out.line(`  ${webUrl(server)}`);
      if (a.flags['source']) {
        const repo = findRepo(world);
        if (repo) {
          const remote = (a.flags['remote'] as string) || 'origin';
          repo.remotes[remote] = server.url;
          out.line(['✓ ', 'green'], `Added remote ${server.url}`);
        }
      }
      return 'gh repo create';
    }
    if (group === 'repo' && action === 'view') {
      const s = rest[0] ? getServer(world, `https://github.com/${rest[0]}.git`) : currentServer(ctx);
      if (!s) {
        if (rest[0]) out.error(`GraphQL: Could not resolve to a Repository with the name '${rest[0]}'.`);
        return 'gh repo view';
      }
      out.line([`${s.owner}/${s.name}`, 'bold']);
      out.line(s.description || 'Sin descripción');
      out.line(`Visibilidad: ${s.visibility} · ★ ${s.stars} · Forks ${s.forks} · Rama por defecto: ${s.defaultBranch}`);
      out.line(`Ramas: ${Object.keys(s.heads).join(', ') || '(vacío)'}`);
      return 'gh repo view';
    }
    if (group === 'pr') {
      let server = currentServer(ctx);
      if (!server) return `gh pr ${action ?? ''}`.trim();
      const repo = findRepo(world)!;
      // En un fork, gh trabaja contra el repositorio original (como gh real).
      let headRepo: string | undefined;
      if (server.forkOf && world.servers[server.forkOf]) {
        headRepo = server.url;
        server = world.servers[server.forkOf];
      } else if (repo.remotes['upstream'] && repo.remotes['origin']) {
        headRepo = canonicalUrl(repo.remotes['origin']);
      }
      const headServer = (headRepo && world.servers[headRepo]) || server;
      switch (action) {
        case 'create': {
          void headServer;
          const a = parseArgs(rest, { bool: ['fill', 'draft', 'web'], value: ['title', 't', 'body', 'b', 'base', 'B', 'head', 'H'], alias: { t: 'title', b: 'body', B: 'base', H: 'head' } });
          const head = (a.flags['head'] as string) ?? currentBranch(repo);
          if (!head) {
            out.error('could not determine the current branch');
            return 'gh pr create';
          }
          let title = a.flags['title'] as string | undefined;
          if (!title && a.flags['fill']) {
            const sha = repo.heads[head];
            title = sha ? repo.objects.commits[sha].message.split('\n')[0] : head;
          }
          if (!title) {
            out.error('must provide `--title` and `--body` (or `--fill`) when not running interactively');
            return 'gh pr create';
          }
          if (!headServer.heads[head]) {
            out.error(`aborted: you must first push the current branch to a remote, or use the --head flag`);
            out.hint(`Publica la rama primero: git push -u origin ${head}`);
            return 'gh pr create';
          }
          if (repo.heads[head] && headServer.heads[head] !== repo.heads[head]) {
            out.line(['! ', 'yellow'], `Warning: ${head} tiene commits locales que no has subido. El PR usará la versión de GitHub.`);
          }
          const pr = openPullRequest(world, server, { title, body: (a.flags['body'] as string) ?? '', head, base: a.flags['base'] as string | undefined, author: world.githubUser, headRepo });
          if ('error' in pr) {
            out.error(pr.error);
            return 'gh pr create';
          }
          out.line(`Creating pull request for ${head} into ${pr.base} in ${server.owner}/${server.name}`);
          out.blank();
          out.line(`${webUrl(server)}/pull/${pr.number}`);
          return 'gh pr create';
        }
        case 'list': {
          const open = server.pulls.filter((p) => p.state === 'open');
          if (!open.length) {
            out.line(`no open pull requests in ${server.owner}/${server.name}`);
            return 'gh pr list';
          }
          out.line(`Showing ${open.length} of ${open.length} open pull request${open.length > 1 ? 's' : ''} in ${server.owner}/${server.name}`);
          out.blank();
          for (const p of open) out.line([`#${p.number}`.padEnd(5), 'green'], `${p.title.padEnd(36)} `, [`${p.head}`, 'cyan']);
          return 'gh pr list';
        }
        case 'view':
        case 'checks': {
          const n = parseInt((rest[0] ?? '').replace('#', ''), 10);
          const pr = server.pulls.find((p) => p.number === n) ?? server.pulls.find((p) => p.head === currentBranch(repo) && p.state === 'open');
          if (!pr) {
            out.error(`no pull requests found${rest[0] ? ` for ${rest[0]}` : ' for the current branch'}`);
            return 'gh pr view';
          }
          const m = prMergeability(world, server, pr);
          const rs = reviewSummary(world, server, pr);
          out.line([pr.title, 'bold'], [` #${pr.number}`, 'dim']);
          out.line([pr.state.toUpperCase(), pr.state === 'open' ? 'green' : pr.state === 'merged' ? 'magenta' : 'red'], ` • ${pr.author} quiere fusionar ${m.commits.length} commit(s) en ${pr.base} desde ${pr.head}`);
          out.line(`Revisiones: ${rs.approvals.length} aprobación(es), ${rs.changesRequested.length} cambio(s) solicitado(s)`);
          if (pr.body) {
            out.blank();
            out.text(pr.body);
          }
          if (pr.state === 'open') {
            const blockers = mergeBlockers(world, server, pr);
            out.blank();
            if (blockers.length) for (const b of blockers) out.line(['✗ ', 'red'], b);
            else out.line(['✓ ', 'green'], 'Listo para fusionar');
          }
          return 'gh pr view';
        }
        case 'merge': {
          const a = parseArgs(rest, { bool: ['merge', 'm', 'squash', 's', 'rebase', 'r', 'delete-branch', 'd', 'admin'], alias: { m: 'merge', s: 'squash', r: 'rebase', d: 'delete-branch' } });
          const n = parseInt((a.positional[0] ?? '').replace('#', ''), 10);
          const pr = server.pulls.find((p) => p.number === n) ?? server.pulls.find((p) => p.head === currentBranch(repo) && p.state === 'open');
          if (!pr) {
            out.error('no pull requests found');
            return 'gh pr merge';
          }
          if (a.flags['rebase']) {
            out.error('X El método "rebase and merge" no está disponible en el simulador. Usa --merge o --squash.');
            return 'gh pr merge';
          }
          const res = mergePullRequest(world, server, pr.number, { by: world.githubUser, method: a.flags['squash'] ? 'squash' : 'merge' });
          if ('error' in res) {
            out.error(`X Pull request #${pr.number} is not mergeable:\n${res.error}`);
            return 'gh pr merge';
          }
          out.line(['✓ ', 'magenta'], `${a.flags['squash'] ? 'Squashed and merged' : 'Merged'} pull request #${pr.number} (${pr.title})`);
          if (a.flags['delete-branch'] && pr.headRepo === server.url && pr.head !== server.defaultBranch) {
            delete server.heads[pr.head];
            out.line(['✓ ', 'red'], `Deleted branch ${pr.head}`);
          }
          out.hint('El merge ocurrió en GitHub. Tu repositorio local todavía no lo tiene: ejecuta git switch main && git pull.');
          return 'gh pr merge';
        }
        case 'close': {
          const n = parseInt((rest[0] ?? '').replace('#', ''), 10);
          const pr = server.pulls.find((p) => p.number === n);
          if (!pr) {
            out.error(`no pull requests found for ${rest[0]}`);
            return 'gh pr close';
          }
          closePullRequest(world, server, n);
          out.line(['✓ ', 'red'], `Closed pull request #${n} (${pr.title})`);
          return 'gh pr close';
        }
        default:
          out.error(`unknown command "${action ?? ''}" for "gh pr"`);
          return 'gh pr';
      }
    }
    if (group === 'issue') {
      const server = currentServer(ctx);
      if (!server) return 'gh issue';
      switch (action) {
        case 'create': {
          const a = parseArgs(rest, { value: ['title', 't', 'body', 'b', 'label', 'l'], alias: { t: 'title', b: 'body', l: 'label' } });
          if (!a.flags['title']) {
            out.error('must provide `--title` and `--body` when not running interactively');
            return 'gh issue create';
          }
          const issue = createIssue(world, server, { title: a.flags['title'] as string, body: (a.flags['body'] as string) ?? '', author: world.githubUser, labels: a.multi['label'] ?? [] });
          out.line(`Creating issue in ${server.owner}/${server.name}`);
          out.blank();
          out.line(`${webUrl(server)}/issues/${issue.number}`);
          return 'gh issue create';
        }
        case 'list': {
          const open = server.issues.filter((i) => i.state === 'open');
          if (!open.length) out.line(`no open issues in ${server.owner}/${server.name}`);
          for (const i of open) out.line([`#${i.number}`.padEnd(5), 'green'], i.title, i.labels.length ? ` (${i.labels.join(', ')})` : '');
          return 'gh issue list';
        }
        case 'close': {
          const n = parseInt((rest[0] ?? '').replace('#', ''), 10);
          const issue = server.issues.find((i) => i.number === n);
          if (!issue) {
            out.error(`issue #${rest[0]} not found`);
            return 'gh issue close';
          }
          issue.state = 'closed';
          out.line(['✓ ', 'red'], `Closed issue #${n} (${issue.title})`);
          return 'gh issue close';
        }
        default:
          out.error(`unknown command "${action ?? ''}" for "gh issue"`);
          return 'gh issue';
      }
    }
    out.error(`unknown command "${group}" for "gh"`);
    out.hint('Prueba con gh help para ver los comandos simulados.');
    return 'gh';
  } catch (e) {
    if (e instanceof ArgError) out.error(e.message.replace(/^error: /, 'unknown flag: '));
    else out.error(`error interno: ${(e as Error).message}`);
    return 'gh';
  }
}
