import { CircleDot, GitMerge, GitPullRequest, GitPullRequestClosed } from 'lucide-react';
import type { PullRequest, RemoteServer, World } from '../../engine/types';
import { useLabs } from '../../store/labs';
import { cx } from '../ui';

export interface GhCtx {
  labId: string;
  world: World;
  server: RemoteServer;
  me: string;
  /** Aplica un cambio al mundo (copia) y opcionalmente deja un aviso en la terminal. */
  act: (fn: (w: World, s: RemoteServer) => void, notice?: string) => void;
}

export function useAct(labId: string, url: string) {
  const mutate = useLabs((s) => s.mutate);
  return (fn: (w: World, s: RemoteServer) => void, notice?: string) =>
    mutate(labId, (w) => {
      const s = w.servers[url];
      if (s) fn(w, s);
    }, notice ? { kind: 'notice', text: `[GitHub] ${notice}`, tone: 'info' } : undefined);
}

export function Avatar({ user, size = 20 }: { user: string; size?: number }) {
  const colors = ['#f0883e', '#58a6ff', '#3fb950', '#bc8cff', '#ff7b72', '#39c5cf', '#d29922'];
  let h = 0;
  for (const ch of user) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.45, background: colors[h % colors.length] }} aria-hidden>
      {user.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function PRIcon({ pr, size = 15 }: { pr: PullRequest; size?: number }) {
  if (pr.state === 'merged') return <GitMerge size={size} className="text-gpurple" />;
  if (pr.state === 'closed') return <GitPullRequestClosed size={size} className="text-gred" />;
  return <GitPullRequest size={size} className="text-ggreen" />;
}

export function IssueIcon({ open, size = 15 }: { open: boolean; size?: number }) {
  return <CircleDot size={size} className={open ? 'text-ggreen' : 'text-gpurple'} />;
}

export function timeAgo(ts: number) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} días`;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('w-full rounded-md border border-line bg-bg-0 px-2.5 py-1.5 text-sm outline-none focus:border-gblue', props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx('w-full rounded-md border border-line bg-bg-0 px-2.5 py-1.5 text-sm outline-none focus:border-gblue', props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx('rounded-md border border-line bg-bg-0 px-2 py-1.5 text-sm outline-none focus:border-gblue', props.className)} />;
}

export function SimNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-gpurple/30 bg-gpurple/8 px-3 py-1.5 text-[11.5px] text-fg-2">🧪 {children}</p>;
}
