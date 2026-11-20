/**
 * Panel contextual: explica el último comando ejecutado o el tema elegido
 * (sintaxis, parámetros, ejemplo, resultado, errores y recomendaciones).
 */
import { AlertTriangle, BookText, Lightbulb, Send, X } from 'lucide-react';
import { docFor } from '../data/commands';
import { useLabs } from '../store/labs';
import { useUI } from '../store/ui';
import { navigate } from '../lib/router';
import { Badge, Button, cx } from './ui';

export function ContextPanel({ className, onClose }: { className?: string; onClose?: () => void }) {
  const topic = useUI((s) => s.topic);
  const setTopic = useUI((s) => s.setTopic);
  const activeLab = useUI((s) => s.activeLab);
  const setPending = useLabs((s) => s.setPendingInput);
  const doc = docFor(topic ?? undefined);

  return (
    <aside className={cx('flex min-h-0 flex-col border-l border-line bg-bg-1', className)} aria-label="Panel contextual">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <BookText size={15} className="text-accent" />
        <span className="text-sm font-semibold">Explicación contextual</span>
        {onClose && (
          <button aria-label="Cerrar panel" onClick={onClose} className="ml-auto rounded p-1 text-muted hover:bg-bg-3 hover:text-fg cursor-pointer">
            <X size={15} />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
        {!doc ? (
          <div className="space-y-3 text-fg-2">
            <p>Ejecuta un comando en cualquier terminal y aquí verás qué hace, su sintaxis, sus parámetros, un ejemplo y los errores más frecuentes.</p>
            <p className="text-xs text-muted">También puedes buscar cualquier comando en el diccionario.</p>
            <Button size="sm" onClick={() => navigate('diccionario')}>
              Abrir diccionario
            </Button>
          </div>
        ) : (
          <div className="space-y-4 animate-in" key={doc.key}>
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="font-mono text-base font-semibold text-accent-2">{doc.key}</h2>
                <Badge tone={doc.level === 'Principiante' ? 'green' : doc.level === 'Básico' ? 'blue' : doc.level === 'Intermedio' ? 'yellow' : 'red'}>{doc.level}</Badge>
                <Badge>{doc.category}</Badge>
                {doc.simulated === false && <Badge tone="purple">solo documentación</Badge>}
              </div>
              <p className="mt-2 leading-relaxed text-fg-2">{doc.description}</p>
            </div>
            {doc.destructive && (
              <p className="flex gap-2 rounded-md border border-gred/40 bg-gred/8 px-3 py-2 text-xs text-fg-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-gred" /> {doc.destructive}
              </p>
            )}
            <Section title="Sintaxis">
              <div className="space-y-1">
                {doc.syntax.map((s) => (
                  <code key={s} className="block rounded bg-bg-3 px-2 py-1 font-mono text-[12px] text-fg">
                    {s}
                  </code>
                ))}
              </div>
            </Section>
            {doc.params.length > 0 && (
              <Section title="Parámetros">
                <dl className="space-y-1.5">
                  {doc.params.map((p) => (
                    <div key={p.flag}>
                      <dt className="font-mono text-[12px] text-gblue">{p.flag}</dt>
                      <dd className="text-xs text-fg-2">{p.desc}</dd>
                    </div>
                  ))}
                </dl>
              </Section>
            )}
            <Section title="Ejemplo práctico">
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-term px-2 py-1 font-mono text-[12px] text-[#7ee787]">$ {doc.example}</code>
                {activeLab && doc.simulated !== false && (
                  <button title="Escribir en la terminal" aria-label="Escribir en la terminal" className="rounded p-1 text-muted hover:bg-bg-3 hover:text-fg cursor-pointer" onClick={() => setPending(activeLab, doc.example)}>
                    <Send size={14} />
                  </button>
                )}
              </div>
            </Section>
            <Section title="Resultado esperado">
              <pre className="whitespace-pre-wrap rounded bg-bg-3 px-2 py-1.5 font-mono text-[11.5px] text-fg-2">{doc.result}</pre>
            </Section>
            {doc.errors.length > 0 && (
              <Section title="Errores frecuentes">
                <ul className="space-y-2">
                  {doc.errors.map((e) => (
                    <li key={e.error} className="text-xs">
                      <p className="font-mono text-gred">{e.error}</p>
                      <p className="text-fg-2">→ {e.fix}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {doc.tips && (
              <Section title="Recomendaciones">
                <ul className="space-y-1">
                  {doc.tips.map((t) => (
                    <li key={t} className="flex gap-2 text-xs text-fg-2">
                      <Lightbulb size={13} className="mt-0.5 shrink-0 text-gyellow" /> {t}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {doc.related.length > 0 && (
              <Section title="Relacionados">
                <div className="flex flex-wrap gap-1">
                  {doc.related.map((r) => (
                    <button key={r} onClick={() => setTopic(r)} className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-fg-2 hover:border-accent hover:text-fg cursor-pointer">
                      {r}
                    </button>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
      {children}
    </section>
  );
}
