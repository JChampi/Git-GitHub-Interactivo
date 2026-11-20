/**
 * Terminal interactiva conectada al motor de simulación.
 * Historial (↑/↓), autocompletado (Tab), Ctrl+L, Ctrl+C, confirmación de
 * operaciones destructivas y explicación contextual del último comando.
 */
import { AlertTriangle, Eraser, RotateCcw, ShieldAlert, TerminalSquare } from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { analyzeDanger, type DangerInfo } from '../engine/danger';
import { complete } from '../engine/complete';
import { promptParts } from '../engine/shell';
import type { Color, Line } from '../engine/types';
import { useLab, useLabs, type TermLine } from '../store/labs';
import { useProgress } from '../store/progress';
import { useUI } from '../store/ui';
import { Button, ConfirmDialog, cx } from './ui';

const COLOR: Record<Color, string> = {
  red: 'text-[#ff7b72]',
  green: 'text-[#7ee787]',
  yellow: 'text-[#e3b341]',
  blue: 'text-[#79c0ff]',
  cyan: 'text-[#56d4dd]',
  magenta: 'text-[#d2a8ff]',
  dim: 'text-[#6e7681]',
  bold: 'font-bold text-[#e6edf3]',
  error: 'text-[#ff7b72]',
  hint: 'text-[#d2a8ff] italic',
  prompt: 'text-[#7ee787]',
};

function OutLine({ line }: { line: Line }) {
  return (
    <div className="min-h-[1.25em] whitespace-pre-wrap break-words">
      {line.map((s, i) => (
        <span key={i} className={s.c ? COLOR[s.c] : undefined}>
          {s.t}
        </span>
      ))}
    </div>
  );
}

function Prompt({ user, path, branch, state }: { user: string; path: string; branch: string | null; state: string | null }) {
  return (
    <span className="shrink-0 select-none">
      <span className="text-[#7ee787]">{user}</span>
      <span className="text-[#6e7681]">:</span>
      <span className="text-[#79c0ff]">{path}</span>
      {branch && (
        <span className="text-[#e3b341]">
          {' '}({branch}
          {state && <span className="text-[#ff7b72]">|{state}</span>})
        </span>
      )}
      <span className="text-[#c9d1d9]">$ </span>
    </span>
  );
}

function TermRow({ l }: { l: TermLine }) {
  if (l.kind === 'output') return <OutLine line={l.line} />;
  if (l.kind === 'notice') {
    return (
      <div className={cx('my-1 rounded border-l-2 px-2 py-0.5 text-[12px]', l.tone === 'warn' ? 'border-[#e3b341] text-[#e3b341]' : l.tone === 'success' ? 'border-[#7ee787] text-[#7ee787]' : 'border-[#79c0ff] text-[#79c0ff]')}>
        {l.text}
      </div>
    );
  }
  const [user, path] = l.prompt.split(':');
  return (
    <div className="flex flex-wrap whitespace-pre-wrap break-all">
      <Prompt user={user} path={path} branch={l.branch} state={l.state} />
      <span className="text-[#e6edf3]">{l.text}</span>
    </div>
  );
}

export interface TerminalProps {
  labId: string;
  className?: string;
  title?: string;
  suggestions?: string[];
  onOpenFile?: (path: string) => void;
  onMergetool?: (path: string) => void;
  onReset?: () => void;
  /** Se llama después de cada comando ejecutado. */
  onCommand?: (input: string, ok: boolean) => void;
  autoFocus?: boolean;
  welcome?: string;
}

export function Terminal({ labId, className, title, suggestions, onOpenFile, onMergetool, onReset, onCommand, autoFocus, welcome }: TerminalProps) {
  const lab = useLab(labId);
  const run = useLabs((s) => s.run);
  const clear = useLabs((s) => s.clear);
  const setPending = useLabs((s) => s.setPendingInput);
  const recordCommands = useProgress((s) => s.recordCommands);
  const setTopic = useUI((s) => s.setTopic);
  const [input, setInput] = useState('');
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [danger, setDanger] = useState<{ input: string; info: DangerInfo[] } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prompt = useMemo(() => promptParts(lab.world), [lab.world]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lab.lines.length, options, danger]);

  useEffect(() => {
    if (lab.pendingInput !== undefined) {
      setInput(lab.pendingInput);
      setPending(labId, undefined);
      inputRef.current?.focus();
    }
  }, [lab.pendingInput, labId, setPending]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const execute = (cmd: string, confirmed = false) => {
    const res = run(labId, cmd, { confirmed });
    recordCommands(res.records);
    if (res.topic) setTopic(res.topic);
    for (const e of res.events) {
      if (e.type === 'open-editor') onOpenFile?.(e.path);
      if (e.type === 'open-mergetool') onMergetool?.(e.path);
    }
    onCommand?.(cmd, res.ok);
  };

  const submit = () => {
    const cmd = input.trim();
    setOptions([]);
    setHistIdx(null);
    if (!cmd) {
      run(labId, '');
      setInput('');
      return;
    }
    const info = analyzeDanger(lab.world, cmd);
    if (info.length) {
      setDanger({ input: cmd, info });
      setInput('');
      return;
    }
    setInput('');
    execute(cmd);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (danger) {
      if (e.key === 'y' || e.key === 's' || e.key === 'Enter') {
        e.preventDefault();
        const d = danger;
        setDanger(null);
        execute(d.input, true);
      } else if (e.key === 'n' || e.key === 'Escape') {
        e.preventDefault();
        cancelDanger();
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!lab.history.length) return;
      const idx = histIdx === null ? lab.history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(idx);
      setInput(lab.history[idx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx === null) return;
      const idx = histIdx + 1;
      if (idx >= lab.history.length) {
        setHistIdx(null);
        setInput('');
      } else {
        setHistIdx(idx);
        setInput(lab.history[idx]);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const c = complete(lab.world, input);
      setInput(c.line);
      setOptions(c.options.slice(0, 40));
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      clear(labId);
    } else if (e.key === 'c' && e.ctrlKey && !window.getSelection()?.toString()) {
      e.preventDefault();
      useLabs.getState().notice(labId, `^C  ${input}`, 'info');
      setInput('');
    } else if (options.length) setOptions([]);
  };

  const cancelDanger = () => {
    if (!danger) return;
    useLabs.getState().notice(labId, `Comando cancelado: ${danger.input}`, 'info');
    setDanger(null);
  };

  return (
    <div className={cx('flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-term shadow-inner', className)} onClick={() => !window.getSelection()?.toString() && inputRef.current?.focus({ preventScroll: true })}>
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#11161d] px-3 py-1.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <TerminalSquare size={13} className="ml-1 text-[#8b949e]" />
        <span className="truncate font-mono text-[11px] text-[#8b949e]">{title ?? `bash — ${prompt.path}`}</span>
        <div className="ml-auto flex gap-1">
          <button title="Limpiar terminal (Ctrl+L)" aria-label="Limpiar terminal" className="rounded p-1 text-[#8b949e] hover:bg-white/10 hover:text-white cursor-pointer" onClick={(e) => { e.stopPropagation(); clear(labId); }}>
            <Eraser size={13} />
          </button>
          {onReset && (
            <button title="Reiniciar laboratorio" aria-label="Reiniciar laboratorio" className="rounded p-1 text-[#8b949e] hover:bg-white/10 hover:text-white cursor-pointer" onClick={(e) => { e.stopPropagation(); setConfirmReset(true); }}>
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[12.5px] leading-[1.45] text-[#c9d1d9]" role="log" aria-label="Salida de la terminal">
        {!lab.lines.length && (
          <div className="mb-2 text-[#6e7681]">
            {welcome ?? 'Terminal simulada del laboratorio. Escribe help para ver los comandos o git help para Git.'}
            <br />
            <span className="text-[#484f58]">↑/↓ historial · Tab autocompletar · Ctrl+L limpiar</span>
          </div>
        )}
        {lab.lines.map((l, i) => (
          <TermRow key={i} l={l} />
        ))}
        {options.length > 0 && <div className="my-1 flex flex-wrap gap-x-4 text-[#79c0ff]">{options.map((o) => <span key={o}>{o}</span>)}</div>}
        {danger && (
          <div className="my-2 rounded-md border border-[#e3b341]/50 bg-[#e3b341]/10 p-3 font-sans text-[13px] text-[#e6edf3]" role="alertdialog" aria-label="Confirmar operación destructiva">
            <p className="flex items-center gap-2 font-semibold text-[#e3b341]">
              <ShieldAlert size={16} /> Operación potencialmente destructiva
            </p>
            <p className="mt-1 font-mono text-[12px] text-[#c9d1d9]">$ {danger.input}</p>
            {danger.info.map((d, i) => (
              <div key={i} className="mt-2">
                <p className={cx('flex items-center gap-1.5 font-medium', d.severity === 'high' ? 'text-[#ff7b72]' : 'text-[#e3b341]')}>
                  <AlertTriangle size={13} /> {d.title}
                </p>
                <ul className="ml-5 mt-1 list-disc space-y-0.5 text-[12.5px] text-[#c9d1d9]">
                  {d.details.map((x, j) => (
                    <li key={j}>{x}</li>
                  ))}
                </ul>
                <p className="mt-1 text-[12px] text-[#8b949e]">Recuperación: {d.recovery}</p>
              </div>
            ))}
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); const d = danger; setDanger(null); execute(d.input, true); }}>
                Ejecutar de todos modos (s)
              </Button>
              <Button size="sm" variant="ghost" className="text-[#c9d1d9]" onClick={(e) => { e.stopPropagation(); cancelDanger(); }}>
                Cancelar (n)
              </Button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center">
          <Prompt {...prompt} />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            aria-label="Comando"
            className="min-w-[8ch] flex-1 bg-transparent font-mono text-[#e6edf3] caret-[#f0883e] outline-none"
          />
        </div>
      </div>
      {suggestions && suggestions.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto border-t border-white/10 bg-[#11161d] px-2 py-1.5">
          {suggestions.map((s, i) => (
            <button
              key={s + i}
              onClick={(e) => {
                e.stopPropagation();
                setInput(s);
                inputRef.current?.focus();
              }}
              className="shrink-0 rounded border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-[#c9d1d9] hover:border-[#f0883e]/60 hover:text-white cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={confirmReset}
        title="Reiniciar laboratorio"
        danger
        confirmLabel="Reiniciar"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          onReset?.();
        }}
      >
        <p>Se perderá el estado actual de este laboratorio (archivos, commits, ramas y terminal) y volverá a su estado inicial.</p>
        <p>Los demás laboratorios y tu progreso no se verán afectados.</p>
      </ConfirmDialog>
    </div>
  );
}
