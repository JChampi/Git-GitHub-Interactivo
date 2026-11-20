import { ArgError } from '../args';
import type { GitCtx } from './context';
import {
  gitAdd,
  gitCatFile,
  gitCommit,
  gitConfig,
  gitDiff,
  gitHashObject,
  gitInit,
  gitLog,
  gitLsFiles,
  gitMv,
  gitRevParse,
  gitRm,
  gitShow,
  gitStatus,
} from './basic';
import { gitBranch, gitCheckout, gitCherryPick, gitMerge, gitMergetool, gitRebase, gitRevert, gitStash, gitSwitch, gitTag } from './branch';
import { gitClean, gitReflog, gitReset, gitRestore } from './undo';
import { gitClone, gitFetch, gitPull, gitPush, gitRemote } from './remote';

type Handler = (ctx: GitCtx, argv: string[]) => void;

export const GIT_COMMANDS: Record<string, { handler: Handler; summary: string; group: string }> = {
  init: { handler: gitInit, summary: 'Crea un repositorio Git vacío', group: 'Empezar' },
  clone: { handler: gitClone, summary: 'Clona un repositorio remoto en una carpeta nueva', group: 'Empezar' },
  config: { handler: gitConfig, summary: 'Lee o modifica la configuración (user.name, user.email...)', group: 'Empezar' },
  add: { handler: gitAdd, summary: 'Añade cambios al staging area', group: 'Cambios' },
  mv: { handler: gitMv, summary: 'Mueve o renombra un archivo rastreado', group: 'Cambios' },
  restore: { handler: gitRestore, summary: 'Restaura archivos del working directory o del staging', group: 'Cambios' },
  rm: { handler: gitRm, summary: 'Elimina archivos del working directory y del índice', group: 'Cambios' },
  status: { handler: gitStatus, summary: 'Muestra el estado del working directory y del staging', group: 'Examinar' },
  diff: { handler: gitDiff, summary: 'Muestra diferencias entre commits, staging y working directory', group: 'Examinar' },
  log: { handler: gitLog, summary: 'Muestra el historial de commits', group: 'Examinar' },
  show: { handler: gitShow, summary: 'Muestra un commit, una etiqueta o un archivo de un commit', group: 'Examinar' },
  reflog: { handler: gitReflog, summary: 'Historial de movimientos de HEAD (para recuperar trabajo)', group: 'Examinar' },
  commit: { handler: gitCommit, summary: 'Registra los cambios preparados en el repositorio', group: 'Historial' },
  branch: { handler: gitBranch, summary: 'Lista, crea, renombra o elimina ramas', group: 'Historial' },
  switch: { handler: gitSwitch, summary: 'Cambia de rama', group: 'Historial' },
  checkout: { handler: gitCheckout, summary: 'Cambia de rama o restaura archivos (forma clásica)', group: 'Historial' },
  merge: { handler: gitMerge, summary: 'Fusiona otra rama en la actual', group: 'Historial' },
  mergetool: { handler: gitMergetool, summary: 'Abre la herramienta visual para resolver conflictos', group: 'Historial' },
  rebase: { handler: gitRebase, summary: 'Reaplica commits encima de otra base', group: 'Historial' },
  'cherry-pick': { handler: gitCherryPick, summary: 'Aplica los cambios de commits concretos', group: 'Historial' },
  revert: { handler: gitRevert, summary: 'Crea un commit que deshace otro commit', group: 'Historial' },
  reset: { handler: gitReset, summary: 'Mueve HEAD/la rama y opcionalmente staging y archivos', group: 'Historial' },
  tag: { handler: gitTag, summary: 'Crea, lista o elimina etiquetas', group: 'Historial' },
  stash: { handler: gitStash, summary: 'Guarda temporalmente cambios sin confirmar', group: 'Historial' },
  clean: { handler: gitClean, summary: 'Elimina archivos sin rastrear', group: 'Cambios' },
  remote: { handler: gitRemote, summary: 'Gestiona los repositorios remotos', group: 'Colaborar' },
  fetch: { handler: gitFetch, summary: 'Descarga objetos y referencias del remoto', group: 'Colaborar' },
  pull: { handler: gitPull, summary: 'Descarga e integra cambios del remoto (fetch + merge)', group: 'Colaborar' },
  push: { handler: gitPush, summary: 'Sube tus commits al remoto', group: 'Colaborar' },
  'ls-files': { handler: gitLsFiles, summary: 'Lista los archivos del índice', group: 'Interno' },
  'rev-parse': { handler: gitRevParse, summary: 'Traduce referencias a SHA', group: 'Interno' },
  'cat-file': { handler: gitCatFile, summary: 'Muestra el contenido de un objeto Git', group: 'Interno' },
  'hash-object': { handler: gitHashObject, summary: 'Calcula el SHA de un archivo como blob', group: 'Interno' },
};

const ALIASES: Record<string, string> = {};

function gitHelp(ctx: GitCtx, argv: string[]) {
  const { out } = ctx;
  const cmd = argv.find((a) => !a.startsWith('-'));
  if (cmd) {
    const c = GIT_COMMANDS[cmd];
    if (!c) {
      out.error(`No manual entry for git-${cmd}`);
      return;
    }
    out.line([`GIT-${cmd.toUpperCase()}(1)`, 'bold']);
    out.blank();
    out.line(`git ${cmd} — ${c.summary}`);
    out.hint('La explicación completa (sintaxis, parámetros, ejemplos y errores frecuentes) aparece en el panel contextual.');
    return;
  }
  out.text('usage: git [-v | --version] [-h | --help] <command> [<args>]\n\nThese are common Git commands used in various situations:');
  const groups: Record<string, string[]> = {};
  for (const [name, c] of Object.entries(GIT_COMMANDS)) (groups[c.group] ??= []).push(name);
  for (const [g, cmds] of Object.entries(groups)) {
    out.blank();
    out.line([g, 'bold']);
    for (const name of cmds) out.line(['   ' + name.padEnd(13), 'cyan'], GIT_COMMANDS[name].summary);
  }
  out.blank();
  out.line("'git help <command>' muestra la ayuda de un comando concreto.");
}

export function runGit(ctx: GitCtx, argv: string[]): string {
  const { out } = ctx;
  if (!argv.length) {
    gitHelp(ctx, []);
    return 'git';
  }
  const first = argv[0];
  if (first === '--version' || first === '-v' || first === 'version') {
    out.line('git version 2.47.1 (simulador educativo)');
    return 'git --version';
  }
  if (first === 'help' || first === '--help' || first === '-h') {
    gitHelp(ctx, argv.slice(1));
    return argv[1] ? `git ${argv[1]}` : 'git help';
  }
  let sub = first;
  let rest = argv.slice(1);
  // Alias definidos con git config alias.x
  const alias = ctx.world.globalConfig[`alias.${sub}`] ?? ALIASES[sub];
  if (alias && !GIT_COMMANDS[sub]) {
    const parts = alias.split(/\s+/);
    sub = parts[0];
    rest = [...parts.slice(1), ...rest];
  }
  if (rest.includes('--help') || rest.includes('-h')) {
    gitHelp(ctx, [sub]);
    return `git ${sub}`;
  }
  const cmd = GIT_COMMANDS[sub];
  if (!cmd) {
    out.error(`git: '${sub}' is not a git command. See 'git --help'.`);
    const similar = closest(sub, Object.keys(GIT_COMMANDS));
    if (similar) out.text(`\nThe most similar command is\n\t${similar}`);
    return 'git';
  }
  try {
    cmd.handler(ctx, rest);
  } catch (e) {
    if (e instanceof ArgError) {
      out.error(e.message);
      out.hint(`Opción no reconocida para git ${sub}. Consulta la sintaxis con: git help ${sub}`);
    } else {
      out.error(`error interno del simulador: ${(e as Error).message}`);
      console.error(e);
    }
  }
  return `git ${sub}`;
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

export function closest(word: string, options: string[]): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const o of options) {
    const d = levenshtein(word, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return bestD <= 2 ? best : null;
}
