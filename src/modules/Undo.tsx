import { AlertTriangle, CheckCircle2, Lightbulb, LifeBuoy, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { COMPARISONS } from '../data/commands';
import { UNDO_SCENARIOS } from '../data/undoScenarios';
import { Workspace } from '../components/Workspace';
import { Badge, Button, Callout, Card, PageHeader, cx } from '../components/ui';
import { useLab, useLabs } from '../store/labs';
import { useProgress } from '../store/progress';
import { ModuleQuiz, useActiveLab } from './common';

const EFFECTS: { cmd: string; head: string; index: string; wd: string; danger: 'none' | 'medium' | 'high'; when: string }[] = [
  { cmd: 'git restore <archivo>', head: '—', index: '—', wd: 'Sobrescrito con la versión del staging', danger: 'high', when: 'Descartar cambios sin preparar de un archivo' },
  { cmd: 'git restore --staged <archivo>', head: '—', index: 'Vuelve a la versión de HEAD', wd: '—', danger: 'none', when: 'Deshacer un git add' },
  { cmd: 'git restore --source=<c> <archivo>', head: '—', index: '— (o sí, con --staged)', wd: 'Contenido del commit c', danger: 'medium', when: 'Recuperar un archivo de una versión anterior' },
  { cmd: 'git reset --soft <c>', head: 'Se mueve a c', index: '—', wd: '—', danger: 'none', when: 'Rehacer commits locales (cambios quedan preparados)' },
  { cmd: 'git reset [--mixed] <c>', head: 'Se mueve a c', index: 'Igual a c', wd: '—', danger: 'medium', when: 'Deshacer commits y git add, conservando archivos' },
  { cmd: 'git reset --hard <c>', head: 'Se mueve a c', index: 'Igual a c', wd: 'Igual a c (cambios perdidos)', danger: 'high', when: 'Tirar todo y volver a un punto exacto' },
  { cmd: 'git revert <c>', head: 'Avanza: commit nuevo', index: 'Actualizado', wd: 'Actualizado', danger: 'none', when: 'Deshacer un commit YA publicado' },
  { cmd: 'git checkout -- <archivo>', head: '—', index: '—', wd: 'Sobrescrito (forma antigua de restore)', danger: 'high', when: 'Igual que git restore <archivo>' },
  { cmd: 'git reflog', head: '—', index: '—', wd: '—', danger: 'none', when: 'Encontrar commits "perdidos"' },
  { cmd: 'git clean -f', head: '—', index: '—', wd: 'Borra archivos SIN RASTREAR', danger: 'high', when: 'Eliminar archivos temporales no versionados' },
];

export default function Undo() {
  const [scenario, setScenario] = useState(UNDO_SCENARIOS[0].id);
  const labId = `undo-s:${scenario}`;
  useActiveLab(labId);
  const sc = UNDO_SCENARIOS.find((s) => s.id === scenario)!;
  const lab = useLab(labId);
  const reset = useLabs((s) => s.reset);
  const addXP = useProgress((s) => s.addXP);
  const [showHint, setShowHint] = useState<Record<string, boolean>>({});
  const [solved, setSolved] = useState<Record<string, boolean>>({});
  const results = sc.checks.map((c) => {
    try {
      return c.test(lab.world, lab.log);
    } catch {
      return false;
    }
  });
  const allOk = results.every(Boolean) && lab.log.length > 0;
  useEffect(() => {
    if (allOk && !solved[scenario]) {
      setSolved((s) => ({ ...s, [scenario]: true }));
      addXP(10);
    }
  }, [allOk, scenario]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Módulo 6"
        icon={<Undo2 size={22} />}
        title="Deshacer cambios y recuperación"
        subtitle="restore, reset y revert parecen similares, pero actúan sobre partes distintas de Git. Entender qué toca cada uno es la diferencia entre recuperar tu trabajo y perderlo."
      />

      <Card title="¿Qué toca cada comando?" icon={<LifeBuoy size={15} className="text-accent" />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-bg-3 text-left text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Comando</th>
                <th className="px-3 py-2 font-medium">HEAD / rama</th>
                <th className="px-3 py-2 font-medium">Staging (índice)</th>
                <th className="px-3 py-2 font-medium">Working directory</th>
                <th className="px-3 py-2 font-medium">¿Destructivo?</th>
                <th className="px-3 py-2 font-medium">Cuándo usarlo</th>
              </tr>
            </thead>
            <tbody>
              {EFFECTS.map((e) => (
                <tr key={e.cmd} className="border-t border-line align-top">
                  <td className="px-3 py-2 font-mono text-accent-2">{e.cmd}</td>
                  <td className={cx('px-3 py-2', e.head !== '—' && 'text-gblue')}>{e.head}</td>
                  <td className={cx('px-3 py-2', e.index !== '—' && 'text-ggreen')}>{e.index}</td>
                  <td className={cx('px-3 py-2', e.wd !== '—' && 'text-gyellow')}>{e.wd}</td>
                  <td className="px-3 py-2">{e.danger === 'high' ? <Badge tone="red">sí, pierde cambios</Badge> : e.danger === 'medium' ? <Badge tone="yellow">con cuidado</Badge> : <Badge tone="green">seguro</Badge>}</td>
                  <td className="px-3 py-2 text-fg-2">{e.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {COMPARISONS.slice(0, 2).map((c) => (
          <Card key={c.title} title={c.title}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left">
                    <th className="px-3 py-2" />
                    {c.columns.map((col) => (
                      <th key={col} className="px-3 py-2 font-mono font-medium text-accent-2">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {c.rows.map((r) => (
                    <tr key={r.label} className="border-t border-line align-top">
                      <td className="px-3 py-1.5 text-muted">{r.label}</td>
                      {r.values.map((v, i) => (
                        <td key={i} className="px-3 py-1.5 text-fg-2">{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-3 py-2 text-xs text-fg"><b>Regla práctica:</b> {c.verdict}</p>
          </Card>
        ))}
      </div>

      <Callout tone="warn" title="Operaciones destructivas" icon={<AlertTriangle size={15} className="text-gyellow" />}>
        Antes de ejecutar reset --hard, restore, checkout --, clean -f, branch -D o push --force, la terminal te mostrará exactamente qué perderías con el estado actual y te pedirá confirmación. Lo que nunca estuvo en un commit no se puede recuperar.
      </Callout>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Escenarios: equivócate y recupérate</h2>
        <div className="flex flex-wrap gap-1.5">
          {UNDO_SCENARIOS.map((s) => (
            <button key={s.id} onClick={() => setScenario(s.id)} className={cx('flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer', scenario === s.id ? 'border-accent bg-accent/10 text-fg' : 'border-line text-fg-2 hover:bg-bg-3')}>
              {solved[s.id] && <CheckCircle2 size={13} className="text-ggreen" />} {s.title}
            </button>
          ))}
        </div>
        <Card title={sc.title} actions={allOk ? <Badge tone="green">¡resuelto!</Badge> : <Button size="sm" variant="ghost" onClick={() => reset(labId)}>Reiniciar escenario</Button>}>
          <div className="space-y-3 p-4">
            <p className="text-sm text-fg-2">{sc.story}</p>
            <ul className="space-y-1">
              {sc.checks.map((c, i) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  {results[i] ? <CheckCircle2 size={15} className="text-ggreen" /> : <span className="h-3.5 w-3.5 rounded-full border border-line-2" />} {c.label}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" icon={<Lightbulb size={13} />} onClick={() => setShowHint((h) => ({ ...h, [scenario]: true }))}>
                Pista
              </Button>
              {showHint[scenario] && <p className="text-xs text-gyellow">{sc.hint}</p>}
            </div>
            {allOk && (
              <Callout tone="success" title="Por qué funciona">
                <p><code className="font-mono">{sc.answer}</code></p>
                <p className="mt-1">{sc.why}</p>
              </Callout>
            )}
          </div>
        </Card>
        <Workspace key={labId} labId={labId} views={['states', 'graph']} suggestions={['git status', 'git log --oneline', 'git reflog', 'git diff', 'git diff --staged']} />
      </section>

      <ModuleQuiz
        moduleId="deshacer"
        questions={[
          {
            question: 'Quieres deshacer tu último commit LOCAL pero conservar sus cambios preparados para rehacerlo. ¿Qué usas?',
            options: [
              { text: 'git reset --soft HEAD~1', correct: true, explanation: 'Mueve la rama atrás y deja staging y archivos intactos.' },
              { text: 'git reset --hard HEAD~1', correct: false, explanation: '--hard descartaría los cambios.' },
              { text: 'git revert HEAD', correct: false, explanation: 'revert crearía un commit nuevo que deshace el cambio; no lo deja preparado para rehacer.' },
            ],
          },
          {
            question: '¿Qué comando NO puede recuperar un archivo que nunca se añadió ni confirmó?',
            options: [
              { text: 'Ninguno: Git nunca tuvo ese contenido', correct: true, explanation: 'Git solo recupera lo que guardó en el índice o en un commit.' },
              { text: 'git reflog', correct: false, explanation: 'reflog solo registra movimientos de HEAD.' },
              { text: 'git restore', correct: false, explanation: 'restore necesita una versión guardada.' },
            ],
          },
          {
            question: '¿Qué comando es seguro para deshacer un commit que tus compañeros ya descargaron?',
            options: [
              { text: 'git revert', correct: true, explanation: 'No reescribe la historia compartida.' },
              { text: 'git reset --hard + git push --force', correct: false, explanation: 'Reescribe la historia remota: rompe el trabajo de los demás.' },
              { text: 'git commit --amend', correct: false, explanation: 'También reescribe la historia.' },
            ],
          },
        ]}
      />
    </div>
  );
}
