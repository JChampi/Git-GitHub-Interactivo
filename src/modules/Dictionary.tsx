import { AlertTriangle, BookText, Check, Copy, HelpCircle, Search, Send, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORIES, COMMANDS, COMPARISONS, findSituations, type CommandDoc, type Level } from '../data/commands';
import { Badge, Button, Card, PageHeader, cx } from '../components/ui';
import { navigate } from '../lib/router';
import { useLabs } from '../store/labs';
import { useUI } from '../store/ui';

const LEVELS: Level[] = ['Principiante', 'Básico', 'Intermedio', 'Avanzado'];
const EXAMPLES = ['Quiero crear una rama y cambiarme a ella', 'Quiero descartar los cambios de un archivo', 'Quiero recuperar un commit anterior', 'Quiero subir mi rama a GitHub', 'Quiero descargar los cambios del repositorio remoto', 'Quiero comparar dos ramas'];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function Dictionary() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');
  const [lvl, setLvl] = useState<string>('');
  const [situation, setSituation] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const answers = useMemo(() => findSituations(situation), [situation]);

  const list = useMemo(() => {
    const nq = norm(q.trim());
    return COMMANDS.filter((c) => (!cat || c.category === cat) && (!lvl || c.level === lvl) && (!nq || norm([c.key, c.description, ...c.syntax, ...c.params.map((p) => p.flag + ' ' + p.desc), ...c.errors.map((e) => e.error)].join(' ')).includes(nq)));
  }, [q, cat, lvl]);

  return (
    <div className="space-y-5">
      <PageHeader kicker="Diccionario inteligente" icon={<BookText size={22} />} title="Chuleta interactiva de Git" subtitle="Busca por nombre, descripción, opción, mensaje de error o situación. Copia cualquier comando o envíalo directamente a la terminal." />

      <Card title="¿Qué comando necesito para esta situación?" icon={<Sparkles size={15} className="text-accent" />}>
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2 rounded-md border border-line bg-bg-0 px-3 py-2 focus-within:border-gblue">
            <HelpCircle size={16} className="text-muted" />
            <input value={situation} onChange={(e) => setSituation(e.target.value)} placeholder="Describe lo que quieres hacer, p. ej. «quiero deshacer el último commit»" aria-label="Describe tu situación" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => setSituation(e)} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-fg-2 hover:border-accent hover:text-fg cursor-pointer">{e}</button>
            ))}
          </div>
          {situation.trim() && !answers.length && <p className="text-sm text-muted">No encontré una situación parecida. Prueba con otras palabras (rama, deshacer, subir, descargar, conflicto…) o busca abajo por comando.</p>}
          {answers.map((a, i) => (
            <div key={a.id} className={cx('rounded-lg border p-3', i === 0 ? 'border-accent/50 bg-accent/5' : 'border-line')}>
              <p className="text-sm font-semibold">{a.question}</p>
              <p className="mt-1 text-sm text-fg-2">{a.answer}</p>
              <div className="mt-2 space-y-1">
                {a.commands.map((c) => <CmdLine key={c} cmd={c} />)}
              </div>
              {a.notes && <p className="mt-2 text-xs text-gyellow">{a.notes}</p>}
            </div>
          ))}
          <p className="text-[11px] text-muted">Funciona con una base de conocimiento local (sin conexión ni APIs externas).</p>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-md border border-line bg-bg-2 px-3 py-2 focus-within:border-gblue">
          <Search size={15} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar comandos, opciones o errores…" aria-label="Buscar comandos" className="w-full bg-transparent text-sm outline-none" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría" className="rounded-md border border-line bg-bg-2 px-2 py-2 text-sm">
          <option value="">Todas las categorías</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={lvl} onChange={(e) => setLvl(e.target.value)} aria-label="Nivel" className="rounded-md border border-line bg-bg-2 px-2 py-2 text-sm">
          <option value="">Todos los niveles</option>
          {LEVELS.map((l) => <option key={l}>{l}</option>)}
        </select>
        <span className="text-xs text-muted">{list.length} comandos</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((c) => (
          <CommandCard key={c.key} c={c} open={open === c.key} onToggle={() => setOpen(open === c.key ? null : c.key)} onRelated={(r) => { setQ(r); setCat(''); setLvl(''); }} />
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Comparación entre comandos similares</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {COMPARISONS.map((cmp) => (
            <Card key={cmp.title} title={cmp.title}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr><th className="px-3 py-2" />{cmp.columns.map((col) => <th key={col} className="px-3 py-2 text-left font-mono font-medium text-accent-2">{col}</th>)}</tr></thead>
                  <tbody>
                    {cmp.rows.map((r) => (
                      <tr key={r.label} className="border-t border-line align-top">
                        <td className="px-3 py-1.5 text-muted">{r.label}</td>
                        {r.values.map((v, i) => <td key={i} className="px-3 py-1.5 text-fg-2">{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-line px-3 py-2 text-xs"><b>Conclusión:</b> {cmp.verdict}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function CommandCard({ c, open, onToggle, onRelated }: { c: CommandDoc; open: boolean; onToggle: () => void; onRelated: (r: string) => void }) {
  const setTopic = useUI((s) => s.setTopic);
  return (
    <div className="rounded-lg border border-line bg-bg-2">
      <button onClick={() => { onToggle(); setTopic(c.key); }} className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left cursor-pointer" aria-expanded={open}>
        <code className="font-mono text-sm font-semibold text-accent-2">{c.key}</code>
        <Badge tone={c.level === 'Principiante' ? 'green' : c.level === 'Básico' ? 'blue' : c.level === 'Intermedio' ? 'yellow' : 'red'}>{c.level}</Badge>
        <Badge>{c.category}</Badge>
        {c.destructive && <Badge tone="red"><AlertTriangle size={10} /> destructivo</Badge>}
        {c.simulated === false && <Badge tone="purple">solo documentación</Badge>}
        <span className="w-full text-xs leading-relaxed text-fg-2">{c.description}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-4 py-3 text-sm animate-in">
          <Field title="Sintaxis">
            <div className="space-y-1">{c.syntax.map((s) => <CmdLine key={s} cmd={s} send={c.simulated !== false} />)}</div>
          </Field>
          {c.params.length > 0 && (
            <Field title="Parámetros">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                {c.params.map((p) => (
                  <div key={p.flag} className="contents"><dt className="font-mono text-gblue">{p.flag}</dt><dd className="text-fg-2">{p.desc}</dd></div>
                ))}
              </dl>
            </Field>
          )}
          <Field title="Ejemplo"><CmdLine cmd={c.example} send={c.simulated !== false} /></Field>
          <Field title="Resultado"><pre className="whitespace-pre-wrap rounded bg-bg-3 px-2 py-1.5 font-mono text-[11.5px] text-fg-2">{c.result}</pre></Field>
          {c.errors.length > 0 && (
            <Field title="Errores frecuentes">
              <ul className="space-y-1 text-xs">{c.errors.map((e) => <li key={e.error}><span className="font-mono text-gred">{e.error}</span> <span className="text-fg-2">→ {e.fix}</span></li>)}</ul>
            </Field>
          )}
          {c.destructive && <p className="flex gap-2 rounded-md border border-gred/40 bg-gred/8 px-3 py-2 text-xs"><AlertTriangle size={14} className="shrink-0 text-gred" /> {c.destructive}</p>}
          {c.tips && <Field title="Recomendaciones"><ul className="list-disc pl-5 text-xs text-fg-2">{c.tips.map((t) => <li key={t}>{t}</li>)}</ul></Field>}
          {c.related.length > 0 && (
            <Field title="Relacionados">
              <div className="flex flex-wrap gap-1">{c.related.map((r) => <button key={r} onClick={() => onRelated(r)} className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] hover:border-accent cursor-pointer">{r}</button>)}</div>
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</p>
      {children}
    </div>
  );
}

export function CmdLine({ cmd, send = true }: { cmd: string; send?: boolean }) {
  const [copied, setCopied] = useState(false);
  const setPending = useLabs((s) => s.setPendingInput);
  const runnable = send && !/[<>]/.test(cmd.replace(/ >>? /g, ' ')) && !cmd.includes('…');
  return (
    <div className="flex items-center gap-1.5">
      <code className="min-w-0 flex-1 truncate rounded bg-term px-2 py-1 font-mono text-[12px] text-[#7ee787]" title={cmd}>$ {cmd}</code>
      <button
        title="Copiar"
        aria-label={`Copiar ${cmd}`}
        className="rounded p-1 text-muted hover:bg-bg-3 hover:text-fg cursor-pointer"
        onClick={() => {
          navigator.clipboard?.writeText(cmd).catch(() => undefined);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? <Check size={14} className="text-ggreen" /> : <Copy size={14} />}
      </button>
      {runnable && (
        <Button
          size="sm"
          variant="ghost"
          title="Enviar a la terminal interactiva"
          aria-label={`Enviar ${cmd} a la terminal`}
          icon={<Send size={13} />}
          onClick={() => {
            setPending('terminal', cmd);
            navigate('terminal');
          }}
        />
      )}
    </div>
  );
}
