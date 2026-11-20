/**
 * Estado global de los laboratorios. Cada laboratorio tiene su propio mundo
 * simulado (sistema de archivos + repos + servidores), su terminal y su
 * registro de comandos, de modo que se puede reiniciar sin afectar a otros.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { execute, promptParts } from '../engine/shell';
import type { CommandRecord, Line, ShellEvent, World } from '../engine/types';
import { safeStorage } from '../lib/storage';
import { createLabWorld } from '../labs/registry';

export type TermLine =
  | { kind: 'input'; prompt: string; branch: string | null; state: string | null; text: string }
  | { kind: 'output'; line: Line }
  | { kind: 'notice'; text: string; tone: 'info' | 'warn' | 'success' };

export interface LabState {
  world: World;
  lines: TermLine[];
  history: string[];
  log: CommandRecord[];
  createdAt: number;
  updatedAt: number;
  /** Comando pendiente de escribir en la terminal (enviado desde el diccionario, botones, etc.). */
  pendingInput?: string;
  /** Datos propios de la página (paso actual de una lección, eventos de un escenario…). */
  meta?: Record<string, unknown>;
}

export interface SandboxSession {
  id: string;
  name: string;
  createdAt: number;
}

export interface RunResult {
  ok: boolean;
  events: ShellEvent[];
  records: CommandRecord[];
  topic?: string;
}

interface LabsStore {
  labs: Record<string, LabState>;
  sandboxes: SandboxSession[];
  activeSandbox: string;
  ensureLab: (id: string) => LabState;
  run: (id: string, input: string, opts?: { confirmed?: boolean; silent?: boolean }) => RunResult;
  /** Modifica el mundo desde la interfaz (explorador, editor, GitHub simulado...). */
  mutate: (id: string, fn: (world: World) => void, notice?: TermLine) => void;
  setWorld: (id: string, world: World) => void;
  reset: (id: string) => void;
  clear: (id: string) => void;
  notice: (id: string, text: string, tone?: 'info' | 'warn' | 'success') => void;
  setPendingInput: (id: string, input: string | undefined) => void;
  setMeta: (id: string, patch: Record<string, unknown>) => void;
  createSandbox: (name?: string) => string;
  renameSandbox: (id: string, name: string) => void;
  deleteSandbox: (id: string) => void;
  setActiveSandbox: (id: string) => void;
}

const MAX_LINES = 600;
const MAX_LOG = 400;

function freshLab(id: string): LabState {
  const now = Date.now();
  return { world: createLabWorld(id), lines: [], history: [], log: [], createdAt: now, updatedAt: now };
}

function trim<T>(arr: T[], max: number): T[] {
  return arr.length > max ? arr.slice(arr.length - max) : arr;
}

export const useLabs = create<LabsStore>()(
  persist(
    (set, get) => ({
      labs: {},
      sandboxes: [{ id: 'sandbox:1', name: 'Sesión 1', createdAt: Date.now() }],
      activeSandbox: 'sandbox:1',

      ensureLab(id) {
        const existing = get().labs[id];
        if (existing) return existing;
        const lab = placeholders.get(id) ?? freshLab(id);
        placeholders.delete(id);
        set((s) => ({ labs: { ...s.labs, [id]: lab } }));
        return lab;
      },

      run(id, input, opts = {}) {
        const lab = get().ensureLab(id);
        const p = promptParts(lab.world);
        const res = execute(input, lab.world, { history: lab.history, confirmed: opts.confirmed });
        const cleared = res.events.some((e) => e.type === 'clear');
        const inputLine: TermLine = { kind: 'input', prompt: `${p.user}:${p.path}`, branch: p.branch, state: p.state, text: input };
        const out: TermLine[] = res.lines.map((line) => ({ kind: 'output', line }));
        const lines = cleared ? [] : trim([...lab.lines, ...(opts.silent ? [] : [inputLine]), ...out], MAX_LINES);
        const history = input.trim() && lab.history[lab.history.length - 1] !== input ? trim([...lab.history, input], 200) : lab.history;
        set((s) => ({
          labs: {
            ...s.labs,
            [id]: { ...lab, world: res.world, lines, history, log: trim([...lab.log, ...res.records], MAX_LOG), updatedAt: Date.now() },
          },
        }));
        return { ok: res.ok, events: res.events, records: res.records, topic: res.topic };
      },

      mutate(id, fn, notice) {
        const lab = get().ensureLab(id);
        const world = structuredClone(lab.world);
        fn(world);
        set((s) => ({
          labs: { ...s.labs, [id]: { ...lab, world, lines: notice ? trim([...lab.lines, notice], MAX_LINES) : lab.lines, updatedAt: Date.now() } },
        }));
      },

      setWorld(id, world) {
        const lab = get().ensureLab(id);
        set((s) => ({ labs: { ...s.labs, [id]: { ...lab, world, updatedAt: Date.now() } } }));
      },

      reset(id) {
        set((s) => ({ labs: { ...s.labs, [id]: freshLab(id) } }));
      },

      clear(id) {
        const lab = get().ensureLab(id);
        set((s) => ({ labs: { ...s.labs, [id]: { ...lab, lines: [] } } }));
      },

      notice(id, text, tone = 'info') {
        const lab = get().ensureLab(id);
        set((s) => ({ labs: { ...s.labs, [id]: { ...lab, lines: trim([...lab.lines, { kind: 'notice', text, tone }], MAX_LINES) } } }));
      },

      setPendingInput(id, input) {
        const lab = get().ensureLab(id);
        set((s) => ({ labs: { ...s.labs, [id]: { ...lab, pendingInput: input } } }));
      },

      setMeta(id, patch) {
        const lab = get().ensureLab(id);
        set((s) => ({ labs: { ...s.labs, [id]: { ...lab, meta: { ...(lab.meta ?? {}), ...patch } } } }));
      },

      createSandbox(name) {
        const n = get().sandboxes.reduce((m, s) => Math.max(m, parseInt(s.id.split(':')[1], 10) || 0), 0) + 1;
        const id = `sandbox:${n}`;
        set((s) => ({ sandboxes: [...s.sandboxes, { id, name: name || `Sesión ${n}`, createdAt: Date.now() }], activeSandbox: id }));
        get().ensureLab(id);
        return id;
      },

      renameSandbox(id, name) {
        set((s) => ({ sandboxes: s.sandboxes.map((x) => (x.id === id ? { ...x, name: name.trim() || x.name } : x)) }));
      },

      deleteSandbox(id) {
        set((s) => {
          const sandboxes = s.sandboxes.filter((x) => x.id !== id);
          const labs = { ...s.labs };
          delete labs[id];
          const list = sandboxes.length ? sandboxes : [{ id: 'sandbox:1', name: 'Sesión 1', createdAt: Date.now() }];
          return { sandboxes: list, labs, activeSandbox: s.activeSandbox === id ? list[0].id : s.activeSandbox };
        });
      },

      setActiveSandbox(id) {
        set({ activeSandbox: id });
      },
    }),
    {
      name: 'git-lab:labs',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ labs: s.labs, sandboxes: s.sandboxes, activeSandbox: s.activeSandbox }),
    },
  ),
);

/** Hook de conveniencia: devuelve el laboratorio (creándolo si no existe). */
export function useLab(id: string): LabState {
  const lab = useLabs((s) => s.labs[id]);
  if (!lab) {
    // Se crea fuera del render mediante microtarea para no actualizar el store durante el render.
    const fresh = useLabs.getState().labs[id];
    if (!fresh) queueMicrotask(() => useLabs.getState().ensureLab(id));
    return fresh ?? placeholder(id);
  }
  return lab;
}

const placeholders = new Map<string, LabState>();
function placeholder(id: string): LabState {
  if (!placeholders.has(id)) placeholders.set(id, freshLab(id));
  return placeholders.get(id)!;
}
