import { useState } from 'react';
import { commentOn, createIssue } from '../../engine/server';
import { renderMarkdown } from '../../lib/markdown';
import { Badge, Button, cx } from '../ui';
import { Avatar, type GhCtx, Input, IssueIcon, SimNote, TextArea, timeAgo } from './shared';

const LABELS = ['bug', 'enhancement', 'documentation', 'good first issue', 'question'];

export function Issues({ ctx }: { ctx: GhCtx }) {
  const { server, me, act } = ctx;
  const [view, setView] = useState<'list' | 'new' | number>('list');
  const [filter, setFilter] = useState<'open' | 'closed'>('open');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [comment, setComment] = useState('');

  if (view === 'new') {
    return (
      <div className="space-y-3">
        <h3 className="text-base font-semibold">Nuevo issue</h3>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" aria-label="Título" />
        <TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Describe el problema o la propuesta (pasos para reproducir, comportamiento esperado…)" aria-label="Descripción" />
        <div className="flex flex-wrap gap-1">
          {LABELS.map((l) => (
            <button key={l} onClick={() => setLabels((ls) => (ls.includes(l) ? ls.filter((x) => x !== l) : [...ls, l]))} className={cx('rounded-full border px-2 py-0.5 text-xs cursor-pointer', labels.includes(l) ? 'border-gblue bg-gblue/15' : 'border-line')}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            variant="success"
            disabled={!title.trim()}
            onClick={() => {
              act((w, s) => void createIssue(w, s, { title, body, author: me, labels }), `Issue creado: "${title}"`);
              setTitle('');
              setBody('');
              setLabels([]);
              setView('list');
            }}
          >
            Crear issue
          </Button>
          <Button variant="ghost" onClick={() => setView('list')}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  if (typeof view === 'number') {
    const issue = server.issues.find((i) => i.number === view);
    if (!issue) return null;
    return (
      <div className="space-y-3">
        <button onClick={() => setView('list')} className="text-xs text-gblue hover:underline cursor-pointer">← Issues</button>
        <h3 className="text-lg font-semibold">
          {issue.title} <span className="font-normal text-muted">#{issue.number}</span>
        </h3>
        <p className="flex flex-wrap items-center gap-2 text-xs text-fg-2">
          <Badge tone={issue.state === 'open' ? 'green' : 'purple'}>{issue.state === 'open' ? 'Open' : 'Closed'}</Badge>
          {issue.author} abrió este issue {timeAgo(issue.timestamp)}
          {issue.closedBy && <span>· cerrado por el PR {issue.closedBy}</span>}
          {issue.labels.map((l) => (
            <Badge key={l} tone="blue">
              {l}
            </Badge>
          ))}
        </p>
        {[{ author: issue.author, body: issue.body || '_Sin descripción._', timestamp: issue.timestamp, id: 0 }, ...issue.comments].map((c) => (
          <div key={c.id} className="flex gap-2">
            <Avatar user={c.author} size={26} />
            <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-line">
              <p className="border-b border-line bg-bg-3 px-3 py-1 text-xs">
                <b>{c.author}</b> <span className="text-muted">{timeAgo(c.timestamp)}</span>
              </p>
              <div className="md px-3 py-2 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(c.body) }} />
            </div>
          </div>
        ))}
        <TextArea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Comentar" aria-label="Comentario" />
        <div className="flex gap-2">
          <Button size="sm" disabled={!comment.trim()} onClick={() => { act((w, s) => commentOn(w, s, issue.number, me, comment)); setComment(''); }}>
            Comentar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => act((_, s) => { const i = s.issues.find((x) => x.number === issue.number)!; i.state = i.state === 'open' ? 'closed' : 'open'; i.closedBy = undefined; })}>
            {issue.state === 'open' ? 'Cerrar issue' : 'Reabrir issue'}
          </Button>
        </div>
      </div>
    );
  }

  const list = server.issues.filter((i) => i.state === filter);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-line text-xs">
          {(['open', 'closed'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cx('px-3 py-1 cursor-pointer', filter === f ? 'bg-bg-4 font-semibold' : 'hover:bg-bg-3')}>
              {server.issues.filter((i) => i.state === f).length} {f === 'open' ? 'abiertos' : 'cerrados'}
            </button>
          ))}
        </div>
        <Button size="sm" variant="success" className="ml-auto" onClick={() => setView('new')}>
          Nuevo issue
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border border-line">
        {list.map((i) => (
          <button key={i.number} onClick={() => setView(i.number)} className="flex w-full items-start gap-2 border-b border-line px-3 py-2 text-left last:border-0 hover:bg-bg-2 cursor-pointer">
            <IssueIcon open={i.state === 'open'} />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1 text-sm font-semibold">
                {i.title}
                {i.labels.map((l) => (
                  <Badge key={l} tone="blue">
                    {l}
                  </Badge>
                ))}
              </span>
              <span className="text-[11px] text-muted">
                #{i.number} · {i.author} · {timeAgo(i.timestamp)} · {i.comments.length} comentarios
              </span>
            </span>
          </button>
        ))}
        {!list.length && <p className="p-6 text-center text-sm text-muted">No hay issues {filter === 'open' ? 'abiertos' : 'cerrados'}.</p>}
      </div>
      <SimNote>Los issues registran errores, tareas y propuestas. Escribir "Closes #{server.issues[0]?.number ?? 1}" en un Pull Request lo cierra automáticamente al fusionarlo.</SimNote>
    </div>
  );
}
