import { ArrowLeft, Briefcase, CheckCircle2, Circle, Lightbulb, MessageSquare, PartyPopper, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SCENARIOS, type Scenario, type ScenarioEvent } from '../data/scenarios';
import { TEAM, type TeamKey } from '../engine/world';
import { Avatar } from '../components/github/shared';
import { Workspace } from '../components/Workspace';
import { Badge, Button, Card, ConfirmDialog, PageHeader, ProgressBar, cx } from '../components/ui';
import { href, navigate } from '../lib/router';
import { useLab, useLabs } from '../store/labs';
import { useProgress } from '../store/progress';
import { useActiveLab } from './common';

interface Meta {
  step: number;
  starts: number[];
  entered: number[];
  events: (ScenarioEvent & { at: number })[];
  hints: Record<number, number>;
}

const actorName = (a: ScenarioEvent['actor']) => (a === 'system' ? 'Sistema' : a === 'student' ? 'Tú' : TEAM[a as TeamKey].name);
const actorUser = (a: ScenarioEvent['actor']) => (a === 'system' ? 'sistema' : a === 'student' ? 'estudiante' : TEAM[a as TeamKey].username);

export default function Scenarios({ segments }: { segments: string[] }) {
  const sc = SCENARIOS.find((s) => s.id === segments[1]);
  if (sc) return <ScenarioView key={sc.id} sc={sc} />;
  return <ScenarioList />;
}

function ScenarioList() {
  const done = useProgress((s) => s.scenarios);
  return (
    <div className="space-y-5">
      <PageHeader kicker="Escenarios reales" icon={<Briefcase size={22} />} title="Simulación de un equipo profesional" subtitle="Trabajas con un equipo ficticio que actúa sobre el mismo repositorio remoto: suben cambios, abren Pull Requests, revisan tu código y te piden correcciones. Tus acciones desencadenan las suyas." />
      <Card title="El equipo">
        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(TEAM) as TeamKey[]).map((k) => (
            <div key={k} className="flex items-center gap-3 bg-bg-2 p-3">
              <Avatar user={TEAM[k].username} size={34} />
              <div>
                <p className="text-sm font-semibold">{TEAM[k].name}</p>
                <p className="text-xs text-muted">{TEAM[k].role} · @{TEAM[k].username}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SCENARIOS.map((s) => (
          <a key={s.id} href={href(`escenarios/${s.id}`)} className="group rounded-lg border border-line bg-bg-2 p-4 hover:border-accent/50 hover:bg-bg-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 font-semibold text-accent">{s.letter}</span>
              {done[s.id] && <Badge tone="green">completado</Badge>}
              <span className="ml-auto flex -space-x-1.5">{s.cast.map((c) => <Avatar key={c} user={TEAM[c].username} size={20} />)}</span>
            </div>
            <h3 className="mt-2 font-semibold group-hover:text-accent">Escenario {s.letter}: {s.title}</h3>
            <p className="mt-1 text-sm text-fg-2">{s.summary}</p>
            <p className="mt-2 text-xs text-muted">{s.steps.length} pasos · +{s.xp} XP</p>
          </a>
        ))}
      </div>
    </div>
  );
}

function ScenarioView({ sc }: { sc: Scenario }) {
  const labId = `scenario:${sc.id}`;
  useActiveLab(labId);
  const lab = useLab(labId);
  const { setMeta, mutate, reset } = useLabs.getState();
  const completeScenario = useProgress((s) => s.completeScenario);
  const meta: Meta = { step: 0, starts: [0], entered: [], events: [], hints: {}, ...(lab.meta as Partial<Meta>) };
  const [confirmReset, setConfirmReset] = useState(false);
  const total = sc.steps.length;
  const done = meta.step >= total;
  const cur = sc.steps[Math.min(meta.step, total - 1)];

  const freshEvents = () => ((useLabs.getState().labs[labId]?.meta as Partial<Meta> | undefined)?.events ?? []);
  const pushEvents = (evs: ScenarioEvent[]) => {
    if (!evs.length) return;
    setMeta(labId, { events: [...freshEvents(), ...evs.map((e) => ({ ...e, at: Date.now() }))] });
  };

  // Entrada en un paso: acciones de otros participantes.
  useEffect(() => {
    const fresh = { ...meta, ...(useLabs.getState().labs[labId]?.meta as Partial<Meta> | undefined) };
    if (done || fresh.entered.includes(meta.step)) return;
    setMeta(labId, { entered: [...fresh.entered, meta.step] });
    const s = sc.steps[meta.step];
    let evs: ScenarioEvent[] = [];
    if (s.onEnter) mutate(labId, (w) => { evs = s.onEnter!(w); });
    pushEvents(evs);
  }, [meta.step, done]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reacciones automáticas (revisores) y validación del paso.
  useEffect(() => {
    if (sc.automate) {
      let evs: ScenarioEvent[] = [];
      const probe = structuredClone(lab.world);
      if (sc.automate(probe).length) {
        mutate(labId, (w) => { evs = sc.automate!(w); });
        pushEvents(evs);
        return;
      }
    }
    if (done) return;
    const s = sc.steps[meta.step];
    if (!s.validate) return;
    let ok = false;
    try {
      ok = s.validate(lab.world, lab.log.slice(meta.starts[meta.step] ?? 0));
    } catch {
      ok = false;
    }
    if (ok) advance();
  }, [lab.world, lab.log.length, meta.step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (done) completeScenario(sc.id, sc.xp);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  function advance() {
    const next = meta.step + 1;
    setMeta(labId, { step: next, starts: [...meta.starts.slice(0, next), lab.log.length] });
  }

  const hints = meta.hints[meta.step] ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => navigate('escenarios')}>Escenarios</Button>
        <h1 className="text-lg font-semibold">Escenario {sc.letter}: {sc.title}</h1>
        <span className="ml-auto text-xs text-muted">Paso {Math.min(meta.step + 1, total)} de {total}</span>
        <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => setConfirmReset(true)}>Reiniciar</Button>
      </div>
      <ProgressBar value={Math.min(meta.step, total) / total} tone="green" />
      <div className="grid gap-4 2xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="grid content-start gap-3 md:grid-cols-2 2xl:grid-cols-1">
          <Card title="Guion">
            <ol className="p-2">
              {sc.steps.map((s, i) => (
                <li key={i} className={cx('flex items-start gap-2 rounded-md px-2 py-1.5 text-sm', i === meta.step && 'bg-bg-3', i > meta.step && 'opacity-50')}>
                  {i < meta.step ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ggreen" /> : <Circle size={16} className={cx('mt-0.5 shrink-0', i === meta.step ? 'text-accent' : 'text-line-2')} />}
                  <span>
                    {s.title}
                    {s.actor !== 'student' && <span className="ml-1 text-[11px] text-muted">({actorName(s.actor)})</span>}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
          {!done ? (
            <Card title={cur.actor === 'student' ? 'Tu tarea' : `${actorName(cur.actor)} actúa`}>
              <div className="space-y-3 p-4 text-sm">
                <p className="leading-relaxed">{cur.instruction}</p>
                {!cur.validate ? (
                  <Button size="sm" variant="primary" onClick={advance}>Continuar</Button>
                ) : (
                  <>
                    {cur.hints?.slice(0, hints).map((h, i) => (
                      <p key={i} className="flex gap-2 rounded-md border border-gyellow/30 bg-gyellow/8 px-3 py-2 text-xs text-fg-2"><Lightbulb size={13} className="mt-0.5 shrink-0 text-gyellow" /> {h}</p>
                    ))}
                    {cur.hints && hints < cur.hints.length && (
                      <Button size="sm" variant="ghost" icon={<Lightbulb size={13} />} onClick={() => setMeta(labId, { hints: { ...meta.hints, [meta.step]: hints + 1 } })}>Pista</Button>
                    )}
                    <p className="text-[11px] text-muted">Se valida automáticamente con el estado del repositorio.</p>
                  </>
                )}
              </div>
            </Card>
          ) : (
            <Card title="¡Escenario completado!" icon={<PartyPopper size={15} className="text-gyellow" />}>
              <div className="space-y-2 p-4 text-sm">
                <p>Has trabajado como en un equipo real. +{sc.xp} XP</p>
                <Button size="sm" onClick={() => navigate('escenarios')}>Siguiente escenario</Button>
              </div>
            </Card>
          )}
          <Card title="Actividad del equipo" icon={<MessageSquare size={15} className="text-accent" />}>
            <ul className="max-h-80 space-y-2 overflow-auto p-3">
              {meta.events.map((e, i) => (
                <li key={i} className="flex gap-2 text-xs animate-in">
                  <Avatar user={actorUser(e.actor)} size={22} />
                  <div className="min-w-0 rounded-md border border-line bg-bg-1 px-2.5 py-1.5">
                    <p className="font-semibold">{actorName(e.actor)}</p>
                    <p className="text-fg-2">{e.text}</p>
                  </div>
                </li>
              ))}
              {!meta.events.length && <li className="text-xs text-muted">Aquí aparecerán los mensajes y acciones de tus compañeros.</li>}
            </ul>
          </Card>
        </div>
        <Workspace key={labId + lab.createdAt} labId={labId} views={['github', 'remote', 'graph']} githubUrl={sc.repoUrl} welcome={`Escenario ${sc.letter}: ${sc.title}. Estás en tu carpeta personal (~).`} />
      </div>
      <ConfirmDialog open={confirmReset} title="Reiniciar escenario" danger confirmLabel="Reiniciar" onCancel={() => setConfirmReset(false)} onConfirm={() => { reset(labId); setConfirmReset(false); }}>
        <p>Se restaurará el repositorio remoto y tu carpeta, y el guion volverá al principio.</p>
      </ConfirmDialog>
    </div>
  );
}
