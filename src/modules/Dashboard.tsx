import { ArrowRight, Box, Briefcase, CheckCircle2, ClipboardCheck, Clock, Compass, Flame, GitBranch, Target, Terminal, Trophy } from 'lucide-react';
import { ACHIEVEMENTS } from '../data/achievements';
import { MODULES } from '../data/modules';
import { href } from '../lib/router';
import { accuracy, formatDuration, overallProgress } from '../lib/stats';
import { levelFor, useProgress } from '../store/progress';
import { Badge, Card, ProgressBar, cx } from '../components/ui';

const PATH = [
  { phase: 'Fase 1 · Fundamentos', items: ['fundamentos', 'terminal', 'repositorios', 'historial'] },
  { phase: 'Fase 2 · Control de versiones', items: ['ramas', 'conflictos'] },
  { phase: 'Fase 3 · Recuperación y remotos', items: ['deshacer', 'remoto'] },
  { phase: 'Fase 4 · GitHub y colaboración', items: ['github', 'colaboracion'] },
  { phase: 'Fase 5 · Nivel profesional', items: ['workflows', 'archivos'] },
];

export default function Dashboard() {
  const p = useProgress();
  const stats = overallProgress(p);
  const lvl = levelFor(p.xp);
  const next = stats.pendingModules[0];
  const recent = Object.entries(p.achievements)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id]) => ACHIEVEMENTS.find((a) => a.id === id)!)
    .filter(Boolean);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-xl border border-line bg-gradient-to-br from-bg-2 via-bg-2 to-bg-3 p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <div className="relative grid gap-6 md:grid-cols-[1fr_auto]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Laboratorio virtual</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Aprende Git y GitHub haciendo, no leyendo</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-2">
              Cada laboratorio es un entorno de desarrollo simulado en tu navegador: una terminal con un motor Git real, un explorador de archivos, el grafo de commits y un GitHub de práctica. Equivócate sin miedo: todo se puede reiniciar.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={href(next ? next.id : 'retos')} className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110">
                {p.totalCommands ? 'Continuar' : 'Empezar'}: {next ? next.label : 'Retos prácticos'} <ArrowRight size={15} />
              </a>
              <a href={href('guiado')} className="inline-flex items-center gap-2 rounded-md border border-line bg-bg-3 px-4 py-2 text-sm hover:bg-bg-4">
                <Compass size={15} /> Modo guiado
              </a>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-lg border border-line bg-bg-1/70 p-4">
            <ProgressRing value={stats.pct} />
            <div className="text-sm">
              <p className="font-semibold">Nivel {lvl.level}</p>
              <p className="text-fg-2">{lvl.name}</p>
              <p className="mt-1 font-mono text-xs text-muted">{p.xp} XP</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Terminal size={16} />} label="Comandos practicados" value={String(Object.keys(p.commands).filter((c) => c.startsWith('git ')).length)} sub={`${p.totalCommands} ejecuciones`} />
        <Stat icon={<Trophy size={16} />} label="Retos aprobados" value={`${stats.challenges.done}/${stats.challenges.total}`} />
        <Stat icon={<Target size={16} />} label="Precisión" value={`${accuracy(p)}%`} sub="comandos sin error" />
        <Stat icon={<Clock size={16} />} label="Tiempo de práctica" value={formatDuration(p.timeSpent)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Ruta de aprendizaje" icon={<GitBranch size={15} className="text-accent" />}>
          <ol className="divide-y divide-line">
            {PATH.map((ph) => {
              const done = ph.items.filter((i) => p.modulesCompleted[i]).length;
              return (
                <li key={ph.phase} className="px-4 py-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-fg">{ph.phase}</span>
                    <span className="text-muted">
                      {done}/{ph.items.length}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ph.items.map((id) => {
                      const m = MODULES.find((x) => x.id === id)!;
                      const Icon = m.icon;
                      return (
                        <a key={id} href={href(id)} className={cx('inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors', p.modulesCompleted[id] ? 'border-ggreen/40 bg-ggreen/10 text-ggreen' : p.modulesVisited[id] ? 'border-gyellow/40 text-fg' : 'border-line text-fg-2 hover:bg-bg-3')}>
                          {p.modulesCompleted[id] ? <CheckCircle2 size={13} /> : <Icon size={13} />} {m.label}
                        </a>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
        <div className="space-y-4">
          <Card title="Modos de práctica" icon={<Flame size={15} className="text-accent" />}>
            <div className="grid gap-px bg-line">
              {[
                { id: 'sandbox', icon: <Box size={16} />, t: 'Modo libre', d: 'Experimenta sin instrucciones. Guarda varias sesiones.' },
                { id: 'guiado', icon: <Compass size={16} />, t: 'Modo guiado', d: `${stats.guided.done}/${stats.guided.total} lecciones paso a paso` },
                { id: 'escenarios', icon: <Briefcase size={16} />, t: 'Escenarios reales', d: `${stats.scenarios.done}/${stats.scenarios.total} simulaciones de equipo` },
                { id: 'evaluaciones', icon: <ClipboardCheck size={16} />, t: 'Evaluaciones', d: `${stats.evals.done}/${stats.evals.total} aprobadas` },
              ].map((x) => (
                <a key={x.id} href={href(x.id)} className="flex items-center gap-3 bg-bg-2 px-4 py-3 hover:bg-bg-3">
                  <span className="text-accent">{x.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{x.t}</span>
                    <span className="block truncate text-xs text-muted">{x.d}</span>
                  </span>
                  <ArrowRight size={14} className="ml-auto text-muted" />
                </a>
              ))}
            </div>
          </Card>
          <Card title="Logros recientes" icon={<Trophy size={15} className="text-gyellow" />} actions={<a href={href('progreso')} className="text-xs text-gblue hover:underline">ver todos</a>}>
            {recent.length ? (
              <ul className="divide-y divide-line">
                {recent.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                    <Trophy size={14} className="text-gyellow" /> <span className="font-medium">{a.title}</span> <span className="truncate text-xs text-muted">{a.description}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-4 text-sm text-muted">Ejecuta tu primer comando para desbloquear el primer logro.</p>
            )}
          </Card>
        </div>
      </div>

      <Card title="Módulos" className="overflow-hidden">
        <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
          {MODULES.filter((m) => m.group === 'Aprender').map((m) => {
            const Icon = m.icon;
            return (
              <a key={m.id} href={href(m.id)} className="group flex gap-3 bg-bg-2 p-4 hover:bg-bg-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-4 text-accent group-hover:bg-accent/15">
                  <Icon size={17} />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {m.label}
                    {p.modulesCompleted[m.id] && <Badge tone="green">completado</Badge>}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{m.description}</span>
                </span>
              </a>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg-2 p-4">
      <p className="flex items-center gap-2 text-xs text-muted">
        <span className="text-accent">{icon}</span> {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

export function ProgressRing({ value, size = 76 }: { value: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`Avance total ${value}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--bg-4)" strokeWidth={7} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--accent)" strokeWidth={7} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold tabular-nums">{value}%</span>
        <span className="text-[9px] uppercase tracking-wider text-muted">avance</span>
      </span>
    </div>
  );
}

export { ProgressBar };
