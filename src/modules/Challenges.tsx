import { ArrowLeft, BookOpen, CheckCircle2, Circle, Flag, Lightbulb, Lock, PartyPopper, RotateCcw, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CHALLENGES, LEVEL_NAMES, type Challenge } from '../data/challenges';
import { Workspace } from '../components/Workspace';
import { Badge, Button, Callout, Card, ConfirmDialog, PageHeader, cx } from '../components/ui';
import { href, navigate } from '../lib/router';
import { useLab, useLabs } from '../store/labs';
import { useProgress } from '../store/progress';
import { useActiveLab } from './common';

interface Meta {
  hints: number;
  solved: boolean;
  solutionShown: boolean;
}

export default function Challenges({ segments }: { segments: string[] }) {
  const ch = CHALLENGES.find((c) => c.id === segments[1]);
  if (ch) return <ChallengeView key={ch.id} ch={ch} />;
  return <ChallengeList />;
}

function ChallengeList() {
  const results = useProgress((s) => s.challenges);
  return (
    <div className="space-y-5">
      <PageHeader kicker="Retos prácticos" icon={<Trophy size={22} />} title="Desafíos progresivos" subtitle="Cada reto parte de un repositorio preparado y se valida automáticamente comprobando el estado final. Las pistas son progresivas y la solución solo se muestra cuando lo hayas intentado." />
      {[1, 2, 3, 4, 5].map((lvl) => {
        const list = CHALLENGES.filter((c) => c.level === lvl);
        const prevDone = lvl === 1 || CHALLENGES.filter((c) => c.level === lvl - 1).some((c) => results[c.id]);
        return (
          <section key={lvl} className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/15 text-xs text-accent">{lvl}</span>
              Nivel {lvl}: {LEVEL_NAMES[lvl]}
              {!prevDone && <Badge tone="yellow">recomendado: supera antes un reto del nivel {lvl - 1}</Badge>}
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((c) => {
                const r = results[c.id];
                return (
                  <a key={c.id} href={href(`retos/${c.id}`)} className={cx('group rounded-lg border bg-bg-2 p-4 hover:bg-bg-3', r ? 'border-ggreen/40' : 'border-line hover:border-accent/50')}>
                    <div className="flex items-center gap-2">
                      {r ? <CheckCircle2 size={16} className="text-ggreen" /> : prevDone ? <Flag size={16} className="text-accent" /> : <Lock size={15} className="text-muted" />}
                      <Badge>{c.category}</Badge>
                      <span className="ml-auto font-mono text-[11px] text-muted">+{c.xp} XP</span>
                    </div>
                    <h3 className="mt-2 font-semibold group-hover:text-accent">{c.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-fg-2">{c.objective}</p>
                    {r && <p className="mt-2 text-xs text-ggreen">Superado · {r.score}/100 · {r.hintsUsed} pista(s)</p>}
                  </a>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ChallengeView({ ch }: { ch: Challenge }) {
  const labId = `challenge:${ch.id}`;
  useActiveLab(labId);
  const lab = useLab(labId);
  const { setMeta, reset, mutate } = useLabs.getState();
  const completeChallenge = useProgress((s) => s.completeChallenge);
  const best = useProgress((s) => s.challenges[ch.id]);
  const meta: Meta = { hints: 0, solved: false, solutionShown: false, ...(lab.meta as Partial<Meta>) };
  const [confirm, setConfirm] = useState<'reset' | 'solution' | null>(null);
  const results = ch.checks.map((c) => {
    try {
      return c.test(lab.world, lab.log);
    } catch {
      return false;
    }
  });
  const solved = results.every(Boolean);
  const gitCmds = lab.log.filter((r) => r.command.startsWith('git ') || r.command.startsWith('gh ')).length;
  const failed = lab.log.filter((r) => !r.ok).length;
  const attempted = lab.log.length >= 3 || meta.hints >= ch.hints.length;
  const score = Math.max(30, 100 - meta.hints * 10 - Math.max(0, gitCmds - ch.optimal * 2) * 2 - (meta.solutionShown ? 40 : 0));

  // Automatizaciones (p. ej. un revisor que aprueba el PR).
  useEffect(() => {
    if (!ch.automate) return;
    const probe = structuredClone(lab.world);
    if (!ch.automate(probe)) return;
    let changed = false;
    mutate(labId, (w) => { changed = ch.automate!(w); });
    if (changed) useLabs.getState().notice(labId, '[GitHub] Carlos (revisor) revisó tu Pull Request.', 'info');
  }, [lab.world]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (solved && !meta.solved && lab.log.length > 0) {
      setMeta(labId, { solved: true });
      completeChallenge(ch.id, { hintsUsed: meta.hints, commands: gitCmds, score }, meta.solutionShown ? Math.round(ch.xp / 2) : ch.xp);
    }
  }, [solved]); // eslint-disable-line react-hooks/exhaustive-deps

  const feedback: string[] = [];
  if (meta.solved || solved) {
    feedback.push(`Lo resolviste con ${gitCmds} comando(s) de Git; una solución directa usa unos ${ch.optimal}.`);
    if (failed) feedback.push(`Tuviste ${failed} comando(s) con error: revisa las pistas moradas de la terminal para entender por qué fallaron.`);
    if (!meta.hints) feedback.push('¡Sin pistas! Excelente autonomía.');
    if (lab.log.some((r) => r.command === 'git reset' && r.argv.includes('--hard'))) feedback.push('Usaste git reset --hard: funciona, pero asegúrate de que no había cambios que perder.');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => navigate('retos')}>Retos</Button>
        <Badge tone="accent">Nivel {ch.level} · {LEVEL_NAMES[ch.level]}</Badge>
        <h1 className="text-lg font-semibold">{ch.title}</h1>
        {best && <Badge tone="green">mejor: {best.score}/100</Badge>}
        <Button size="sm" variant="ghost" className="ml-auto" icon={<RotateCcw size={13} />} onClick={() => setConfirm('reset')}>Reiniciar reto</Button>
      </div>
      <div className="grid gap-4 2xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="grid content-start gap-3 md:grid-cols-2 2xl:grid-cols-1">
          <Card title="Contexto" icon={<BookOpen size={15} className="text-accent" />}>
            <div className="space-y-3 p-4 text-sm">
              <p className="text-fg-2">{ch.context}</p>
              <p><b>Objetivo:</b> {ch.objective}</p>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Instrucciones</p>
                <ol className="list-decimal space-y-1 pl-5 text-fg-2">{ch.instructions.map((i) => <li key={i}>{i}</li>)}</ol>
              </div>
              <p className="text-xs text-muted"><b>Repositorio inicial:</b> {ch.initialRepo}</p>
            </div>
          </Card>
          <Card title="Requisitos para aprobar" actions={<Badge tone={solved ? 'green' : 'neutral'}>{results.filter(Boolean).length}/{results.length}</Badge>}>
            <ul className="space-y-1.5 p-3">
              {ch.checks.map((c, i) => (
                <li key={c.id} className="flex items-start gap-2 text-sm">
                  {results[i] ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ggreen" /> : <Circle size={16} className="mt-0.5 shrink-0 text-line-2" />} {c.label}
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-3 py-2 text-[11px] text-muted">Validación automática sobre el estado del repositorio en cada comando.</p>
          </Card>
          <Card title="Pistas">
            <div className="space-y-2 p-3">
              {ch.hints.slice(0, meta.hints).map((h, i) => (
                <p key={i} className="flex gap-2 rounded-md border border-gyellow/30 bg-gyellow/8 px-3 py-2 text-xs text-fg-2"><Lightbulb size={13} className="mt-0.5 shrink-0 text-gyellow" /> <span><b>Pista {i + 1}:</b> {h}</span></p>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" icon={<Lightbulb size={13} />} disabled={meta.hints >= ch.hints.length} onClick={() => setMeta(labId, { hints: meta.hints + 1 })}>
                  {meta.hints ? 'Siguiente pista' : 'Pedir una pista'} (−10)
                </Button>
                {!solved && !meta.solutionShown && (
                  <Button size="sm" variant="ghost" disabled={!attempted} title={attempted ? undefined : 'Disponible cuando lo hayas intentado (3 comandos o todas las pistas)'} onClick={() => setConfirm('solution')}>
                    Ver solución
                  </Button>
                )}
              </div>
              {!attempted && <p className="text-[11px] text-muted">La solución se desbloquea cuando lo hayas intentado.</p>}
            </div>
          </Card>
          {(solved || meta.solutionShown) && (
            <Card title={solved ? '¡Reto superado!' : 'Solución'} icon={solved ? <PartyPopper size={15} className="text-gyellow" /> : undefined}>
              <div className="space-y-3 p-4 text-sm">
                {solved && <p className="text-ggreen">Puntuación: {score}/100 {meta.solutionShown && '(solución consultada)'}</p>}
                <pre className="overflow-x-auto rounded-md bg-term p-3 font-mono text-[12px] leading-5 text-[#c9d1d9]">{ch.solution.map((s) => `$ ${s}`).join('\n')}</pre>
                <Callout tone="info" title="Explicación">{ch.explanation}</Callout>
                {feedback.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Retroalimentación</p>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-fg-2">{feedback.map((f) => <li key={f}>{f}</li>)}</ul>
                  </div>
                )}
                {solved && <Button size="sm" onClick={() => { const i = CHALLENGES.indexOf(ch); navigate(i < CHALLENGES.length - 1 ? `retos/${CHALLENGES[i + 1].id}` : 'retos'); }}>Siguiente reto</Button>}
              </div>
            </Card>
          )}
        </div>
        <Workspace key={labId + lab.createdAt} labId={labId} views={ch.github ? ['github', 'graph', 'states'] : ['graph', 'states']} githubUrl={ch.github} welcome={`Reto: ${ch.title}. Lee el contexto y los requisitos a la izquierda.`} />
      </div>
      <ConfirmDialog open={confirm === 'reset'} title="Reiniciar reto" danger confirmLabel="Reiniciar" onCancel={() => setConfirm(null)} onConfirm={() => { reset(labId); setConfirm(null); }}>
        <p>El repositorio volverá a su estado inicial. Tu mejor puntuación se conserva.</p>
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'solution'} title="¿Ver la solución?" confirmLabel="Ver solución" onCancel={() => setConfirm(null)} onConfirm={() => { setMeta(labId, { solutionShown: true }); setConfirm(null); }}>
        <p>Si consultas la solución antes de resolverlo, la puntuación baja 40 puntos y ganarás la mitad de XP. Intentarlo un poco más suele ser la mejor forma de aprender.</p>
      </ConfirmDialog>
    </div>
  );
}
