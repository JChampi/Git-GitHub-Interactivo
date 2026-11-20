import { ArrowLeft, CheckCircle2, Circle, Clock, Compass, Eye, Lightbulb, PartyPopper, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GUIDED, type GuidedLesson } from '../data/guided';
import { Workspace } from '../components/Workspace';
import { Badge, Button, Callout, Card, ConfirmDialog, PageHeader, ProgressBar, cx } from '../components/ui';
import { href, navigate } from '../lib/router';
import { useLab, useLabs } from '../store/labs';
import { useProgress } from '../store/progress';
import { useActiveLab } from './common';

interface GuidedMeta {
  step: number;
  starts: number[];
  hints: number[];
  entered: number[];
  notes: string[];
  quiz: number | null;
  finished: boolean;
}

export default function Guided({ segments }: { segments: string[] }) {
  const lesson = GUIDED.find((g) => g.id === segments[1]);
  if (lesson) return <LessonView key={lesson.id} lesson={lesson} />;
  return <LessonList />;
}

function LessonList() {
  const guided = useProgress((s) => s.guided);
  return (
    <div className="space-y-5">
      <PageHeader kicker="Modo guiado" icon={<Compass size={22} />} title="Aprende paso a paso" subtitle="Cada lección plantea una situación y te guía con instrucciones progresivas. El sistema valida cada paso comprobando el estado real del repositorio. Las pistas aparecen solo si las pides." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {GUIDED.map((g) => (
          <a key={g.id} href={href(`guiado/${g.id}`)} className="group rounded-lg border border-line bg-bg-2 p-4 transition-colors hover:border-accent/50 hover:bg-bg-3">
            <div className="flex items-center gap-2">
              <Badge>{g.level}</Badge>
              <span className="flex items-center gap-1 text-[11px] text-muted"><Clock size={11} /> {g.duration}</span>
              {guided[g.id] && <Badge tone="green">completada · {guided[g.id].score}/100</Badge>}
            </div>
            <h3 className="mt-2 font-semibold group-hover:text-accent">{g.title}</h3>
            <p className="mt-1 text-sm text-fg-2">{g.description}</p>
            <p className="mt-2 text-xs text-muted">{g.steps.length} pasos · +{g.xp} XP</p>
          </a>
        ))}
      </div>
    </div>
  );
}

function LessonView({ lesson }: { lesson: GuidedLesson }) {
  const labId = `guided:${lesson.id}`;
  useActiveLab(labId);
  const lab = useLab(labId);
  const { setMeta, mutate, reset, notice } = useLabs.getState();
  const completeGuided = useProgress((s) => s.completeGuided);
  const meta: GuidedMeta = { step: 0, starts: [0], hints: [], entered: [], notes: [], quiz: null, finished: false, ...(lab.meta as Partial<GuidedMeta>) };
  const [view, setView] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const total = lesson.steps.length;
  const done = meta.step >= total;
  const shown = view ?? Math.min(meta.step, total - 1);
  const step = lesson.steps[shown];

  // Acciones automáticas al entrar en un paso (p. ej. un compañero sube cambios).
  useEffect(() => {
    const freshEntered = ((useLabs.getState().labs[labId]?.meta as Partial<GuidedMeta> | undefined)?.entered ?? []) as number[];
    if (done || freshEntered.includes(meta.step)) return;
    const s = lesson.steps[meta.step];
    setMeta(labId, { entered: [...freshEntered, meta.step] });
    if (s.onEnter) {
      let msg: string | null = null;
      mutate(labId, (w) => {
        msg = s.onEnter!(w);
      });
      if (msg) notice(labId, `📣 ${msg}`, 'warn');
    }
  }, [meta.step, done]); // eslint-disable-line react-hooks/exhaustive-deps

  // Validación automática del paso actual sobre el estado real.
  useEffect(() => {
    if (done) return;
    const s = lesson.steps[meta.step];
    const since = lab.log.slice(meta.starts[meta.step] ?? 0);
    let ok = false;
    try {
      ok = s.validate(lab.world, since);
    } catch {
      ok = false;
    }
    if (ok) {
      const next = meta.step + 1;
      setMeta(labId, { step: next, starts: [...meta.starts.slice(0, next), lab.log.length] });
      setView(null);
    }
  }, [lab.world, lab.log.length, meta.step, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const hintsUsed = meta.hints.reduce((a, b) => a + (b ?? 0), 0);
  const quizCorrect = meta.quiz !== null && lesson.quiz.options[meta.quiz].correct;
  const score = Math.max(40, 100 - hintsUsed * 5 - (meta.quiz !== null && !quizCorrect ? 20 : 0));

  const showHint = () => {
    const hints = [...meta.hints];
    hints[shown] = Math.min(step.hints.length, (hints[shown] ?? 0) + 1);
    setMeta(labId, { hints });
  };

  const answer = (i: number) => {
    if (meta.finished) return;
    setMeta(labId, { quiz: i, finished: true });
    const correct = lesson.quiz.options[i].correct;
    completeGuided(lesson.id, hintsUsed, Math.max(40, 100 - hintsUsed * 5 - (correct ? 0 : 20)), lesson.xp);
  };

  const failed = lab.log.slice(meta.starts[Math.min(meta.step, total - 1)] ?? 0).filter((r) => !r.ok);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => navigate('guiado')}>Lecciones</Button>
        <h1 className="text-lg font-semibold">{lesson.title}</h1>
        <Badge>{lesson.level}</Badge>
        <span className="ml-auto text-xs text-muted">Paso {Math.min(meta.step + 1, total)} de {total}</span>
        <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => setConfirmReset(true)}>Reiniciar lección</Button>
      </div>
      <ProgressBar value={Math.min(meta.step, total) / total} tone="green" />
      <div className="grid gap-4 2xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="grid content-start gap-3 md:grid-cols-2 2xl:grid-cols-1">
          <Card title="Pasos">
            <ol className="p-2">
              {lesson.steps.map((s, i) => {
                const complete = i < meta.step;
                const current = i === meta.step;
                return (
                  <li key={i}>
                    <button
                      disabled={i > meta.step}
                      onClick={() => setView(i === meta.step ? null : i)}
                      className={cx('flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm disabled:cursor-not-allowed cursor-pointer', shown === i ? 'bg-bg-3' : 'hover:bg-bg-3', i > meta.step && 'opacity-50')}
                    >
                      {complete ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ggreen" /> : current ? <Circle size={16} className="mt-0.5 shrink-0 text-accent pulse-ring rounded-full" /> : <Circle size={16} className="mt-0.5 shrink-0 text-line-2" />}
                      <span className={cx(current && 'font-medium')}>{s.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </Card>
          {!done || view !== null ? (
            <Card title={view !== null && view < meta.step ? `Repaso · paso ${view + 1}` : `Paso ${shown + 1}: ${step.title}`} icon={view !== null && view < meta.step ? <Eye size={15} /> : undefined}>
              <div className="space-y-3 p-4">
                <p className="text-sm leading-relaxed">{step.instruction}</p>
                {shown < meta.step ? (
                  <Callout tone="success" title="Paso completado">{step.explanation}</Callout>
                ) : (
                  <>
                    {(meta.hints[shown] ?? 0) > 0 && (
                      <div className="space-y-1.5">
                        {step.hints.slice(0, meta.hints[shown]).map((h, i) => (
                          <p key={i} className="flex gap-2 rounded-md border border-gyellow/30 bg-gyellow/8 px-3 py-2 text-xs text-fg-2">
                            <Lightbulb size={13} className="mt-0.5 shrink-0 text-gyellow" /> <span><b>Pista {i + 1}:</b> {h}</span>
                          </p>
                        ))}
                      </div>
                    )}
                    <Button size="sm" variant="ghost" icon={<Lightbulb size={13} />} disabled={(meta.hints[shown] ?? 0) >= step.hints.length} onClick={showHint}>
                      {(meta.hints[shown] ?? 0) ? 'Otra pista' : 'Necesito una pista'} ({step.hints.length - (meta.hints[shown] ?? 0)} disponibles)
                    </Button>
                    {failed.length > 0 && <p className="text-xs text-gyellow">Llevas {failed.length} intento(s) con error en este paso. Lee la pista morada que aparece en la terminal: explica qué ha fallado.</p>}
                    <p className="text-[11px] text-muted">El paso se valida automáticamente cuando el repositorio alcanza el estado pedido.</p>
                  </>
                )}
              </div>
            </Card>
          ) : null}
          {done && view === null && (
            <Card title="Evaluación final" icon={<PartyPopper size={15} className="text-gyellow" />}>
              <div className="space-y-3 p-4">
                <p className="text-sm text-ggreen">¡Has completado todos los pasos!</p>
                <p className="text-sm font-medium">{lesson.quiz.question}</p>
                <div className="space-y-1.5">
                  {lesson.quiz.options.map((o, i) => (
                    <button key={i} disabled={meta.finished} onClick={() => answer(i)} className={cx('w-full rounded-md border px-3 py-2 text-left text-sm cursor-pointer disabled:cursor-default', meta.quiz === i ? (o.correct ? 'border-ggreen bg-ggreen/10' : 'border-gred bg-gred/10') : meta.finished && o.correct ? 'border-ggreen/50' : 'border-line hover:bg-bg-3')}>
                      {o.text}
                      {meta.finished && (meta.quiz === i || o.correct) && <span className="mt-1 block text-xs text-fg-2">{o.explanation}</span>}
                    </button>
                  ))}
                </div>
                {meta.finished && (
                  <div className="rounded-md border border-line bg-bg-1 p-3 text-sm">
                    <p className="font-semibold">Puntuación: {score}/100</p>
                    <p className="text-xs text-fg-2">Pistas usadas: {hintsUsed} (−5 cada una){meta.quiz !== null && !quizCorrect ? ' · pregunta final incorrecta (−20)' : ''}</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" onClick={() => navigate('guiado')}>Más lecciones</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)}>Repetir</Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
        <Workspace key={labId + (lab.createdAt ?? 0)} labId={labId} views={lesson.id === 'g-remote' ? ['github', 'remote', 'graph'] : ['states', 'graph']} githubUrl={lesson.id === 'g-remote' ? 'https://github.com/estudiante/proyecto.git' : undefined} welcome={`Lección: ${lesson.title}. Sigue las instrucciones del panel de la izquierda.`} />
      </div>
      <ConfirmDialog open={confirmReset} title="Reiniciar lección" danger confirmLabel="Reiniciar" onCancel={() => setConfirmReset(false)} onConfirm={() => { reset(labId); setView(null); setConfirmReset(false); }}>
        <p>El repositorio de la lección volverá a su estado inicial y empezarás desde el paso 1.</p>
      </ConfirmDialog>
    </div>
  );
}
