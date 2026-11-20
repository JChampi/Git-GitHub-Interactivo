import type { ComponentType } from 'react';
import {
  BookOpen,
  BookText,
  Briefcase,
  ClipboardCheck,
  Compass,
  FileCog,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  LayoutDashboard,
  type LucideIcon,
  Route,
  Server,
  Swords,
  Terminal,
  Trophy,
  TrendingUp,
  Undo2,
  Users,
  Box,
} from 'lucide-react';
import { Github } from '../components/icons';

export interface ModuleDef {
  id: string;
  label: string;
  icon: LucideIcon | ComponentType<{ size?: number; className?: string }>;
  group: 'Inicio' | 'Aprender' | 'Practicar' | 'Seguimiento';
  description: string;
  /** Laboratorio principal del módulo (si tiene). */
  lab?: string;
  /** Cuenta para el porcentaje de avance. */
  countsForProgress?: boolean;
}

export const MODULES: ModuleDef[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Inicio', description: 'Tu punto de partida' },
  { id: 'fundamentos', label: 'Fundamentos de Git', icon: BookOpen, group: 'Aprender', description: 'Control de versiones, repositorio, commit, rama, HEAD y los tres estados', lab: 'fundamentals', countsForProgress: true },
  { id: 'terminal', label: 'Terminal interactiva', icon: Terminal, group: 'Aprender', description: 'Ejecuta comandos Git reales sobre un repositorio simulado', lab: 'terminal', countsForProgress: true },
  { id: 'repositorios', label: 'Repositorios', icon: FolderGit2, group: 'Aprender', description: 'Explorador de archivos y estados de cada archivo', lab: 'repos', countsForProgress: true },
  { id: 'historial', label: 'Commits e historial', icon: GitCommitHorizontal, group: 'Aprender', description: 'Crear commits, leer el historial, SHA, autores y diferencias', lab: 'history', countsForProgress: true },
  { id: 'ramas', label: 'Ramas', icon: GitBranch, group: 'Aprender', description: 'Crear, cambiar, fusionar y eliminar ramas. HEAD y punteros', lab: 'branches', countsForProgress: true },
  { id: 'deshacer', label: 'Deshacer cambios', icon: Undo2, group: 'Aprender', description: 'restore, reset, revert, reflog y clean sin miedo', lab: 'undo', countsForProgress: true },
  { id: 'remoto', label: 'Git remoto', icon: Server, group: 'Aprender', description: 'remote, fetch, pull y push con un remoto simulado', lab: 'remote', countsForProgress: true },
  { id: 'github', label: 'GitHub', icon: Github, group: 'Aprender', description: 'Repositorios, PRs, issues, forks, Actions, Pages y permisos', lab: 'github', countsForProgress: true },
  { id: 'colaboracion', label: 'Colaboración', icon: Users, group: 'Aprender', description: 'Varios desarrolladores, un repositorio central y buenas prácticas', lab: 'collab', countsForProgress: true },
  { id: 'conflictos', label: 'Conflictos', icon: Swords, group: 'Aprender', description: 'Por qué aparecen y cómo resolverlos', lab: 'conflicts', countsForProgress: true },
  { id: 'workflows', label: 'Workflows', icon: Route, group: 'Aprender', description: 'GitHub Flow, Git Flow y Trunk-Based paso a paso', countsForProgress: true },
  { id: 'archivos', label: 'Archivos importantes', icon: FileCog, group: 'Aprender', description: '.gitignore, README, .gitattributes, .gitkeep, .gitmodules y hooks', lab: 'files', countsForProgress: true },
  { id: 'sandbox', label: 'Modo libre', icon: Box, group: 'Practicar', description: 'Experimenta sin instrucciones ni límites' },
  { id: 'guiado', label: 'Modo guiado', icon: Compass, group: 'Practicar', description: 'Lecciones paso a paso con validación' },
  { id: 'escenarios', label: 'Escenarios reales', icon: Briefcase, group: 'Practicar', description: 'Simulación de un equipo profesional' },
  { id: 'retos', label: 'Retos prácticos', icon: Trophy, group: 'Practicar', description: 'Desafíos progresivos con validación automática' },
  { id: 'evaluaciones', label: 'Evaluaciones', icon: ClipboardCheck, group: 'Practicar', description: 'Mide tu dominio real por categorías' },
  { id: 'progreso', label: 'Progreso', icon: TrendingUp, group: 'Seguimiento', description: 'Estadísticas, nivel y logros' },
  { id: 'diccionario', label: 'Diccionario de comandos', icon: BookText, group: 'Seguimiento', description: 'Chuleta interactiva y buscador por situaciones' },
];

export const GitMergeIcon = GitMerge;

export function moduleById(id: string) {
  return MODULES.find((m) => m.id === id);
}
