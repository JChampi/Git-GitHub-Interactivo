import { AlertTriangle, CheckCircle2, GitCommitHorizontal, GitMerge, MessageSquare, UserCheck, XCircle } from 'lucide-react';
import { useState } from 'react';
import { firstLine, short } from '../../engine/repo';
import { closePullRequest, commentOn, mergeBlockers, mergePullRequest, openPullRequest, prMergeability, protectionFor, reviewPullRequest, reviewSummary } from '../../engine/server';
import type { PullRequest, RemoteServer } from '../../engine/types';
import { TEAM } from '../../engine/world';
import { renderMarkdown } from '../../lib/markdown';
import { FileChangeList } from '../DiffView';
import { Badge, Button, Tabs, cx } from '../ui';
import { Avatar, type GhCtx, Input, PRIcon, Select, SimNote, TextArea, timeAgo } from './shared';

export function PullRequests({ ctx }: { ctx: GhCtx }) {
  const [view, setView] = useState<'list' | 'new' | number>('list');
  const [filter, setFilter] = useState<'open' | 'closed'>('open');
  const { server } = ctx;
  if (view === 'new') return <NewPR ctx={ctx} onDone={(n) => setView(n ?? 'list')} />;
  if (typeof view === 'number') {
    const pr = server.pulls.find((p) => p.number === view);
    if (pr) return <PRDetail ctx={ctx} pr={pr} onBack={() => setView('list')} />;
  }
  const list = server.pulls.filter((p) => (filter === 'open' ? p.state === 'open' : p.state !== 'open'));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-line text-xs">
          {(['open', 'closed'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cx('px-3 py-1 cursor-pointer', filter === f ? 'bg-bg-4 font-semibold' : 'hover:bg-bg-3')}>
              {f === 'open' ? `${server.pulls.filter((p) => p.state === 'open').length} abiertos` : `${server.pulls.filter((p) => p.state !== 'open').length} cerrados`}
            </button>
          ))}
        </div>
        <Button size="sm" variant="success" className="ml-auto" onClick={() => setView('new')}>
          Nuevo pull request
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border border-line">
        {list.map((p) => (
          <button key={p.number} onClick={() => setView(p.number)} className="flex w-full items-start gap-2 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-bg-2 cursor-pointer">
            <PRIcon pr={p} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{p.title}</span>
              <span className="text-[11px] text-muted">
                #{p.number} · {p.author} · {timeAgo(p.timestamp)} · <span className="font-mono">{p.head}</span> → <span className="font-mono">{p.base}</span>
              </span>
            </span>
            <span className="ml-auto shrink-0">{p.reviews.some((r) => r.state === 'approved') && <Badge tone="green">aprobado</Badge>}{p.reviews.some((r) => r.state === 'changes_requested') && <Badge tone="red">cambios solicitados</Badge>}</span>
          </button>
        ))}
        {!list.length && <p className="p-6 text-center text-sm text-muted">{filter === 'open' ? 'No hay pull requests abiertos.' : 'No hay pull requests cerrados.'}</p>}
      </div>
      <SimNote>Un Pull Request propone fusionar una rama en otra. Permite revisar el código, comentar, ejecutar checks y aprobar antes de integrar.</SimNote>
    </div>
  );
}

function NewPR({ ctx, onDone }: { ctx: GhCtx; onDone: (n?: number) => void }) {
  const { world, server, me, act } = ctx;
  // Ramas head: del propio repo y de sus forks.
  const sources = [server, ...Object.values(world.servers).filter((s) => s.forkOf === server.url)];
  const options = sources.flatMap((s) => Object.keys(s.heads).map((h) => ({ repo: s.url, head: h, label: s === server ? h : `${s.owner}:${h}` })));
  const first = options.find((o) => !(o.repo === server.url && o.head === server.defaultBranch));
  const [base, setBase] = useState(server.defaultBranch);
  const [src, setSrc] = useState(first ? `${first.repo}|${first.head}` : '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [srcRepo, head] = src.split('|');
  const headServer: RemoteServer | undefined = world.servers[srcRepo];
  const preview = headServer && head ? prMergeability(world, server, { number: 0, title: '', body: '', author: me, headRepo: srcRepo, head, base, state: 'open', reviews: [], comments: [], timestamp: 0 }) : null;

  const create = () => {
    let created: number | undefined;
    let err: string | null = null;
    act((w, s) => {
      const r = openPullRequest(w, s, { title: title || (preview?.commits[0] ? firstLine(headServer!.objects.commits[preview.commits[preview.commits.length - 1]]?.message ?? head) : head), body, head, base, author: me, headRepo: srcRepo });
      if ('error' in r) err = r.error;
      else created = r.number;
    }, undefined);
    if (err) setError(err);
    else onDone(created);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold">Abrir un pull request</h3>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-bg-1 p-2 text-sm">
        <span className="text-muted">base:</span>
        <Select value={base} onChange={(e) => setBase(e.target.value)} aria-label="Rama base">
          {Object.keys(server.heads).map((h) => (
            <option key={h}>{h}</option>
          ))}
        </Select>
        <span>←</span>
        <span className="text-muted">compare:</span>
        <Select value={src} onChange={(e) => setSrc(e.target.value)} aria-label="Rama a comparar">
          {options.map((o) => (
            <option key={o.repo + o.head} value={`${o.repo}|${o.head}`}>
              {o.label}
            </option>
          ))}
        </Select>
        {preview && (preview.conflicts.length ? <Badge tone="red">✗ conflictos: {preview.conflicts.join(', ')}</Badge> : preview.commits.length ? <Badge tone="green">✓ se puede fusionar</Badge> : <Badge>nada que comparar</Badge>)}
      </div>
      {!options.length || !first ? <p className="text-sm text-muted">Para abrir un PR necesitas otra rama publicada: git switch -c mi-rama, haz commits y git push -u origin mi-rama.</p> : null}
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (si lo dejas vacío se usa el último commit)" aria-label="Título" />
      <TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Describe los cambios. Escribe 'Closes #n' para cerrar un issue al fusionar." aria-label="Descripción" />
      {preview && preview.commits.length > 0 && (
        <div className="rounded-md border border-line">
          <p className="border-b border-line px-3 py-1.5 text-xs font-semibold">{preview.commits.length} commit(s) · {preview.files.length} archivo(s) cambiados</p>
          <FileChangeList files={preview.files} />
        </div>
      )}
      {error && <p className="text-sm text-gred">{error}</p>}
      <div className="flex gap-2">
        <Button variant="success" disabled={!src || !preview?.commits.length} onClick={create}>
          Crear pull request
        </Button>
        <Button variant="ghost" onClick={() => onDone()}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function PRDetail({ ctx, pr, onBack }: { ctx: GhCtx; pr: PullRequest; onBack: () => void }) {
  const { world, server, me, act } = ctx;
  const [tab, setTab] = useState<'conv' | 'commits' | 'files'>('conv');
  const [comment, setComment] = useState('');
  const [method, setMethod] = useState<'merge' | 'squash'>('merge');
  const [error, setError] = useState<string | null>(null);
  const m = prMergeability(world, server, pr);
  const rs = reviewSummary(world, server, pr);
  const blockers = pr.state === 'open' ? mergeBlockers(world, server, pr) : [];
  const prot = protectionFor(server, pr.base);
  const reviewers = server.collaborators.filter((c) => c.username !== pr.author && c.status === 'active').map((c) => c.username);
  const simReviewers = [...new Set([TEAM.reviewer.username, ...reviewers])].filter((u) => u !== me && u !== pr.author);
  const isAuthor = pr.author === me;
  const headOwner = world.servers[pr.headRepo]?.owner ?? server.owner;

  const merge = () => {
    let err: string | null = null;
    act((w, s) => {
      const r = mergePullRequest(w, s, pr.number, { by: me, method });
      if ('error' in r) err = r.error;
    }, `PR #${pr.number} fusionado en ${pr.base} (${method}). Tu repositorio local aún no lo tiene: git switch ${pr.base} && git pull`);
    setError(err);
  };

  const timeline = [
    ...pr.reviews.map((r) => ({ ts: r.timestamp, node: <ReviewItem key={'r' + r.id} r={r} /> })),
    ...pr.comments.map((c) => ({ ts: c.timestamp, node: <CommentItem key={'c' + c.id} author={c.author} body={c.body} ts={c.timestamp} /> })),
  ].sort((a, b) => a.ts - b.ts);

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs text-gblue hover:underline cursor-pointer">← Pull requests</button>
      <div>
        <h3 className="text-lg font-semibold">
          {pr.title} <span className="font-normal text-muted">#{pr.number}</span>
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-2">
          <Badge tone={pr.state === 'open' ? 'green' : pr.state === 'merged' ? 'purple' : 'red'}>{pr.state === 'open' ? 'Open' : pr.state === 'merged' ? 'Merged' : 'Closed'}</Badge>
          <b>{pr.author}</b> quiere fusionar {m.commits.length} commit(s) en <code className="font-mono text-gblue">{pr.base}</code> desde <code className="font-mono text-gblue">{headOwner !== server.owner ? `${headOwner}:` : ''}{pr.head}</code>
        </p>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'conv', label: 'Conversación', icon: <MessageSquare size={13} /> },
          { id: 'commits', label: `Commits (${m.commits.length})`, icon: <GitCommitHorizontal size={13} /> },
          { id: 'files', label: `Archivos (${m.files.length})` },
        ]}
      />
      {tab === 'commits' && (
        <div className="overflow-hidden rounded-md border border-line">
          {m.commits.map((s) => (
            <div key={s} className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-xs last:border-0">
              <GitCommitHorizontal size={13} className="text-muted" />
              <span className="truncate">{firstLine(server.objects.commits[s].message)}</span>
              <span className="ml-auto shrink-0 text-muted">{server.objects.commits[s].author.name}</span>
              <span className="shrink-0 font-mono text-gyellow">{short(s)}</span>
            </div>
          ))}
        </div>
      )}
      {tab === 'files' && (
        <div className="overflow-hidden rounded-md border border-line">
          <FileChangeList files={m.files} defaultOpen />
        </div>
      )}
      {tab === 'conv' && (
        <div className="space-y-3">
          <CommentItem author={pr.author} body={pr.body || '_Sin descripción._'} ts={pr.timestamp} />
          {timeline.map((t) => t.node)}
          {pr.state === 'open' && (
            <>
              <div className="rounded-md border border-line p-3 text-sm">
                <p className="mb-2 flex items-center gap-2 font-semibold">
                  <UserCheck size={15} /> Revisión
                </p>
                {isAuthor ? (
                  <p className="text-xs text-fg-2">GitHub no permite aprobar tu propio Pull Request. Pide revisión a un compañero:</p>
                ) : (
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="success" onClick={() => act((w, s) => void reviewPullRequest(w, s, pr.number, { author: me, state: 'approved', body: comment || 'Aprobado' }), `Aprobaste el PR #${pr.number}`)}>
                      Aprobar
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => act((w, s) => void reviewPullRequest(w, s, pr.number, { author: me, state: 'changes_requested', body: comment || 'Solicito cambios' }), `Solicitaste cambios en el PR #${pr.number}`)}>
                      Solicitar cambios
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {simReviewers.slice(0, 3).map((u) => (
                    <Button
                      key={u}
                      size="sm"
                      onClick={() =>
                        act((w, s) => {
                          const mm = prMergeability(w, s, s.pulls.find((x) => x.number === pr.number)!);
                          void reviewPullRequest(w, s, pr.number, mm.conflicts.length ? { author: u, state: 'changes_requested', body: `Hay conflictos con ${pr.base} en ${mm.conflicts.join(', ')}. Integra ${pr.base} en tu rama y resuélvelos, por favor.` } : { author: u, state: 'approved', body: 'He revisado los cambios: todo correcto. LGTM 👍' });
                        }, `${u} (simulado) revisó el PR #${pr.number}`)
                      }
                    >
                      <span className="flex items-center gap-1">
                        <Avatar user={u} size={16} /> Pedir revisión a {u}
                      </span>
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted">🧪 Los revisores son simulados: aprueban si no hay conflictos. En GitHub real revisan personas de tu equipo.</p>
              </div>
              <div className={cx('rounded-md border p-3', blockers.length ? 'border-gyellow/40' : 'border-ggreen/40')}>
                <div className="space-y-1.5 text-sm">
                  <Check ok={!m.conflicts.length} label={m.conflicts.length ? `Hay conflictos que deben resolverse: ${m.conflicts.join(', ')}` : 'Sin conflictos con la rama base'} />
                  <Check ok={!rs.changesRequested.length} label={rs.changesRequested.length ? `Cambios solicitados por ${rs.changesRequested.map((r) => r.author).join(', ')}` : 'Sin cambios solicitados'} />
                  {prot && <Check ok={rs.approvals.length >= prot.requiredApprovals} label={`Aprobaciones: ${rs.approvals.length}/${prot.requiredApprovals} requeridas (rama protegida)${rs.stale.length ? ` · ${rs.stale.length} desactualizada(s)` : ''}`} />}
                  {!prot && <Check ok label={`Aprobaciones: ${rs.approvals.length} (la rama ${pr.base} no exige revisiones)`} />}
                  {server.runs.filter((r) => r.sha === world.servers[pr.headRepo]?.heads[pr.head]).slice(0, 2).map((r) => (
                    <Check key={r.id} ok={r.status === 'success'} label={`Check "${r.workflow}": ${r.status === 'success' ? 'superado' : 'falló'}`} />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Select value={method} onChange={(e) => setMethod(e.target.value as 'merge' | 'squash')} aria-label="Método de fusión" className="py-1 text-xs">
                    <option value="merge">Create a merge commit</option>
                    <option value="squash">Squash and merge</option>
                  </Select>
                  <Button variant="success" icon={<GitMerge size={14} />} disabled={!!blockers.length} onClick={merge}>
                    Merge pull request
                  </Button>
                  <Button variant="ghost" onClick={() => act((w, s) => closePullRequest(w, s, pr.number), `PR #${pr.number} cerrado sin fusionar`)}>
                    Cerrar
                  </Button>
                </div>
                {error && <p className="mt-2 whitespace-pre-wrap text-xs text-gred">{error}</p>}
              </div>
            </>
          )}
          {pr.state === 'merged' && (
            <div className="flex items-center gap-2 rounded-md border border-gpurple/40 bg-gpurple/8 p-3 text-sm">
              <GitMerge size={16} className="text-gpurple" /> {pr.mergedBy} fusionó este PR ({pr.mergeMethod === 'squash' ? 'squash' : 'merge commit'} <span className="font-mono">{short(pr.mergedSha ?? '')}</span>). Recuerda sincronizar tu copia local con git pull.
            </div>
          )}
          <div className="space-y-2">
            <TextArea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Deja un comentario" aria-label="Comentario" />
            <Button size="sm" disabled={!comment.trim()} onClick={() => { act((w, s) => commentOn(w, s, pr.number, me, comment)); setComment(''); }}>
              Comentar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className="flex items-start gap-2 text-xs">
      {ok ? <CheckCircle2 size={15} className="shrink-0 text-ggreen" /> : <XCircle size={15} className="shrink-0 text-gred" />} {label}
    </p>
  );
}

function CommentItem({ author, body, ts }: { author: string; body: string; ts: number }) {
  return (
    <div className="flex gap-2">
      <Avatar user={author} size={26} />
      <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-line">
        <p className="border-b border-line bg-bg-3 px-3 py-1 text-xs">
          <b>{author}</b> <span className="text-muted">comentó {timeAgo(ts)}</span>
        </p>
        <div className="md px-3 py-2 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
      </div>
    </div>
  );
}

function ReviewItem({ r }: { r: PullRequest['reviews'][number] }) {
  return (
    <div className={cx('flex items-start gap-2 rounded-md border px-3 py-2 text-sm', r.state === 'approved' ? 'border-ggreen/40 bg-ggreen/5' : r.state === 'changes_requested' ? 'border-gred/40 bg-gred/5' : 'border-line')}>
      {r.state === 'approved' ? <CheckCircle2 size={16} className="text-ggreen" /> : r.state === 'changes_requested' ? <AlertTriangle size={16} className="text-gred" /> : <MessageSquare size={16} />}
      <div>
        <p className="text-xs">
          <b>{r.author}</b> {r.state === 'approved' ? 'aprobó estos cambios' : r.state === 'changes_requested' ? 'solicitó cambios' : 'revisó'} · <span className="text-muted">{timeAgo(r.timestamp)} · sobre {short(r.commit)}</span>
        </p>
        {r.body && <p className="mt-1 text-fg-2">{r.body}</p>}
      </div>
    </div>
  );
}
