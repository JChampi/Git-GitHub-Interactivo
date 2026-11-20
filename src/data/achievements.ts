import type { ProgressState } from '../store/progress';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  xp: number;
  check: (p: ProgressState) => boolean;
}

const used = (p: ProgressState, cmd: string) => (p.commands[cmd] ?? 0) > 0;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-command', title: 'Hola, terminal', description: 'Ejecuta tu primer comando', icon: 'Terminal', xp: 5, check: (p) => p.totalCommands >= 1 },
  { id: 'first-init', title: 'Génesis', description: 'Crea tu primer repositorio con git init', icon: 'FolderGit2', xp: 10, check: (p) => used(p, 'git init') },
  { id: 'first-commit', title: 'Primer commit', description: 'Registra tu primer commit', icon: 'GitCommitHorizontal', xp: 15, check: (p) => used(p, 'git commit') },
  { id: 'brancher', title: 'Ramificador', description: 'Crea ramas y cámbiate entre ellas', icon: 'GitBranch', xp: 15, check: (p) => used(p, 'git branch') && (used(p, 'git switch') || used(p, 'git checkout')) },
  { id: 'merger', title: 'Unificador', description: 'Fusiona una rama con git merge', icon: 'GitMerge', xp: 15, check: (p) => used(p, 'git merge') },
  { id: 'time-traveler', title: 'Viajero en el tiempo', description: 'Usa git reflog para inspeccionar el pasado', icon: 'History', xp: 15, check: (p) => used(p, 'git reflog') },
  { id: 'undo-master', title: 'Ctrl+Z profesional', description: 'Usa restore, reset y revert', icon: 'Undo2', xp: 25, check: (p) => used(p, 'git restore') && used(p, 'git reset') && used(p, 'git revert') },
  { id: 'remote-ready', title: 'Conectado', description: 'Haz push a un repositorio remoto', icon: 'CloudUpload', xp: 15, check: (p) => used(p, 'git push') },
  { id: 'syncer', title: 'Sincronizado', description: 'Usa fetch y pull', icon: 'RefreshCw', xp: 15, check: (p) => used(p, 'git fetch') && used(p, 'git pull') },
  { id: 'explorer', title: 'Explorador', description: 'Usa 15 comandos de Git distintos', icon: 'Compass', xp: 30, check: (p) => Object.keys(p.commands).filter((c) => c.startsWith('git ')).length >= 15 },
  { id: 'polyglot', title: 'Políglota de Git', description: 'Usa 25 comandos de Git distintos', icon: 'Languages', xp: 50, check: (p) => Object.keys(p.commands).filter((c) => c.startsWith('git ')).length >= 25 },
  { id: 'hundred', title: 'Cien comandos', description: 'Ejecuta 100 comandos', icon: 'Keyboard', xp: 20, check: (p) => p.totalCommands >= 100 },
  { id: 'learner', title: 'Errar es aprender', description: 'Comete 10 errores (¡y aprende de ellos!)', icon: 'Lightbulb', xp: 10, check: (p) => p.failedCommands >= 10 },
  { id: 'challenge-1', title: 'Primer reto', description: 'Supera tu primer reto práctico', icon: 'Flag', xp: 15, check: (p) => Object.keys(p.challenges).length >= 1 },
  { id: 'challenge-5', title: 'Retador', description: 'Supera 5 retos', icon: 'Trophy', xp: 40, check: (p) => Object.keys(p.challenges).length >= 5 },
  { id: 'challenge-all', title: 'Imparable', description: 'Supera todos los retos', icon: 'Crown', xp: 100, check: (p) => Object.keys(p.challenges).length >= 12 },
  { id: 'no-hints', title: 'Sin ayuda', description: 'Supera un reto sin usar pistas', icon: 'Brain', xp: 20, check: (p) => Object.values(p.challenges).some((c) => c.hintsUsed === 0) },
  { id: 'guided-1', title: 'Paso a paso', description: 'Completa una lección guiada', icon: 'Footprints', xp: 15, check: (p) => Object.keys(p.guided).length >= 1 },
  { id: 'scenario-1', title: 'Como en el trabajo', description: 'Completa un escenario real', icon: 'Briefcase', xp: 25, check: (p) => Object.keys(p.scenarios).length >= 1 },
  { id: 'team-player', title: 'Jugador de equipo', description: 'Completa todos los escenarios reales', icon: 'Users', xp: 80, check: (p) => Object.keys(p.scenarios).length >= 5 },
  { id: 'evaluated', title: 'Aprobado', description: 'Aprueba una evaluación', icon: 'BadgeCheck', xp: 20, check: (p) => p.evaluations.some((e) => e.passed) },
  { id: 'perfect', title: 'Matrícula de honor', description: 'Obtén 100 en una evaluación', icon: 'Star', xp: 30, check: (p) => p.evaluations.some((e) => e.score === 100) },
  { id: 'all-categories', title: 'Dominio total', description: 'Aprueba evaluaciones de las 10 categorías', icon: 'Medal', xp: 100, check: (p) => new Set(p.evaluations.filter((e) => e.passed).map((e) => e.category)).size >= 10 },
  { id: 'curious', title: 'Curioso', description: 'Visita 10 módulos distintos', icon: 'Eye', xp: 15, check: (p) => Object.keys(p.modulesVisited).length >= 10 },
  { id: 'dedicated', title: 'Dedicación', description: 'Practica durante 30 minutos', icon: 'Clock', xp: 25, check: (p) => p.timeSpent >= 1800 },
  { id: 'conflict-solver', title: 'Diplomático', description: 'Resuelve un conflicto de fusión y completa el merge', icon: 'Swords', xp: 25, check: (p) => !!p.modulesCompleted['conflictos'] || !!p.challenges['c-conflict'] },
];
