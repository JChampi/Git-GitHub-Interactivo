/**
 * Interfaz simulada de GitHub sobre los servidores del laboratorio.
 * Todas las acciones modifican el estado del servidor simulado; nada sale
 * del navegador.
 */
import { BookOpen, CircleDot, Copy, Eye, FileText, Folder, GitBranch, GitFork, GitPullRequest, Kanban, Lock, Package, Plus, Settings, Star, Terminal as TermIcon, Workflow } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Github } from '../icons';
import { firstLine, ancestors, short } from '../../engine/repo';
import { createServerRepo, forkRepository, GITIGNORE_TEMPLATES, webUrl } from '../../engine/server';
import type { RemoteServer } from '../../engine/types';
import { renderMarkdown } from '../../lib/markdown';
import { useLab, useLabs } from '../../store/labs';
import { Badge, Button, Tabs, cx } from '../ui';
import { Issues } from './Issues';
import { PullRequests } from './PullRequests';
import { RepoSettings } from './RepoSettings';
import { Actions, ProjectBoard, Releases } from './Misc';
import { Avatar, Input, Select, SimNote, TextArea, timeAgo, useAct } from './shared';

type Tab = 'code' | 'issues' | 'pulls' | 'actions' | 'projects' | 'releases' | 'settings';

export function GitHubSim({ labId, initialUrl }: { labId: string; initialUrl?: string }) {
  const lab = useLab(labId);
  const world = lab.world;
  const servers = Object.values(world.servers);
  const [url, setUrl] = useState<string | null>(initialUrl ?? null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<Tab>('code');
  const server = (url && world.servers[url]) || (!creating ? servers.find((s) => s.owner === world.githubUser) ?? servers[0] : undefined);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bg-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-bg-2 px-3 py-2">
        <Github size={20} />
        <span className="text-sm font-semibold">GitHub</span>
        <Badge tone="purple">simulación educativa</Badge>
        <Select aria-label="Repositorio" value={server?.url ?? ''} onChange={(e) => { setUrl(e.target.value); setCreating(false); setTab('code'); }} className="ml-auto max-w-[240px] py-1 text-xs">
          {!servers.length && <option value="">(sin repositorios)</option>}
          {servers.map((s) => (
            <option key={s.url} value={s.url}>
              {s.owner}/{s.name}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="success" icon={<Plus size={13} />} onClick={() => setCreating(true)}>
          Nuevo
        </Button>
        <span className="flex items-center gap-1 text-xs text-fg-2">
          <Avatar user={world.githubUser} /> {world.githubUser}
        </span>
      </div>
      {creating || !server ? (
        <NewRepo
          labId={labId}
          onCreated={(u) => {
            setUrl(u);
            setCreating(false);
            setTab('code');
          }}
          onCancel={servers.length ? () => setCreating(false) : undefined}
        />
      ) : (
        <RepoView labId={labId} server={server} tab={tab} setTab={setTab} onOpen={(u) => { setUrl(u); setTab('code'); }} />
      )}
    </div>
  );
}

function NewRepo({ labId, onCreated, onCancel }: { labId: string; onCreated: (url: string) => void; onCancel?: () => void }) {
  const lab = useLab(labId);
  const mutate = useLabs((s) => s.mutate);
  const me = lab.world.githubUser;
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [vis, setVis] = useState<'public' | 'private'>('public');
  const [readme, setReadme] = useState(false);
  const [gitignore, setGitignore] = useState('');
  const [license, setLicense] = useState('');
  const exists = !!lab.world.servers[`https://github.com/${me}/${name}.git`];
  const valid = /^[\w.-]+$/.test(name) && !exists;

  const create = () => {
    const url = `https://github.com/${me}/${name}.git`;
    mutate(labId, (w) => {
      createServerRepo(w, { owner: me, name, description: desc, visibility: vis, readme, gitignore: gitignore || undefined, license: license || undefined });
    }, { kind: 'notice', text: `[GitHub] Repositorio creado: ${url}${readme || gitignore || license ? ' (con un commit inicial: si tu repo local ya tiene historia, tendrás que integrar con git pull --allow-unrelated-histories o crear el remoto vacío)' : ' (vacío). Conéctalo con: git remote add origin ' + url}`, tone: 'success' });
    onCreated(url);
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 p-5">
      <div>
        <h3 className="text-lg font-semibold">Crear un nuevo repositorio</h3>
        <p className="text-xs text-muted">Un repositorio contiene todos los archivos del proyecto y su historial de revisiones.</p>
      </div>
      <SimNote>En GitHub real necesitas una cuenta (github.com/signup). Aquí tu cuenta "{me}" es simulada y el repositorio solo existe en tu navegador.</SimNote>
      <div className="grid grid-cols-[auto_1fr] items-center gap-2 text-sm">
        <span className="text-fg-2">{me} /</span>
        <Input value={name} onChange={(e) => setName(e.target.value.replace(/\s/g, '-'))} placeholder="nombre-del-repositorio" aria-label="Nombre del repositorio" />
      </div>
      {name && !valid && <p className="text-xs text-gred">{exists ? 'Ya tienes un repositorio con ese nombre.' : 'Solo letras, números, guiones, puntos y guiones bajos.'}</p>}
      <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descripción (opcional)" aria-label="Descripción" />
      <fieldset className="space-y-2">
        {(['public', 'private'] as const).map((v) => (
          <label key={v} className={cx('flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm', vis === v ? 'border-gblue bg-gblue/5' : 'border-line')}>
            <input type="radio" checked={vis === v} onChange={() => setVis(v)} className="mt-1" />
            <span>
              <span className="flex items-center gap-1 font-medium">{v === 'public' ? <BookOpen size={14} /> : <Lock size={14} />} {v === 'public' ? 'Público' : 'Privado'}</span>
              <span className="text-xs text-muted">{v === 'public' ? 'Cualquiera en internet puede verlo. Tú eliges quién puede hacer commits.' : 'Solo tú y las personas que invites pueden verlo.'}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="space-y-2 rounded-md border border-line p-3 text-sm">
        <p className="font-medium">Inicializar el repositorio con:</p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={readme} onChange={(e) => setReadme(e.target.checked)} /> Añadir un README
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-fg-2">.gitignore:</span>
          <Select value={gitignore} onChange={(e) => setGitignore(e.target.value)} aria-label="Plantilla .gitignore">
            <option value="">Ninguno</option>
            {Object.keys(GITIGNORE_TEMPLATES).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          <span className="text-fg-2">Licencia:</span>
          <Select value={license} onChange={(e) => setLicense(e.target.value)} aria-label="Licencia">
            <option value="">Ninguna</option>
            <option>MIT</option>
            <option>Apache-2.0</option>
            <option>GPL-3.0</option>
          </Select>
        </div>
        <p className="text-xs text-muted">Consejo: si ya tienes un repositorio local con commits, crea el remoto VACÍO (sin README) para poder hacer git push directamente.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="success" disabled={!valid} onClick={create}>
          Crear repositorio
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}

function RepoView({ labId, server, tab, setTab, onOpen }: { labId: string; server: RemoteServer; tab: Tab; setTab: (t: Tab) => void; onOpen: (url: string) => void }) {
  const lab = useLab(labId);
  const world = lab.world;
  const me = world.githubUser;
  const act = useAct(labId, server.url);
  const mutate = useLabs((s) => s.mutate);
  const isOwner = server.owner === me;
  const canWrite = isOwner || server.collaborators.some((c) => c.username === me && c.role !== 'read' && c.status === 'active');
  const openPRs = server.pulls.filter((p) => p.state === 'open').length;
  const openIssues = server.issues.filter((i) => i.state === 'open').length;

  const tabs = [
    { id: 'code' as const, label: 'Código', icon: <FileText size={13} /> },
    { id: 'issues' as const, label: 'Issues', icon: <CircleDot size={13} />, badge: openIssues ? <Badge>{openIssues}</Badge> : undefined },
    { id: 'pulls' as const, label: 'Pull requests', icon: <GitPullRequest size={13} />, badge: openPRs ? <Badge>{openPRs}</Badge> : undefined },
    { id: 'actions' as const, label: 'Actions', icon: <Workflow size={13} /> },
    { id: 'projects' as const, label: 'Projects', icon: <Kanban size={13} /> },
    { id: 'releases' as const, label: 'Releases', icon: <Package size={13} /> },
    ...(isOwner ? [{ id: 'settings' as const, label: 'Configuración', icon: <Settings size={13} /> }] : []),
  ];

  const fork = () => {
    let created: string | null = null;
    mutate(labId, (w) => {
      const r = forkRepository(w, w.servers[server.url], me);
      if (!('error' in r)) created = r.url;
    }, { kind: 'notice', text: `[GitHub] Fork creado: https://github.com/${me}/${server.name}.git (copia completa en tu cuenta). Clónalo con git clone.`, tone: 'success' });
    setTimeout(() => created && onOpen(created), 0);
  };
  const myFork = world.servers[`https://github.com/${me}/${server.name}.git`];

  return (
    <div>
      <div className="border-b border-line bg-bg-1 px-4 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          {server.visibility === 'private' ? <Lock size={16} className="text-muted" /> : <BookOpen size={16} className="text-muted" />}
          <span className="text-base">
            <span className="text-gblue">{server.owner}</span> / <b className="text-gblue">{server.name}</b>
          </span>
          <Badge>{server.visibility === 'public' ? 'Public' : 'Private'}</Badge>
          {server.forkOf && (
            <button className="text-[11px] text-muted hover:text-gblue cursor-pointer" onClick={() => onOpen(server.forkOf!)}>
              forked from {server.forkOf.replace('https://github.com/', '').replace('.git', '')}
            </button>
          )}
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Button size="sm" icon={<Eye size={13} />} onClick={() => act((_, s) => { s.watching = !s.watching; })}>
              {server.watching ? 'Unwatch' : 'Watch'}
            </Button>
            <Button size="sm" icon={<GitFork size={13} />} disabled={isOwner || !!myFork} onClick={fork} title={isOwner ? 'No puedes hacer fork de tu propio repositorio' : myFork ? 'Ya tienes un fork' : 'Crear una copia en tu cuenta'}>
              Fork <span className="text-muted">{server.forks}</span>
            </Button>
            <Button size="sm" icon={<Star size={13} className={server.starredByMe ? 'fill-gyellow text-gyellow' : ''} />} onClick={() => act((_, s) => { s.starredByMe = !s.starredByMe; s.stars += s.starredByMe ? 1 : -1; })}>
              {server.starredByMe ? 'Starred' : 'Star'} <span className="text-muted">{server.stars}</span>
            </Button>
          </div>
        </div>
        {server.description && <p className="mt-1 text-xs text-fg-2">{server.description}</p>}
        {!!server.topics.length && (
          <div className="mt-1 flex flex-wrap gap-1">
            {server.topics.map((t) => (
              <Badge key={t} tone="blue">
                {t}
              </Badge>
            ))}
          </div>
        )}
        <Tabs tabs={tabs} value={tab} onChange={setTab} className="mt-2 border-b-0" />
      </div>
      <div className="p-4">
        {tab === 'code' && <CodeTab labId={labId} server={server} canWrite={canWrite} onPR={() => setTab('pulls')} />}
        {tab === 'issues' && <Issues ctx={{ labId, world, server, me, act }} />}
        {tab === 'pulls' && <PullRequests ctx={{ labId, world, server, me, act }} />}
        {tab === 'actions' && <Actions ctx={{ labId, world, server, me, act }} />}
        {tab === 'projects' && <ProjectBoard ctx={{ labId, world, server, me, act }} />}
        {tab === 'releases' && <Releases ctx={{ labId, world, server, me, act }} />}
        {tab === 'settings' && isOwner && <RepoSettings ctx={{ labId, world, server, me, act }} />}
      </div>
    </div>
  );
}

function CodeTab({ labId, server, canWrite, onPR }: { labId: string; server: RemoteServer; canWrite: boolean; onPR: () => void }) {
  const setPending = useLabs((s) => s.setPendingInput);
  const [branch, setBranch] = useState(server.defaultBranch);
  const [dir, setDir] = useState('');
  const [file, setFile] = useState<string | null>(null);
  const b = server.heads[branch] ? branch : server.defaultBranch;
  const sha = server.heads[b];
  const tree = sha ? server.objects.commits[sha].tree : {};
  const commitCount = sha ? ancestors(server.objects, sha).size : 0;
  const entries = useMemo(() => {
    const prefix = dir ? dir + '/' : '';
    const m = new Map<string, 'file' | 'dir'>();
    for (const p of Object.keys(tree)) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      const [head, ...more] = rest.split('/');
      m.set(head, more.length ? 'dir' : 'file');
    }
    return [...m.entries()].sort((x, y) => (x[1] === y[1] ? x[0].localeCompare(y[0]) : x[1] === 'dir' ? -1 : 1));
  }, [tree, dir]);
  const readme = tree[(dir ? dir + '/' : '') + 'README.md'];
  const recentBranch = Object.keys(server.heads).find((x) => x !== server.defaultBranch && !server.pulls.some((p) => p.head === x && p.headRepo === server.url));

  if (!sha) {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-semibold">Configuración rápida — si ya hiciste esto antes</p>
        <CloneBox url={server.url} />
        <p className="text-fg-2">…o publica un repositorio existente desde la terminal:</p>
        <pre className="rounded-md border border-line bg-bg-1 p-3 font-mono text-xs leading-6">
          git remote add origin {server.url}
          {'\n'}git branch -M main
          {'\n'}git push -u origin main
        </pre>
        <Button size="sm" icon={<TermIcon size={13} />} onClick={() => setPending(labId, `git remote add origin ${server.url}`)}>
          Escribir en la terminal
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recentBranch && canWrite && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-gyellow/40 bg-gyellow/8 px-3 py-2 text-sm">
          <GitBranch size={14} className="text-gyellow" /> <b className="font-mono">{recentBranch}</b> tuvo cambios recientes
          <Button size="sm" variant="success" className="ml-auto" onClick={onPR}>
            Compare &amp; pull request
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={b} onChange={(e) => { setBranch(e.target.value); setDir(''); setFile(null); }} aria-label="Rama" className="py-1 text-xs">
          {Object.keys(server.heads).map((h) => (
            <option key={h}>{h}</option>
          ))}
        </Select>
        <span className="text-xs text-muted">
          <GitBranch size={12} className="inline" /> {Object.keys(server.heads).length} ramas · {Object.keys(server.tags).length} etiquetas · {commitCount} commits
        </span>
        <div className="ml-auto">
          <CloneBox url={server.url} onSend={() => setPending(labId, `git clone ${server.url}`)} />
        </div>
      </div>
      <div className="overflow-hidden rounded-md border border-line">
        <div className="flex items-center gap-2 bg-bg-3 px-3 py-2 text-xs">
          <span className="font-semibold">{server.objects.commits[sha].author.name}</span>
          <span className="truncate text-fg-2">{firstLine(server.objects.commits[sha].message)}</span>
          <span className="ml-auto shrink-0 font-mono text-muted">{short(sha)} · {timeAgo(server.objects.commits[sha].timestamp)}</span>
        </div>
        {dir && (
          <button className="flex w-full items-center gap-2 border-t border-line px-3 py-1.5 text-left text-sm hover:bg-bg-2 cursor-pointer" onClick={() => setDir(dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '')}>
            <Folder size={14} className="text-gblue" /> ..
          </button>
        )}
        {entries.map(([name, type]) => (
          <button
            key={name}
            className="flex w-full items-center gap-2 border-t border-line px-3 py-1.5 text-left text-sm hover:bg-bg-2 cursor-pointer"
            onClick={() => (type === 'dir' ? (setDir(dir ? `${dir}/${name}` : name), setFile(null)) : setFile((dir ? dir + '/' : '') + name))}
          >
            {type === 'dir' ? <Folder size={14} className="text-gblue" /> : <FileText size={14} className="text-muted" />} {name}
          </button>
        ))}
      </div>
      {file && tree[file] && (
        <div className="overflow-hidden rounded-md border border-line">
          <p className="border-b border-line bg-bg-3 px-3 py-1.5 font-mono text-xs">{file}</p>
          <pre className="max-h-72 overflow-auto p-3 font-mono text-xs">{server.objects.blobs[tree[file]]}</pre>
        </div>
      )}
      {readme && !file && (
        <div className="rounded-md border border-line">
          <p className="border-b border-line px-3 py-1.5 text-xs font-semibold">README.md</p>
          <div className="md p-4 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(server.objects.blobs[readme]) }} />
        </div>
      )}
      {!readme && !file && <p className="text-xs text-muted">Añade un README.md para explicar de qué trata tu proyecto: GitHub lo muestra aquí automáticamente.</p>}
      <p className="text-[11px] text-muted">URL web simulada: {webUrl(server)}</p>
    </div>
  );
}

function CloneBox({ url, onSend }: { url: string; onSend?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-1 rounded-md border border-line bg-bg-1 px-2 py-1">
      <span className="text-[11px] font-semibold text-ggreen">HTTPS</span>
      <code className="max-w-[260px] truncate font-mono text-[11px]">{url}</code>
      <button
        aria-label="Copiar URL"
        className="rounded p-0.5 text-muted hover:text-fg cursor-pointer"
        onClick={() => {
          navigator.clipboard?.writeText(url).catch(() => undefined);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        <Copy size={12} />
      </button>
      {copied && <span className="text-[10px] text-ggreen">copiado</span>}
      {onSend && (
        <button className="rounded p-0.5 text-muted hover:text-fg cursor-pointer" title="Escribir git clone en la terminal" aria-label="Escribir git clone en la terminal" onClick={onSend}>
          <TermIcon size={12} />
        </button>
      )}
    </div>
  );
}

export { TextArea };
