/**
 * Piezas comunes de los módulos: laboratorio activo, tareas autovalidadas,
 * cuestionario de cierre y tarjetas de conceptos.
 */
import { CheckCircle2, ChevronDown, Circle, GraduationCap, HelpCircle, XCircle } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import type { Check } from '../labs/checks';
import { useLab } from '../store/labs';
import { useProgress } from '../store/progress';
import { useUI } from '../store/ui';
import type { Quiz } from '../data/guided';
import { Badge, Button, Card, cx } from '../components/ui';

/** Marca el laboratorio como destino de "Enviar a la terminal". */
export function useActiveLab(labId: string | null) {
  const setActive = useUI((s) => s.setActiveLab);
  useEffect(() => {
    setActive(labId);
    return () => setActive(null);
  }, [labId, setActive]);
}

function safe(fn: () => boolean) {
  try {
    return fn();
  } catch {
    return false;
  }
}

/** Lista de tareas que se validan automáticamente con el estado real del laboratorio. */
export function LabTasks({ labId, tasks, title = 'Practica en el laboratorio', onAllDone }: { labId: string; tasks: Check[]; title?: string; onAllDone?: () => void }) {
  const lab = useLab(labId);
  const results = tasks.map((t) => safe(() => t.test(lab.world, lab.log)));
  const done = results.filter(Boolean).length;
  const all = done === tasks.length;
  useEffect(() => {
    if (all) onAllDone?.();
  }, [all]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card title={title} icon={<GraduationCap size={15} className="text-accent" />} actions={<Badge tone={all ? 'green' : 'neutral'}>{done}/{tasks.length}</Badge>}>
      <ul className="space-y-1.5 p-3">
        {tasks.map((t, i) => (
          <li key={t.id} className={cx('flex items-start gap-2 text-sm', results[i] ? 'text-fg' : 'text-fg-2')}>
            {results[i] ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ggreen" /> : <Circle size={16} className="mt-0.5 shrink-0 text-line-2" />}
            <span>{t.label}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-3 py-2 text-[11px] text-muted">Se comprueban automáticamente sobre el estado real del repositorio simulado.</p>
    </Card>
  );
}

/** Cuestionario de comprensión que completa el módulo. */
export function ModuleQuiz({ moduleId, questions }: { moduleId: string; questions: Quiz[] }) {
  const completeModule = useProgress((s) => s.completeModule);
  const answerQuiz = useProgress((s) => s.answerQuiz);
  const completed = useProgress((s) => !!s.modulesCompleted[moduleId]);
  const [answers, setAnswers] = useState<(number | null)[]>(questions.map(() => null));
  const correct = answers.filter((a, i) => a !== null && questions[i].options[a].correct).length;
  const allAnswered = answers.every((a) => a !== null);
  useEffect(() => {
    if (allAnswered && correct === questions.length) completeModule(moduleId);
  }, [allAnswered, correct, questions.length, moduleId, completeModule]);

  return (
    <Card title="Comprueba lo aprendido" icon={<HelpCircle size={15} className="text-gblue" />} actions={completed ? <Badge tone="green">módulo completado</Badge> : <Badge>{correct}/{questions.length}</Badge>}>
      <div className="space-y-4 p-4">
        {questions.map((q, i) => (
          <div key={i}>
            <p className="mb-2 text-sm font-medium">
              {i + 1}. {q.question}
            </p>
            <div className="space-y-1.5">
              {q.options.map((o, j) => {
                const chosen = answers[i] === j;
                return (
                  <button
                    key={j}
                    onClick={() => {
                      if (answers[i] !== null && questions[i].options[answers[i]!].correct) return;
                      setAnswers((a) => a.map((x, k) => (k === i ? j : x)));
                      answerQuiz(`${moduleId}:${i}`, o.correct);
                    }}
                    className={cx(
                      'flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors cursor-pointer',
                      chosen ? (o.correct ? 'border-ggreen/60 bg-ggreen/10' : 'border-gred/60 bg-gred/10') : 'border-line hover:bg-bg-3',
                    )}
                  >
                    {chosen ? o.correct ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ggreen" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-gred" /> : <Circle size={16} className="mt-0.5 shrink-0 text-line-2" />}
                    <span>
                      {o.text}
                      {chosen && <span className="mt-1 block text-xs text-fg-2">{o.explanation}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {allAnswered && correct < questions.length && (
          <p className="text-xs text-gyellow">Revisa las respuestas incorrectas: cada error es una oportunidad para entender mejor el concepto. Puedes volver a elegir.</p>
        )}
      </div>
    </Card>
  );
}

export function Concept({ title, children, icon, defaultOpen }: { title: string; children: ReactNode; icon?: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-lg border border-line bg-bg-2">
      <button className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium cursor-pointer" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {icon && <span className="text-accent">{icon}</span>}
        {title}
        <ChevronDown size={15} className={cx('ml-auto shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="space-y-2 border-t border-line px-4 py-3 text-sm leading-relaxed text-fg-2 animate-in">{children}</div>}
    </div>
  );
}

export function TwoCol({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('grid gap-4 lg:grid-cols-2', className)}>{children}</div>;
}

export function ResetLabButton({ onReset }: { onReset: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onReset}>
      Reiniciar laboratorio
    </Button>
  );
}
