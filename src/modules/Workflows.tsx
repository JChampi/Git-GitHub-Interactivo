import { ChevronLeft, ChevronRight, Route, ThumbsDown, ThumbsUp, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { findRepo } from '../engine/repo';
import { getServer } from '../engine/server';
import { WORKFLOWS, buildStep } from '../data/workflows';
import { CommitGraph, refsForRepo, refsForServer } from '../components/CommitGraph';
import { Badge, Button, Card, PageHeader, ProgressBar, cx } from '../components/ui';
import { ModuleQuiz } from './common';

export default function Workflows() {
  const [wfId, setWfId] = useState(WORKFLOWS[0].id);
  const [step, setStep] = useState(0);
  const wf = WORKFLOWS.find((w) => w.id === wfId)!;
  const { world, outputs } = useMemo(() => buildStep(wf, step), [wf, step]);
  const repo = findRepo(world);
  const server = Object.values(world.servers)[0];
  const s = wf.steps[step];

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Módulo 11"
        icon={<Route size={22} />}
        title="Workflows profesionales"
        subtitle="Cómo organizan las ramas los equipos reales. Avanza paso a paso: cada diagrama se genera ejecutando los comandos reales del flujo en el motor de simulación."
      />
      <div className="flex flex-wrap gap-2">
        {WORKFLOWS.map((w) => (
          <button key={w.id} onClick={() => { setWfId(w.id); setStep(0); }} className={cx('rounded-lg border px-4 py-2 text-sm font-medium cursor-pointer', wfId === w.id ? 'border-accent bg-accent/10 text-fg' : 'border-line text-fg-2 hover:bg-bg-3')}>
            {w.name}
          </button>
        ))}
      </div>
      <p className="text-sm text-fg-2">{wf.summary}</p>

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Card title="Pasos">
          <ol className="p-2">
            {wf.steps.map((st, i) => (
              <li key={i}>
                <button onClick={() => setStep(i)} className={cx('flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm cursor-pointer', i === step ? 'bg-accent/10 text-fg' : i < step ? 'text-fg-2 hover:bg-bg-3' : 'text-muted hover:bg-bg-3')}>
                  <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', i <= step ? 'bg-accent text-white' : 'bg-bg-4')}>{i + 1}</span>
                  {st.title}
                </button>
              </li>
            ))}
          </ol>
          <div className="border-t border-line p-3">
            <ProgressBar value={(step + 1) / wf.steps.length} />
          </div>
        </Card>
        <Card
          title={`${step + 1}. ${s.title}`}
          actions={
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)} icon={<ChevronLeft size={14} />}>Anterior</Button>
              <Button size="sm" variant="primary" disabled={step === wf.steps.length - 1} onClick={() => setStep(step + 1)}>Siguiente <ChevronRight size={14} /></Button>
            </div>
          }
        >
          <div className="space-y-3 p-4">
            <p className="text-sm leading-relaxed text-fg-2">{s.explain}</p>
            {(outputs.length > 0 || s.actionLabel) && (
              <pre className="overflow-x-auto rounded-md bg-term p-3 font-mono text-[12px] leading-5 text-[#c9d1d9]">
                {outputs.map((c) => `$ ${c}`).join('\n')}
                {s.actionLabel && `${outputs.length ? '\n' : ''}# (GitHub) ${s.actionLabel}`}
              </pre>
            )}
            <div className={cx('grid gap-3', server && 'lg:grid-cols-2')}>
              <div className="rounded-md border border-line bg-bg-1">
                <p className="border-b border-line px-3 py-1.5 text-xs font-semibold">Repositorio local</p>
                {repo && <CommitGraph objects={repo.objects} refs={refsForRepo(repo)} className="max-h-80 p-2" compact />}
              </div>
              {server && (
                <div className="rounded-md border border-line bg-bg-1">
                  <p className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-xs font-semibold">
                    GitHub {server.pulls[0] && <Badge tone={server.pulls[0].state === 'merged' ? 'purple' : 'green'}>PR #{server.pulls[0].number} {server.pulls[0].state}</Badge>}
                    {server.pulls[0]?.reviews.some((r) => r.state === 'approved') && <Badge tone="green">aprobado</Badge>}
                  </p>
                  <CommitGraph objects={server.objects} refs={refsForServer(getServer(world, server.url)!)} className="max-h-80 p-2" compact />
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card title="Ventajas" icon={<ThumbsUp size={15} className="text-ggreen" />}>
          <ul className="list-disc space-y-1 py-3 pl-8 pr-3 text-sm text-fg-2">{wf.pros.map((x) => <li key={x}>{x}</li>)}</ul>
        </Card>
        <Card title="Desventajas" icon={<ThumbsDown size={15} className="text-gred" />}>
          <ul className="list-disc space-y-1 py-3 pl-8 pr-3 text-sm text-fg-2">{wf.cons.map((x) => <li key={x}>{x}</li>)}</ul>
        </Card>
        <Card title="Cuándo usarlo" icon={<Users size={15} className="text-gblue" />}>
          <ul className="list-disc space-y-1 py-3 pl-8 pr-3 text-sm text-fg-2">{wf.when.map((x) => <li key={x}>{x}</li>)}</ul>
        </Card>
      </div>

      <Card title="Comparativa">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="bg-bg-3 text-left text-muted">
              <tr>
                <th className="px-3 py-2" />
                <th className="px-3 py-2">GitHub Flow</th>
                <th className="px-3 py-2">Git Flow</th>
                <th className="px-3 py-2">Trunk-Based</th>
              </tr>
            </thead>
            <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:px-3 [&_td]:py-1.5">
              <tr><td className="text-muted">Ramas permanentes</td><td>main</td><td>main + develop</td><td>main</td></tr>
              <tr><td className="text-muted">Ramas de apoyo</td><td>feature (cortas)</td><td>feature, release, hotfix</td><td>muy cortas (horas) o ninguna</td></tr>
              <tr><td className="text-muted">Integración</td><td>Por Pull Request</td><td>Merges --no-ff planificados</td><td>Continua, varias veces al día</td></tr>
              <tr><td className="text-muted">Versiones</td><td>Despliegue continuo</td><td>Releases numeradas</td><td>Despliegue continuo + flags</td></tr>
              <tr><td className="text-muted">Complejidad</td><td>Baja</td><td>Alta</td><td>Baja en Git, alta en disciplina/CI</td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <ModuleQuiz
        moduleId="workflows"
        questions={[
          {
            question: 'Tu equipo publica una app móvil con versiones 1.0, 1.1, 2.0 y debe corregir errores de versiones ya publicadas. ¿Qué flujo encaja mejor?',
            options: [
              { text: 'Git Flow', correct: true, explanation: 'Sus ramas release y hotfix están pensadas para versiones planificadas.' },
              { text: 'Trunk-Based', correct: false, explanation: 'Brilla con despliegue continuo, no con versiones paralelas.' },
              { text: 'Ninguno: no se usan ramas', correct: false, explanation: 'Todos los flujos organizan ramas de alguna forma.' },
            ],
          },
          {
            question: 'En Trunk-Based Development, ¿cómo se integra una funcionalidad que tardará semanas?',
            options: [
              { text: 'En pasos pequeños integrados a diario, ocultos tras una feature flag', correct: true, explanation: 'Así se evita una rama larga que diverja.' },
              { text: 'En una rama feature de varias semanas', correct: false, explanation: 'Eso contradice la idea de integración continua.' },
              { text: 'Directamente con push --force', correct: false, explanation: 'Nunca en la rama compartida.' },
            ],
          },
        ]}
      />
    </div>
  );
}
