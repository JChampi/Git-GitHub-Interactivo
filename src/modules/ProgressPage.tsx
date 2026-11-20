import { BarChart3, Clock, Lock, RotateCcw, Target, Terminal, TrendingUp, Trophy, type LucideIcon, BadgeCheck, Brain, Briefcase, CloudUpload, Compass, Crown, Eye, Flag, FolderGit2, Footprints, GitBranch, GitCommitHorizontal, GitMerge, History, Keyboard, Languages, Lightbulb, Medal, RefreshCw, Star, Swords, Undo2, Users } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = { Clock, Terminal, Trophy, BadgeCheck, Brain, Briefcase, CloudUpload, Compass, Crown, Eye, Flag, FolderGit2, Footprints, GitBranch, GitCommitHorizontal, GitMerge, History, Keyboard, Languages, Lightbulb, Medal, RefreshCw, Star, Swords, Undo2, Users };
import { useState } from 'react';
import { ACHIEVEMENTS } from '../data/achievements';
import { EVAL_CATEGORIES } from '../data/evaluations';
import { accuracy, formatDuration, overallProgress } from '../lib/stats';
import { href } from '../lib/router';
import { LEVELS, levelFor, useProgress } from '../store/progress';
import { Badge, Button, Card, ConfirmDialog, PageHeader, ProgressBar, cx } from '../components/ui';
import { ProgressRing } from './Dashboard';

export default function ProgressPage() {
  const p = useProgress();
  const stats = overallProgress(p);
  const lvl = levelFor(p.xp);
  const [confirm, setConfirm] = useState(false);
  const top = Object.entries(p.commands).filter(([c]) => c.startsWith('git ') || c.startsWith('gh ')).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const max = top[0]?.[1] ?? 1;

  return (
    <div className="space-y-5">
      <PageHeader kicker="Seguimiento" icon={<TrendingUp size={22} />} title="Tu progreso" subtitle="Todo se guarda localmente en este navegador. Los retos, lecciones, escenarios y evaluaciones actualizan estas estadísticas automáticamente." actions={<Button variant="ghost" icon={<RotateCcw size={14} />} onClick={() => setConfirm(true)}>Reiniciar progreso</Button>} />
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <Card className="flex items-center gap-5 p-5">
          <ProgressRing value={stats.pct} size={110} />
          <div>
            <p className="text-sm text-muted">Nivel actual</p>
            <p className="text-xl font-semibold">{lvl.level} · {lvl.name}</p>
            <p className="font-mono text-sm text-fg-2">{p.xp} XP</p>
            <ProgressBar value={lvl.progress} className="mt-2 w-48" />
            <p className="mt-1 text-[11px] text-muted">{lvl.next ? `${lvl.next.xp - p.xp} XP para ${lvl.next.name}` : 'Nivel máximo alcanzado'}</p>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {[
            ['Módulos completados', `${stats.modules.done}/${stats.modules.total}`],
            ['Retos aprobados', `${stats.challenges.done}/${stats.challenges.total}`],
            ['Lecciones guiadas', `${stats.guided.done}/${stats.guided.total}`],
            ['Escenarios reales', `${stats.scenarios.done}/${stats.scenarios.total}`],
            ['Evaluaciones aprobadas', `${stats.evals.done}/${stats.evals.total}`],
            ['Logros', `${Object.keys(p.achievements).length}/${ACHIEVEMENTS.length}`],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-line bg-bg-2 p-3">
              <p className="text-xs text-muted">{l}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="flex items-center gap-2 text-xs text-muted"><Terminal size={14} className="text-accent" /> Comandos ejecutados</p><p className="mt-1 text-2xl font-semibold tabular-nums">{p.totalCommands}</p><p className="text-[11px] text-muted">{Object.keys(p.commands).filter((c) => c.startsWith('git ')).length} comandos de Git distintos</p></Card>
        <Card className="p-4"><p className="flex items-center gap-2 text-xs text-muted"><Target size={14} className="text-accent" /> Precisión</p><p className="mt-1 text-2xl font-semibold tabular-nums">{accuracy(p)}%</p><p className="text-[11px] text-muted">{p.failedCommands} errores (¡cada uno enseña algo!)</p></Card>
        <Card className="p-4"><p className="flex items-center gap-2 text-xs text-muted"><Clock size={14} className="text-accent" /> Tiempo de aprendizaje</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatDuration(p.timeSpent)}</p><p className="text-[11px] text-muted">{p.daysActive.length} día(s) de práctica</p></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Comandos más practicados" icon={<BarChart3 size={15} className="text-accent" />}>
          {top.length ? (
            <ul className="space-y-1.5 p-4">
              {top.map(([c, n]) => (
                <li key={c} className="grid grid-cols-[130px_1fr_32px] items-center gap-2 text-xs">
                  <code className="truncate font-mono">{c}</code>
                  <span className="h-2.5 overflow-hidden rounded-full bg-bg-4"><span className="block h-full rounded-full bg-accent" style={{ width: `${(n / max) * 100}%` }} /></span>
                  <span className="text-right font-mono text-muted">{n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted">Todavía no has practicado comandos.</p>
          )}
        </Card>
        <Card title="Evaluaciones por categoría">
          <ul className="space-y-2 p-4">
            {EVAL_CATEGORIES.map((c) => {
              const best = Math.max(0, ...p.evaluations.filter((e) => e.category === c.id).map((e) => e.score));
              return (
                <li key={c.id} className="grid grid-cols-[170px_1fr_40px] items-center gap-2 text-xs">
                  <span className="truncate">{c.name}</span>
                  <ProgressBar value={best / 100} tone={best >= 70 ? 'green' : 'accent'} />
                  <span className="text-right font-mono text-muted">{best || '—'}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      <Card title="Temas pendientes">
        <div className="flex flex-wrap gap-2 p-4">
          {stats.pendingModules.map((m) => (
            <a key={m.id} href={href(m.id)} className="rounded-md border border-line px-2.5 py-1 text-xs text-fg-2 hover:bg-bg-3">{m.label}</a>
          ))}
          {!stats.pendingModules.length && <p className="text-sm text-ggreen">¡Has completado todos los módulos!</p>}
        </div>
      </Card>
      <Card title={`Logros (${Object.keys(p.achievements).length}/${ACHIEVEMENTS.length})`} icon={<Trophy size={15} className="text-gyellow" />}>
        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
          {ACHIEVEMENTS.map((a) => {
            const got = p.achievements[a.id];
            const Icon = ICONS[a.icon] ?? Trophy;
            return (
              <div key={a.id} className={cx('flex items-center gap-3 bg-bg-2 p-3', !got && 'opacity-55')}>
                <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', got ? 'bg-gyellow/15 text-gyellow' : 'bg-bg-4 text-muted')}>{got ? <Icon size={17} /> : <Lock size={15} />}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{a.title} <Badge>{a.xp} XP</Badge></p>
                  <p className="text-xs text-muted">{a.description}</p>
                  {got && <p className="text-[10.5px] text-ggreen">{new Date(got).toLocaleDateString()}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Niveles">
        <ol className="flex flex-wrap gap-2 p-4">
          {LEVELS.map((l) => (
            <li key={l.level} className={cx('rounded-md border px-3 py-1.5 text-xs', p.xp >= l.xp ? 'border-ggreen/40 text-fg' : 'border-line text-muted')}>
              {l.level}. {l.name} <span className="font-mono">({l.xp} XP)</span>
            </li>
          ))}
        </ol>
      </Card>
      <ConfirmDialog open={confirm} title="Reiniciar progreso" danger confirmLabel="Borrar progreso" onCancel={() => setConfirm(false)} onConfirm={() => { useProgress.getState().resetProgress(); setConfirm(false); }}>
        <p>Se borrarán XP, logros, retos, evaluaciones y estadísticas. Los laboratorios no se modifican (puedes reiniciarlos por separado).</p>
      </ConfirmDialog>
    </div>
  );
}
