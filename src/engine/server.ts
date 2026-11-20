/**
 * Servidor remoto simulado con funcionalidades de GitHub: repositorios,
 * ramas protegidas, Pull Requests, revisiones, issues, forks, releases,
 * colaboradores, GitHub Actions y GitHub Pages.
 *
 * Todo ocurre localmente en el navegador: es una SIMULACIÓN educativa.
 */
import { mergeTrees } from './merge';
import { ancestors, copyObjects, createCommit, firstLine, isAncestor, mergeBase, readBlob, storeBlob, treeContents } from './repo';
import type { BranchProtection, Person, PullRequest, RemoteServer, Tree, World, WorkflowRun } from './types';
import { now } from './vfs';

export function canonicalUrl(url: string): string {
  let u = url.trim();
  const ssh = /^git@github\.com:(.+)$/.exec(u);
  if (ssh) u = `https://github.com/${ssh[1]}`;
  u = u.replace(/\/+$/, '').replace(/\.git$/, '');
  return u + '.git';
}

export function repoUrl(owner: string, name: string): string {
  return `https://github.com/${owner}/${name}.git`;
}

export function webUrl(server: RemoteServer): string {
  return server.url.replace(/\.git$/, '');
}

export function getServer(world: World, url: string): RemoteServer | null {
  return world.servers[canonicalUrl(url)] ?? null;
}

export function personFor(username: string): Person {
  return { name: username, email: `${username}@users.noreply.github.com` };
}

const LICENSES: Record<string, string> = {
  MIT: `MIT License\n\nCopyright (c) ${new Date().getFullYear()}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction...\n`,
  'Apache-2.0': 'Apache License\nVersion 2.0, January 2004\nhttp://www.apache.org/licenses/\n',
  'GPL-3.0': 'GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\n',
};

export const GITIGNORE_TEMPLATES: Record<string, string> = {
  Node: '# Dependencias\nnode_modules/\n\n# Builds\ndist/\nbuild/\n\n# Logs\nnpm-debug.log*\n*.log\n\n# Variables de entorno\n.env\n.env.local\n',
  Python: '__pycache__/\n*.py[cod]\n.venv/\nvenv/\n.env\ndist/\n*.egg-info/\n',
  Java: '*.class\ntarget/\n*.jar\n.idea/\n*.iml\n',
};

export interface CreateRepoOptions {
  owner: string;
  name: string;
  description?: string;
  visibility?: 'public' | 'private';
  readme?: boolean;
  gitignore?: string;
  license?: string;
  defaultBranch?: string;
  files?: Record<string, string>;
  author?: Person;
}

export function createServerRepo(world: World, opts: CreateRepoOptions): RemoteServer {
  const url = repoUrl(opts.owner, opts.name);
  const server: RemoteServer = {
    url,
    owner: opts.owner,
    name: opts.name,
    description: opts.description ?? '',
    visibility: opts.visibility ?? 'public',
    objects: { commits: {}, blobs: {} },
    heads: {},
    tags: {},
    defaultBranch: opts.defaultBranch ?? 'main',
    issues: [],
    pulls: [],
    nextNumber: 1,
    protectedBranches: {},
    collaborators: [{ username: opts.owner, role: 'admin', status: 'active' }],
    stars: 0,
    starredByMe: false,
    watching: true,
    forks: 0,
    releases: [],
    pages: { enabled: false, branch: opts.defaultBranch ?? 'main' },
    runs: [],
    topics: [],
  };
  const files: Record<string, string> = { ...(opts.files ?? {}) };
  if (opts.readme) files['README.md'] = `# ${opts.name}\n\n${opts.description ?? ''}\n`;
  if (opts.gitignore && GITIGNORE_TEMPLATES[opts.gitignore]) files['.gitignore'] = GITIGNORE_TEMPLATES[opts.gitignore];
  if (opts.license && LICENSES[opts.license]) files['LICENSE'] = LICENSES[opts.license];
  if (Object.keys(files).length) {
    const tree: Tree = {};
    for (const [p, c] of Object.entries(files)) tree[p] = storeBlob(server.objects, c);
    const c = createCommit(world, server.objects, { tree, parents: [], message: 'Initial commit', author: opts.author ?? personFor(opts.owner) });
    server.heads[server.defaultBranch] = c.sha;
  }
  world.servers[url] = server;
  return server;
}

export function serverTree(server: RemoteServer, branch: string): Tree {
  const sha = server.heads[branch];
  return sha ? server.objects.commits[sha].tree : {};
}

export function serverFiles(server: RemoteServer, ref: string): Record<string, string> {
  const sha = server.heads[ref] ?? (server.objects.commits[ref] ? ref : undefined);
  return sha ? treeContents(server.objects, server.objects.commits[sha].tree) : {};
}

/** Commit hecho directamente en el servidor (edición web o push de un compañero simulado). */
export function serverCommit(
  world: World,
  server: RemoteServer,
  opts: { branch: string; from?: string; author: Person; message: string; changes: Record<string, string | null> },
): string {
  const baseSha = server.heads[opts.branch] ?? (opts.from ? server.heads[opts.from] ?? opts.from : server.heads[server.defaultBranch]);
  const tree: Tree = baseSha ? { ...server.objects.commits[baseSha].tree } : {};
  for (const [p, c] of Object.entries(opts.changes)) {
    if (c === null) delete tree[p];
    else tree[p] = storeBlob(server.objects, c);
  }
  const commit = createCommit(world, server.objects, { tree, parents: baseSha ? [baseSha] : [], message: opts.message, author: opts.author });
  server.heads[opts.branch] = commit.sha;
  runWorkflows(world, server, opts.branch, commit.sha, 'push');
  return commit.sha;
}

export function protectionFor(server: RemoteServer, branch: string): BranchProtection | null {
  return server.protectedBranches[branch] ?? null;
}

// ---------------------------------------------------------------------------
// GitHub Actions simulado
// ---------------------------------------------------------------------------

/**
 * Ejecuta los workflows de .github/workflows/*.yml del commit indicado.
 * El "runner" simulado valida la estructura del YAML (claves name/on/jobs/steps)
 * y comprueba que el evento coincide; no ejecuta código real.
 */
export function runWorkflows(world: World, server: RemoteServer, branch: string, sha: string, event: 'push' | 'pull_request'): WorkflowRun[] {
  const tree = server.objects.commits[sha]?.tree ?? {};
  const runs: WorkflowRun[] = [];
  for (const path of Object.keys(tree).filter((p) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p))) {
    const yml = readBlob(server.objects, tree[path]);
    const name = /^name:\s*(.+)$/m.exec(yml)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? path.split('/').pop()!;
    const onMatch = /^on:\s*(.*)$/m.exec(yml);
    const triggers = onMatch ? (onMatch[1] ? onMatch[1] : yml.slice(onMatch.index).split('\njobs:')[0]) : '';
    if (!triggers.includes(event)) continue;
    const steps: WorkflowRun['steps'] = [];
    const hasJobs = /^jobs:\s*$/m.test(yml);
    const runsOn = /runs-on:\s*(\S+)/.exec(yml)?.[1];
    steps.push({ name: 'Set up job', ok: hasJobs && !!runsOn, log: hasJobs && runsOn ? `Runner simulado: ${runsOn}` : 'Error: el workflow necesita "jobs:" y "runs-on:"' });
    const stepNames = [...yml.matchAll(/-\s+(?:name|uses|run):\s*(.+)/g)].map((m) => m[1].trim());
    for (const s of stepNames) {
      const isTest = /test/i.test(s);
      // Un paso de test falla si el repo no tiene ninguna carpeta/archivo de pruebas.
      const hasTests = Object.keys(tree).some((p) => /(^|\/)(tests?|__tests__)\/|\.test\./.test(p));
      const ok = hasJobs && !!runsOn && (!isTest || hasTests);
      steps.push({ name: s, ok, log: ok ? `✓ ${s}` : isTest && !hasTests ? 'No se encontraron archivos de prueba (tests/ o *.test.*)' : 'Paso omitido por un error anterior' });
    }
    if (stepNames.length === 0) steps.push({ name: 'steps', ok: false, log: 'El job no define "steps:"' });
    const run: WorkflowRun = {
      id: server.runs.length + 1,
      workflow: name,
      file: path,
      event,
      branch,
      sha,
      status: steps.every((s) => s.ok) ? 'success' : 'failure',
      steps,
      timestamp: now(world),
    };
    server.runs.unshift(run);
    runs.push(run);
  }
  return runs;
}

// ---------------------------------------------------------------------------
// Pull Requests
// ---------------------------------------------------------------------------

export function headRepoOf(world: World, server: RemoteServer, pr: PullRequest): RemoteServer {
  return world.servers[pr.headRepo] ?? server;
}

export function prHeadSha(world: World, server: RemoteServer, pr: PullRequest): string | undefined {
  if (pr.state !== 'open') return pr.headSha;
  return headRepoOf(world, server, pr).heads[pr.head];
}

export interface Mergeability {
  mergeable: boolean;
  conflicts: string[];
  commits: string[];
  files: { path: string; before: string | null; after: string | null }[];
  upToDate: boolean;
}

export function prMergeability(world: World, server: RemoteServer, pr: PullRequest): Mergeability {
  const headServer = headRepoOf(world, server, pr);
  const headSha = prHeadSha(world, server, pr);
  const baseSha = pr.state === 'merged' && pr.mergedSha ? server.objects.commits[pr.mergedSha]?.parents[0] : server.heads[pr.base];
  if (!headSha || !baseSha) return { mergeable: false, conflicts: [], commits: [], files: [], upToDate: false };
  if (headServer !== server) copyObjects(headServer.objects, server.objects, [headSha]);
  const base = mergeBase(server.objects, baseSha, headSha);
  const baseAnc = ancestors(server.objects, baseSha);
  const commits = [...ancestors(server.objects, headSha)].filter((s) => !baseAnc.has(s));
  commits.sort((a, b) => server.objects.commits[a].timestamp - server.objects.commits[b].timestamp);
  const baseTree = base ? server.objects.commits[base].tree : {};
  const entries = mergeTrees(
    treeContents(server.objects, baseTree),
    treeContents(server.objects, server.objects.commits[baseSha].tree),
    treeContents(server.objects, server.objects.commits[headSha].tree),
    pr.base,
    pr.head,
  );
  const conflicts = entries.filter((e) => e.conflict).map((e) => e.path);
  const headFiles = treeContents(server.objects, server.objects.commits[headSha].tree);
  const baseFiles = treeContents(server.objects, baseTree);
  const files = [...new Set([...Object.keys(headFiles), ...Object.keys(baseFiles)])]
    .filter((p) => headFiles[p] !== baseFiles[p])
    .sort()
    .map((p) => ({ path: p, before: baseFiles[p] ?? null, after: headFiles[p] ?? null }));
  return { mergeable: conflicts.length === 0 && commits.length > 0, conflicts, commits, files, upToDate: isAncestor(server.objects, baseSha, headSha) };
}

export function openPullRequest(
  world: World,
  server: RemoteServer,
  opts: { title: string; body?: string; head: string; base?: string; author: string; headRepo?: string },
): PullRequest | { error: string } {
  const base = opts.base ?? server.defaultBranch;
  const headRepoUrl = opts.headRepo ? canonicalUrl(opts.headRepo) : server.url;
  const headServer = world.servers[headRepoUrl] ?? server;
  if (!headServer.heads[opts.head]) return { error: `La rama "${opts.head}" no existe en ${headServer.owner}/${headServer.name}. ¿Hiciste git push?` };
  if (!server.heads[base]) return { error: `La rama base "${base}" no existe.` };
  if (headServer === server && opts.head === base) return { error: 'La rama head y la base son la misma.' };
  if (server.pulls.some((p) => p.state === 'open' && p.head === opts.head && p.base === base && p.headRepo === headRepoUrl)) {
    return { error: `Ya existe un Pull Request abierto para ${opts.head} → ${base}.` };
  }
  if (!opts.title.trim()) return { error: 'El título es obligatorio.' };
  const pr: PullRequest = {
    number: server.nextNumber++,
    title: opts.title.trim(),
    body: opts.body ?? '',
    author: opts.author,
    headRepo: headRepoUrl,
    head: opts.head,
    base,
    state: 'open',
    reviews: [],
    comments: [],
    timestamp: now(world),
  };
  const m = prMergeability(world, server, pr);
  if (!m.commits.length) {
    server.nextNumber--;
    return { error: `No hay nada que comparar: ${opts.head} no tiene commits nuevos respecto a ${base}.` };
  }
  server.pulls.unshift(pr);
  const sha = prHeadSha(world, server, pr);
  if (sha) runWorkflows(world, server, opts.head, sha, 'pull_request');
  return pr;
}

export function reviewPullRequest(
  world: World,
  server: RemoteServer,
  number: number,
  review: { author: string; state: 'approved' | 'changes_requested' | 'commented'; body: string },
): string | null {
  const pr = server.pulls.find((p) => p.number === number);
  if (!pr) return 'Pull Request no encontrado';
  if (pr.state !== 'open') return 'El Pull Request no está abierto';
  if (review.author === pr.author && review.state !== 'commented') return 'GitHub no permite aprobar o pedir cambios en tu propio Pull Request.';
  const sha = prHeadSha(world, server, pr) ?? '';
  pr.reviews.push({ id: pr.reviews.length + 1, author: review.author, state: review.state, body: review.body, timestamp: now(world), commit: sha });
  return null;
}

/** Estado efectivo de revisiones: la última revisión de cada revisor, ignorando aprobaciones desactualizadas. */
export function reviewSummary(world: World, server: RemoteServer, pr: PullRequest) {
  const latest = new Map<string, PullRequest['reviews'][number]>();
  for (const r of pr.reviews) if (r.state !== 'commented') latest.set(r.author, r);
  const head = prHeadSha(world, server, pr);
  const approvals = [...latest.values()].filter((r) => r.state === 'approved' && r.commit === head);
  const stale = [...latest.values()].filter((r) => r.state === 'approved' && r.commit !== head);
  const changesRequested = [...latest.values()].filter((r) => r.state === 'changes_requested');
  return { approvals, stale, changesRequested };
}

export function mergeBlockers(world: World, server: RemoteServer, pr: PullRequest): string[] {
  const blockers: string[] = [];
  if (pr.state !== 'open') return ['El Pull Request no está abierto'];
  const m = prMergeability(world, server, pr);
  if (m.conflicts.length) blockers.push(`Conflictos con ${pr.base}: ${m.conflicts.join(', ')}. Resuélvelos localmente (merge de ${pr.base} en tu rama) y vuelve a hacer push.`);
  if (!m.commits.length) blockers.push('No hay commits nuevos que fusionar.');
  const prot = protectionFor(server, pr.base);
  const rs = reviewSummary(world, server, pr);
  if (rs.changesRequested.length) blockers.push(`${rs.changesRequested.map((r) => r.author).join(', ')} solicitó cambios.`);
  if (prot && prot.requiredApprovals > rs.approvals.length) {
    blockers.push(`La rama ${pr.base} está protegida: requiere ${prot.requiredApprovals} aprobación(es) (tiene ${rs.approvals.length}${rs.stale.length ? `, ${rs.stale.length} desactualizada(s) por commits nuevos` : ''}).`);
  }
  const failing = server.runs.find((r) => r.sha === prHeadSha(world, server, pr) && r.status === 'failure');
  if (failing && prot) blockers.push(`El check "${failing.workflow}" falló.`);
  return blockers;
}

export function mergePullRequest(
  world: World,
  server: RemoteServer,
  number: number,
  opts: { by: string; method: 'merge' | 'squash' },
): { sha: string } | { error: string } {
  const pr = server.pulls.find((p) => p.number === number);
  if (!pr) return { error: 'Pull Request no encontrado' };
  const blockers = mergeBlockers(world, server, pr);
  if (blockers.length) return { error: blockers.join('\n') };
  const headSha = prHeadSha(world, server, pr)!;
  const baseSha = server.heads[pr.base];
  const base = mergeBase(server.objects, baseSha, headSha);
  const entries = mergeTrees(
    treeContents(server.objects, base ? server.objects.commits[base].tree : {}),
    treeContents(server.objects, server.objects.commits[baseSha].tree),
    treeContents(server.objects, server.objects.commits[headSha].tree),
    pr.base,
    pr.head,
  );
  const tree: Tree = {};
  for (const e of entries) if (e.content !== null) tree[e.path] = storeBlob(server.objects, e.content);
  const headOwner = headRepoOf(world, server, pr).owner;
  const message =
    opts.method === 'squash'
      ? `${pr.title} (#${pr.number})\n\n${prMergeability(world, server, pr).commits.map((s) => '* ' + firstLine(server.objects.commits[s].message)).join('\n')}`
      : `Merge pull request #${pr.number} from ${headOwner}/${pr.head}\n\n${pr.title}`;
  const commit = createCommit(world, server.objects, {
    tree,
    parents: opts.method === 'squash' ? [baseSha] : [baseSha, headSha],
    message,
    author: personFor(opts.by),
  });
  server.heads[pr.base] = commit.sha;
  pr.state = 'merged';
  pr.mergedSha = commit.sha;
  pr.mergedBy = opts.by;
  pr.mergeMethod = opts.method;
  pr.headSha = headSha;
  // "Closes #n" / "Fixes #n" cierran issues automáticamente.
  for (const m of `${pr.title}\n${pr.body}`.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi)) {
    const issue = server.issues.find((i) => i.number === parseInt(m[1], 10));
    if (issue && issue.state === 'open') {
      issue.state = 'closed';
      issue.closedBy = `#${pr.number}`;
    }
  }
  runWorkflows(world, server, pr.base, commit.sha, 'push');
  return { sha: commit.sha };
}

export function closePullRequest(world: World, server: RemoteServer, number: number): void {
  const pr = server.pulls.find((p) => p.number === number);
  if (!pr || pr.state !== 'open') return;
  pr.headSha = prHeadSha(world, server, pr);
  pr.state = 'closed';
}

export function commentOn(world: World, server: RemoteServer, number: number, author: string, body: string): void {
  const item = server.pulls.find((p) => p.number === number) ?? server.issues.find((i) => i.number === number);
  if (!item || !body.trim()) return;
  item.comments.push({ id: item.comments.length + 1, author, body: body.trim(), timestamp: now(world) });
}

// ---------------------------------------------------------------------------
// Issues, forks, releases, colaboradores
// ---------------------------------------------------------------------------

export function createIssue(world: World, server: RemoteServer, opts: { title: string; body?: string; author: string; labels?: string[] }) {
  const issue = {
    number: server.nextNumber++,
    title: opts.title.trim(),
    body: opts.body ?? '',
    author: opts.author,
    state: 'open' as const,
    labels: opts.labels ?? [],
    comments: [],
    timestamp: now(world),
  };
  server.issues.unshift(issue);
  return issue;
}

export function forkRepository(world: World, server: RemoteServer, user: string): RemoteServer | { error: string } {
  if (server.owner === user) return { error: 'No puedes hacer fork de tu propio repositorio.' };
  const url = repoUrl(user, server.name);
  if (world.servers[url]) return { error: `Ya tienes un repositorio llamado ${user}/${server.name}.` };
  const fork: RemoteServer = {
    ...structuredClone(server),
    url,
    owner: user,
    issues: [],
    pulls: [],
    nextNumber: 1,
    protectedBranches: {},
    collaborators: [{ username: user, role: 'admin', status: 'active' }],
    stars: 0,
    starredByMe: false,
    watching: true,
    forks: 0,
    forkOf: server.url,
    releases: [],
    runs: [],
  };
  world.servers[url] = fork;
  server.forks++;
  return fork;
}

export function createRelease(
  world: World,
  server: RemoteServer,
  opts: { tag: string; title: string; notes: string; target: string; author: string; prerelease?: boolean },
): string | null {
  if (!/^[\w.\-/]+$/.test(opts.tag)) return 'Nombre de etiqueta no válido';
  if (server.releases.some((r) => r.tag === opts.tag)) return 'Ya existe una release con esa etiqueta';
  let target = server.tags[opts.tag]?.target;
  if (!target) {
    target = server.heads[opts.target] ?? (server.objects.commits[opts.target] ? opts.target : undefined);
    if (!target) return `La rama o commit "${opts.target}" no existe`;
    server.tags[opts.tag] = { name: opts.tag, target, annotated: false };
  }
  server.releases.unshift({ tag: opts.tag, title: opts.title || opts.tag, notes: opts.notes, target, author: opts.author, timestamp: now(world), prerelease: !!opts.prerelease });
  return null;
}

export function inviteCollaborator(server: RemoteServer, username: string, role: 'read' | 'write' | 'admin'): string | null {
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(username)) return 'Nombre de usuario no válido';
  if (server.collaborators.some((c) => c.username === username)) return 'Ese usuario ya es colaborador';
  server.collaborators.push({ username, role, status: 'invited' });
  return null;
}
