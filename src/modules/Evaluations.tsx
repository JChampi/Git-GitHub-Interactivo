import { ArrowLeft, CheckCircle2, ClipboardCheck, Send, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EVAL_CATEGORIES, EVALUATIONS, scoreEvaluation, type Evaluation } from '../data/evaluations';
import { Workspace } from '../components/Workspace';
import { Badge, Button, Callout, Card, ConfirmDialog, PageHeader, cx } from '../components/ui';
import { href, navigate } from '../lib/router';
import { useLab, useLabs } from '../store/labs';
import { useProgress } from '../store/progress';
import { useActiveLab } from './common';

export default function Evaluations({ segments }: { segments: string[] }) {
  const ev = EVALUATIONS.find((e) => e.id === segments[1]);
  if (ev) return <EvaluationView key={ev.id} ev={ev} />;
  return <EvaluationList />;
}

function EvaluationList() {
  const history = useProgress((s) => s.evaluations);
  return (
    <div className="space-y-5">
      <PageHeader kicker="Evaluaciones" icon={<ClipboardCheck size={22} />} title="Mide tu dominio real" subtitle="Recibes un objetivo, no los comandos. Se evalúa si alcanzaste el estado pedido (60%), si entendiste las consecuencias (25%) y si trabajaste de forma segura y eficiente (15%). Aprobado: todos los objetivos y 70 puntos." />
      <div className="grid gap-3 md:grid-cols-2">
        {EVAL_CATEGORIES.map((cat) => {
          const evs = EVALUATIONS.filter((e) => e.category === cat.id);
          return (
            <Card key={cat.id} title={cat.name} actions={evs.every((e) => history.some((h) => h.id === e.id && h.passed)) ? <Badge tone="green">dominado</Badge> : null}>
              <ul className="divide-y divide-line">
                {evs.map((e) => {
                  const best = history.filter((h) => h.id === e.id).sort((a, b) => b.score - a.score)[0];
                  return (
                    <li key={e.id}>
                      <a href={href(`evaluaciones/${e.id}`)} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-bg-3">
                        {best?.passed ? <CheckCircle2 size={15} className="text-ggreen" /> : best ? <XCircle size={15} className="text-gred" /> : <ClipboardCheck size={15} className="text-muted" />}
                        <span className="font-medium">{e.title}</span>
                        <span className="ml-auto text-xs text-muted">{best ? `${best.score}/100` : 'sin intentar'}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
      <Card title="Historial de evaluaciones">
        {history.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-bg-3 text-left text-muted">
                <tr><th className="px-3 py-1.5">Fecha</th><th className="px-3 py-1.5">Evaluación</th><th className="px-3 py-1.5">Puntuación</th><th className="px-3 py-1.5">Precisión</th><th className="px-3 py-1.5">Resultado</th></tr>
              </thead>
              <tbody>
                {history.slice(0, 20).map((h, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-3 py-1.5 text-muted">{new Date(h.date).toLocaleString()}</td>
                    <td className="px-3 py-1.5">{h.title}</td>
                    <td className="px-3 py-1.5 font-mono">{h.score}</td>
                    <td className="px-3 py-1.5 font-mono">{h.accuracy}%</td>
                    <td className="px-3 py-1.5">{h.passed ? <Badge tone="green">aprobada</Badge> : <Badge tone="red">no aprobada</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-sm text-muted">Aún no has realizado evaluaciones.</p>
        )}
      </Card>
    </div>
  );
}

function EvaluationView({ ev }: { ev: Evaluation }) {
  const labId = `eval:${ev.id}`;
  useActiveLab(labId);
  const lab = useLab(labId);
  const { reset, mutate } = useLabs.getState();
  const addEvaluation = useProgress((s) => s.addEvaluation);
  const [phase, setPhase] = useState<'work' | 'question' | 'report'>('work');
  const [answer, setAnswer] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState<ReturnType<typeof scoreEvaluation> | null>(null);
  const cat = EVAL_CATEGORIES.find((c) => c.id === ev.category)!;

  useEffect(() => {
    if (!ev.automate) return;
    const probe = structuredClone(lab.world);
    if (!ev.automate(probe)) return;
    let changed = false;
    mutate(labId, (w) => { changed = ev.automate!(w); });
    if (changed) useLabs.getState().notice(labId, '[GitHub] Un revisor del equipo revisó tu Pull Request.', 'info');
  }, [lab.world]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    const correct = answer !== null && ev.question.options[answer].correct;
    const r = scoreEvaluation(ev, lab.world, lab.log, correct);
    setReport(r);
    setPhase('report');
    addEvaluation({ id: ev.id, category: ev.category, title: ev.title, score: r.score, accuracy: r.accuracy, passed: r.passed, date: Date.now(), notes: r.notes }, ev.xp);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => navigate('evaluaciones')}>Evaluaciones</Button>
        <Badge tone="accent">{cat.name}</Badge>
        <h1 className="text-lg font-semibold">{ev.title}</h1>
      </div>
      <div className="grid gap-4 2xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="grid content-start gap-3 md:grid-cols-2 2xl:grid-cols-1">
          <Card title="Situación">
            <div className="space-y-3 p-4 text-sm">
              <p className="leading-relaxed">{ev.situation}</p>
              <Callout tone="info">No se indican los comandos: decide tú el procedimiento. Cuando creas que has terminado, entrega la evaluación.</Callout>
              {phase === 'work' && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" icon={<Send size={14} />} onClick={() => setPhase('question')}>Entregar</Button>
                  <Button variant="ghost" onClick={() => setConfirm(true)}>Empezar de nuevo</Button>
                </div>
              )}
            </div>
          </Card>
          {phase === 'question' && (
            <Card title="Pregunta de comprensión">
              <div className="space-y-2 p-4 text-sm">
                <p className="font-medium">{ev.question.question}</p>
                {ev.question.options.map((o, i) => (
                  <button key={i} onClick={() => setAnswer(i)} className={cx('w-full rounded-md border px-3 py-2 text-left cursor-pointer', answer === i ? 'border-gblue bg-gblue/10' : 'border-line hover:bg-bg-3')}>
                    {o.text}
                  </button>
                ))}
                <div className="flex gap-2 pt-1">
                  <Button variant="primary" disabled={answer === null} onClick={submit}>Ver resultado</Button>
                  <Button variant="ghost" onClick={() => setPhase('work')}>Volver al laboratorio</Button>
                </div>
              </div>
            </Card>
          )}
          {phase === 'report' && report && (
            <Card title="Resultado" actions={report.passed ? <Badge tone="green">aprobada</Badge> : <Badge tone="red">no aprobada</Badge>}>
              <div className="space-y-3 p-4 text-sm">
                <p className="text-3xl font-semibold tabular-nums">{report.score}<span className="text-base text-muted">/100</span></p>
                <ul className="space-y-1">
                  {report.goals.map((g) => (
                    <li key={g.id} className="flex items-start gap-2">
                      {g.passed ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ggreen" /> : <XCircle size={15} className="mt-0.5 shrink-0 text-gred" />} {g.label}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-fg-2">Precisión: {report.accuracy}% de comandos sin error · {report.gitCommands} comandos de Git</p>
                {answer !== null && <p className="text-xs text-fg-2"><b>Pregunta:</b> {ev.question.options[answer].explanation}</p>}
                {report.notes.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-5 text-xs text-gyellow">{report.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { reset(labId); setPhase('work'); setAnswer(null); setReport(null); }}>Repetir</Button>
                  <Button size="sm" variant="ghost" onClick={() => navigate('evaluaciones')}>Otras evaluaciones</Button>
                </div>
              </div>
            </Card>
          )}
        </div>
        <Workspace key={labId + lab.createdAt} labId={labId} views={ev.github ? ['github', 'graph', 'states'] : ['graph', 'states']} githubUrl={ev.github} welcome="Evaluación en curso. Recuerda: se valora el resultado y la seguridad, no memorizar." />
      </div>
      <ConfirmDialog open={confirm} title="Empezar de nuevo" danger confirmLabel="Reiniciar" onCancel={() => setConfirm(false)} onConfirm={() => { reset(labId); setConfirm(false); }}>
        <p>El laboratorio de esta evaluación volverá a su estado inicial.</p>
      </ConfirmDialog>
    </div>
  );
}
