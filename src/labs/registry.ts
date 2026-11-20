/**
 * Registro de laboratorios: cada identificador tiene su mundo inicial.
 * Reiniciar un laboratorio vuelve a llamar a su fábrica sin afectar a otros.
 */
import type { World } from '../engine/types';
import { finalize } from '../engine/world';
import { CHALLENGES } from '../data/challenges';
import { GUIDED } from '../data/guided';
import { SCENARIOS } from '../data/scenarios';
import { EVALUATIONS } from '../data/evaluations';
import { UNDO_SCENARIOS } from '../data/undoScenarios';
import * as presets from './presets';

export const MODULE_LABS: Record<string, () => World> = {
  terminal: () => presets.emptyProject(),
  fundamentals: presets.fundamentalsWorld,
  repos: presets.reposWorld,
  history: presets.historyWorld,
  branches: presets.branchesWorld,
  undo: presets.undoWorld,
  remote: presets.remoteWorld,
  github: presets.githubWorld,
  collab: presets.collabWorld,
  conflicts: () => presets.conflictWorld(),
  files: presets.filesWorld,
};

export function createLabWorld(id: string): World {
  const [kind, key] = id.includes(':') ? [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)] : [id, ''];
  let w: World | undefined;
  if (MODULE_LABS[id]) w = MODULE_LABS[id]();
  else if (kind === 'sandbox') w = presets.emptyProject();
  else if (kind === 'challenge') w = CHALLENGES.find((c) => c.id === key)?.setup();
  else if (kind === 'guided') w = GUIDED.find((g) => g.id === key)?.setup();
  else if (kind === 'scenario') w = SCENARIOS.find((s) => s.id === key)?.setup();
  else if (kind === 'eval') w = EVALUATIONS.find((e) => e.id === key)?.setup();
  else if (kind === 'undo-s') w = UNDO_SCENARIOS.find((u) => u.id === key)?.setup();
  else if (kind === 'conflict-custom') w = presets.conflictWorld();
  return finalize(w ?? presets.emptyProject());
}
