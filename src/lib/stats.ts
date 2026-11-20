import { CHALLENGES } from '../data/challenges';
import { EVALUATIONS } from '../data/evaluations';
import { GUIDED } from '../data/guided';
import { MODULES } from '../data/modules';
import { SCENARIOS } from '../data/scenarios';
import type { ProgressState } from '../store/progress';

export function overallProgress(p: ProgressState) {
  const learn = MODULES.filter((m) => m.countsForProgress);
  const modules = learn.filter((m) => p.modulesCompleted[m.id]).length;
  const challenges = CHALLENGES.filter((c) => p.challenges[c.id]).length;
  const guided = GUIDED.filter((g) => p.guided[g.id]).length;
  const scenarios = SCENARIOS.filter((s) => p.scenarios[s.id]).length;
  const evals = EVALUATIONS.filter((e) => p.evaluations.some((r) => r.id === e.id && r.passed)).length;
  const pct =
    (modules / learn.length) * 40 +
    (challenges / CHALLENGES.length) * 25 +
    (guided / GUIDED.length) * 15 +
    (scenarios / SCENARIOS.length) * 10 +
    (evals / EVALUATIONS.length) * 10;
  return {
    pct: Math.round(pct),
    modules: { done: modules, total: learn.length },
    challenges: { done: challenges, total: CHALLENGES.length },
    guided: { done: guided, total: GUIDED.length },
    scenarios: { done: scenarios, total: SCENARIOS.length },
    evals: { done: evals, total: EVALUATIONS.length },
    pendingModules: learn.filter((m) => !p.modulesCompleted[m.id]),
  };
}

export function accuracy(p: ProgressState) {
  return p.totalCommands ? Math.round(((p.totalCommands - p.failedCommands) / p.totalCommands) * 100) : 0;
}

export function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
