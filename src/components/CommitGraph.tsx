/**
 * Visualizador de commits y ramas (SVG). Calcula carriles (lanes) a partir
 * del grafo real del repositorio y dibuja nodos, conexiones y punteros.
 */
import { GitBranch, Tag } from 'lucide-react';
import { useMemo } from 'react';
import { firstLine, logOrder, short } from '../engine/repo';
import type { Commit, ObjectStore, Repository, RemoteServer } from '../engine/types';
import { cx } from './ui';

export interface RefLabel {
  name: string;
  sha: string;
  kind: 'branch' | 'remote' | 'tag' | 'head';
  current?: boolean;
}

const LANE_COLORS = ['#f0883e', '#58a6ff', '#3fb950', '#bc8cff', '#ff7b72', '#39c5cf', '#d29922', '#f778ba'];
const ROW = 34;
const LANE = 18;
const PAD = 14;

interface Layout {
  commits: Commit[];
  pos: Map<string, { row: number; lane: number }>;
  lanes: number;
}

export function layoutGraph(objects: ObjectStore, tips: string[]): Layout {
  const commits = logOrder(objects, [...new Set(tips)]);
  const pos = new Map<string, { row: number; lane: number }>();
  const lanes: (string | null)[] = [];
  let maxLanes = 1;
  commits.forEach((c, row) => {
    let lane = lanes.indexOf(c.sha);
    if (lane === -1) {
      lane = lanes.indexOf(null);
      if (lane === -1) lane = lanes.push(c.sha) - 1;
      else lanes[lane] = c.sha;
    }
    for (let k = 0; k < lanes.length; k++) if (k !== lane && lanes[k] === c.sha) lanes[k] = null;
    pos.set(c.sha, { row, lane });
    const [p0, ...rest] = c.parents.filter((p) => objects.commits[p]);
    lanes[lane] = p0 ?? null;
    for (const p of rest) {
      if (lanes.includes(p)) continue;
      const free = lanes.indexOf(null);
      if (free === -1) lanes.push(p);
      else lanes[free] = p;
    }
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    maxLanes = Math.max(maxLanes, lanes.length, lane + 1);
  });
  return { commits, pos, lanes: maxLanes };
}

export function refsForRepo(repo: Repository, showRemote = true): RefLabel[] {
  const refs: RefLabel[] = [];
  const cur = repo.head.kind === 'branch' ? repo.head.name : null;
  if (repo.head.kind === 'detached') refs.push({ name: 'HEAD', sha: repo.head.sha, kind: 'head' });
  for (const [b, sha] of Object.entries(repo.heads)) refs.push({ name: b, sha, kind: 'branch', current: b === cur });
  if (showRemote) for (const [r, sha] of Object.entries(repo.remoteRefs)) refs.push({ name: r, sha, kind: 'remote' });
  for (const [t, tag] of Object.entries(repo.tags)) refs.push({ name: t, sha: tag.target, kind: 'tag' });
  return refs;
}

export function refsForServer(server: RemoteServer): RefLabel[] {
  return [
    ...Object.entries(server.heads).map(([b, sha]) => ({ name: b, sha, kind: 'branch' as const, current: b === server.defaultBranch })),
    ...Object.entries(server.tags).map(([t, tag]) => ({ name: t, sha: tag.target, kind: 'tag' as const })),
  ];
}

function relTime(ts: number) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

interface Props {
  objects: ObjectStore;
  refs: RefLabel[];
  selected?: string | null;
  onSelect?: (sha: string) => void;
  className?: string;
  compact?: boolean;
  /** Commits a resaltar (p. ej. pendientes de push). */
  highlight?: Set<string>;
  highlightLabel?: string;
  emptyText?: string;
}

export function CommitGraph({ objects, refs, selected, onSelect, className, compact, highlight, highlightLabel, emptyText }: Props) {
  const tips = refs.map((r) => r.sha).filter((s) => objects.commits[s]);
  const layout = useMemo(() => layoutGraph(objects, tips), [objects, tips.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const byCommit = useMemo(() => {
    const m = new Map<string, RefLabel[]>();
    for (const r of refs) (m.get(r.sha) ?? m.set(r.sha, []).get(r.sha)!).push(r);
    return m;
  }, [refs]);
  const headRef = refs.find((r) => r.current && r.kind === 'branch') ?? refs.find((r) => r.kind === 'head');

  if (!layout.commits.length) {
    return <div className={cx('flex items-center justify-center p-6 text-center text-sm text-muted', className)}>{emptyText ?? 'Todavía no hay commits. Crea el primero y aparecerá aquí.'}</div>;
  }
  const width = PAD * 2 + Math.max(1, layout.lanes) * LANE;
  const height = layout.commits.length * ROW;
  const x = (lane: number) => PAD + lane * LANE + LANE / 2 - 4;
  const y = (row: number) => row * ROW + ROW / 2;

  const edges: { d: string; color: string }[] = [];
  for (const c of layout.commits) {
    const a = layout.pos.get(c.sha)!;
    c.parents.forEach((p, i) => {
      const b = layout.pos.get(p);
      if (!b) return;
      const x1 = x(a.lane), y1 = y(a.row), x2 = x(b.lane), y2 = y(b.row);
      let d: string;
      if (x1 === x2) d = `M${x1},${y1} L${x2},${y2}`;
      else if (i === 0) {
        // La rama converge en su padre: baja por su carril y curva al final.
        const yc = y2 - ROW;
        d = `M${x1},${y1} L${x1},${yc} C${x1},${yc + ROW / 2} ${x2},${yc + ROW / 2} ${x2},${y2}`;
      } else {
        // Segundo padre de un merge: sale curvando hacia el carril del padre.
        const yc = y1 + ROW;
        d = `M${x1},${y1} C${x1},${y1 + ROW / 2} ${x2},${y1 + ROW / 2} ${x2},${yc} L${x2},${y2}`;
      }
      edges.push({ d, color: LANE_COLORS[(i === 0 ? a.lane : b.lane) % LANE_COLORS.length] });
    });
  }

  return (
    <div className={cx('overflow-auto', className)}>
      <div className="relative" style={{ height, minWidth: width + 260 }}>
        <svg width={width} height={height} className="absolute left-0 top-0" aria-hidden>
          {edges.map((e, i) => (
            <path key={i} d={e.d} stroke={e.color} strokeWidth={2} fill="none" strokeOpacity={0.85} />
          ))}
          {layout.commits.map((c) => {
            const p = layout.pos.get(c.sha)!;
            const color = LANE_COLORS[p.lane % LANE_COLORS.length];
            const isHead = headRef?.sha === c.sha;
            const merge = c.parents.length > 1;
            return (
              <g key={c.sha} transform={`translate(${x(p.lane)},${y(p.row)})`}>
                {isHead && <circle r={9} fill="none" stroke="var(--fg)" strokeWidth={1.5} strokeDasharray="2 2" />}
                <circle r={merge ? 4.5 : 5.5} fill={merge ? 'var(--bg-1)' : color} stroke={color} strokeWidth={2.5} />
                {highlight?.has(c.sha) && <circle r={8} fill="none" stroke="#e3b341" strokeWidth={1.5} />}
              </g>
            );
          })}
        </svg>
        {layout.commits.map((c) => {
          const p = layout.pos.get(c.sha)!;
          const labels = byCommit.get(c.sha) ?? [];
          return (
            <button
              key={c.sha}
              onClick={() => onSelect?.(c.sha)}
              className={cx(
                'absolute flex items-center gap-2 rounded-md pr-2 text-left transition-colors cursor-pointer',
                selected === c.sha ? 'bg-gblue/15 ring-1 ring-gblue/40' : 'hover:bg-bg-3',
              )}
              style={{ top: p.row * ROW + 3, height: ROW - 6, left: width, right: 0 }}
              title={`${c.sha}\n${c.message}`}
            >
              <span className="shrink-0 font-mono text-[11px] text-gyellow">{short(c.sha)}</span>
              <span className="flex shrink-0 gap-1">
                {labels.map((l) => (
                  <RefChip key={l.kind + l.name} label={l} />
                ))}
              </span>
              <span className="truncate text-[12.5px] text-fg">{firstLine(c.message)}</span>
              {!compact && (
                <span className="ml-auto hidden shrink-0 items-center gap-2 pl-2 text-[11px] text-muted md:flex">
                  <span className="max-w-28 truncate">{c.author.name}</span>
                  <span>{relTime(c.timestamp)}</span>
                </span>
              )}
              {highlight?.has(c.sha) && highlightLabel && <span className="shrink-0 rounded bg-gyellow/15 px-1 text-[10px] text-gyellow">{highlightLabel}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RefChip({ label }: { label: RefLabel }) {
  if (label.kind === 'tag') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded border border-gyellow/40 bg-gyellow/10 px-1 font-mono text-[10.5px] text-gyellow">
        <Tag size={9} /> {label.name}
      </span>
    );
  }
  if (label.kind === 'head') return <span className="rounded bg-gcyan/20 px-1 font-mono text-[10.5px] font-semibold text-gcyan">HEAD</span>;
  if (label.kind === 'remote') return <span className="rounded border border-dashed border-gred/50 px-1 font-mono text-[10.5px] text-gred">{label.name}</span>;
  return (
    <span className={cx('inline-flex items-center gap-0.5 rounded px-1 font-mono text-[10.5px]', label.current ? 'bg-ggreen/20 font-semibold text-ggreen ring-1 ring-ggreen/40' : 'bg-ggreen/10 text-ggreen')}>
      {label.current && <span className="text-gcyan">HEAD →</span>}
      <GitBranch size={9} /> {label.name}
    </span>
  );
}
