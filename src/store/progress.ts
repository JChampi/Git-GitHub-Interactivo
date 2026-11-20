/**
 * Progreso del estudiante: XP, niveles, módulos, retos, evaluaciones,
 * comandos practicados, tiempo de aprendizaje y logros. Persistente.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CommandRecord } from '../engine/types';
import { safeStorage } from '../lib/storage';
import { ACHIEVEMENTS } from '../data/achievements';

export interface ChallengeResult {
  completedAt: number;
  hintsUsed: number;
  commands: number;
  score: number;
}

export interface EvaluationResult {
  id: string;
  category: string;
  title: string;
  score: number;
  accuracy: number;
  passed: boolean;
  date: number;
  notes: string[];
}

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: 'success' | 'info' | 'achievement' | 'warn';
}

export interface ProgressState {
  xp: number;
  modulesVisited: Record<string, number>;
  modulesCompleted: Record<string, number>;
  challenges: Record<string, ChallengeResult>;
  guided: Record<string, { completedAt: number; hintsUsed: number; score: number }>;
  scenarios: Record<string, { completedAt: number }>;
  evaluations: EvaluationResult[];
  commands: Record<string, number>;
  totalCommands: number;
  failedCommands: number;
  timeSpent: number;
  achievements: Record<string, number>;
  startedAt: number;
  lastActive: number;
  daysActive: string[];
  quizzes: Record<string, { correct: number; total: number }>;
}

interface ProgressStore extends ProgressState {
  toasts: Toast[];
  recordCommands: (records: CommandRecord[]) => void;
  addXP: (amount: number, reason?: string) => void;
  visitModule: (id: string) => void;
  completeModule: (id: string) => void;
  completeChallenge: (id: string, result: Omit<ChallengeResult, 'completedAt'>, xp: number) => void;
  completeGuided: (id: string, hintsUsed: number, score: number, xp: number) => void;
  completeScenario: (id: string, xp: number) => void;
  addEvaluation: (r: EvaluationResult, xp: number) => void;
  answerQuiz: (id: string, correct: boolean) => void;
  tick: (seconds: number) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
  resetProgress: () => void;
}

export const LEVELS = [
  { level: 1, name: 'Principiante', xp: 0 },
  { level: 2, name: 'Aprendiz de Git', xp: 150 },
  { level: 3, name: 'Desarrollador junior', xp: 400 },
  { level: 4, name: 'Colaborador', xp: 800 },
  { level: 5, name: 'Integrador', xp: 1400 },
  { level: 6, name: 'Maestro de Git', xp: 2200 },
];

export function levelFor(xp: number) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) cur = l;
  const next = LEVELS.find((l) => l.xp > xp) ?? null;
  const progress = next ? (xp - cur.xp) / (next.xp - cur.xp) : 1;
  return { ...cur, next, progress };
}

const initial = (): ProgressState => ({
  xp: 0,
  modulesVisited: {},
  modulesCompleted: {},
  challenges: {},
  guided: {},
  scenarios: {},
  evaluations: [],
  commands: {},
  totalCommands: 0,
  failedCommands: 0,
  timeSpent: 0,
  achievements: {},
  startedAt: Date.now(),
  lastActive: Date.now(),
  daysActive: [],
  quizzes: {},
});

let toastId = 1;

export const useProgress = create<ProgressStore>()(
  persist(
    (set, get) => {
      /** Revisa los logros tras cada cambio y muestra los nuevos. */
      const checkAchievements = () => {
        const s = get();
        const unlocked: string[] = [];
        for (const a of ACHIEVEMENTS) {
          if (!s.achievements[a.id] && a.check(s)) unlocked.push(a.id);
        }
        if (!unlocked.length) return;
        const now = Date.now();
        const achievements = { ...s.achievements };
        let bonus = 0;
        for (const id of unlocked) {
          achievements[id] = now;
          bonus += ACHIEVEMENTS.find((a) => a.id === id)!.xp;
        }
        set({ achievements, xp: s.xp + bonus });
        for (const id of unlocked) {
          const a = ACHIEVEMENTS.find((x) => x.id === id)!;
          get().toast({ title: `Logro desbloqueado: ${a.title}`, body: `${a.description} (+${a.xp} XP)`, tone: 'achievement' });
        }
        checkAchievements();
      };

      const gain = (amount: number) => {
        const before = levelFor(get().xp).level;
        set({ xp: get().xp + amount });
        const after = levelFor(get().xp);
        if (after.level > before) get().toast({ title: `¡Subiste a nivel ${after.level}!`, body: after.name, tone: 'success' });
      };

      return {
        ...initial(),
        toasts: [],

        recordCommands(records) {
          if (!records.length) return;
          const s = get();
          const commands = { ...s.commands };
          let newOnes = 0;
          let failed = 0;
          for (const r of records) {
            if (!r.command) continue;
            if (!commands[r.command] && r.ok && r.command.startsWith('git ')) newOnes++;
            commands[r.command] = (commands[r.command] ?? 0) + 1;
            if (!r.ok) failed++;
          }
          const today = new Date().toISOString().slice(0, 10);
          set({
            commands,
            totalCommands: s.totalCommands + records.length,
            failedCommands: s.failedCommands + failed,
            lastActive: Date.now(),
            daysActive: s.daysActive.includes(today) ? s.daysActive : [...s.daysActive, today],
          });
          if (newOnes) gain(newOnes * 5);
          checkAchievements();
        },

        addXP(amount) {
          gain(amount);
          checkAchievements();
        },

        visitModule(id) {
          if (get().modulesVisited[id]) return;
          set({ modulesVisited: { ...get().modulesVisited, [id]: Date.now() } });
          checkAchievements();
        },

        completeModule(id) {
          if (get().modulesCompleted[id]) return;
          set({ modulesCompleted: { ...get().modulesCompleted, [id]: Date.now() } });
          gain(30);
          get().toast({ title: 'Módulo completado', body: '+30 XP', tone: 'success' });
          checkAchievements();
        },

        completeChallenge(id, result, xp) {
          const prev = get().challenges[id];
          if (prev && prev.score >= result.score) return;
          set({ challenges: { ...get().challenges, [id]: { ...result, completedAt: Date.now() } } });
          if (!prev) gain(xp);
          checkAchievements();
        },

        completeGuided(id, hintsUsed, score, xp) {
          const prev = get().guided[id];
          set({ guided: { ...get().guided, [id]: { completedAt: Date.now(), hintsUsed, score: Math.max(score, prev?.score ?? 0) } } });
          if (!prev) gain(xp);
          checkAchievements();
        },

        completeScenario(id, xp) {
          if (get().scenarios[id]) return;
          set({ scenarios: { ...get().scenarios, [id]: { completedAt: Date.now() } } });
          gain(xp);
          checkAchievements();
        },

        addEvaluation(r, xp) {
          const firstPass = r.passed && !get().evaluations.some((e) => e.id === r.id && e.passed);
          set({ evaluations: [r, ...get().evaluations].slice(0, 100) });
          if (firstPass) gain(xp);
          checkAchievements();
        },

        answerQuiz(id, correct) {
          const q = get().quizzes[id] ?? { correct: 0, total: 0 };
          set({ quizzes: { ...get().quizzes, [id]: { correct: q.correct + (correct ? 1 : 0), total: q.total + 1 } } });
          if (correct && q.correct === 0) gain(5);
          checkAchievements();
        },

        tick(seconds) {
          set({ timeSpent: get().timeSpent + seconds });
          if (get().timeSpent % 300 < seconds) checkAchievements();
        },

        toast(t) {
          const id = toastId++;
          set({ toasts: [...get().toasts, { ...t, id }] });
          setTimeout(() => get().dismiss(id), t.tone === 'achievement' ? 6000 : 4000);
        },

        dismiss(id) {
          set({ toasts: get().toasts.filter((t) => t.id !== id) });
        },

        resetProgress() {
          set({ ...initial() });
        },
      };
    },
    {
      name: 'git-lab:progress',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => {
        const { toasts: _t, ...rest } = s;
        void _t;
        return Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== 'function')) as unknown as ProgressState;
      },
    },
  ),
);
