/** Punto de entrada público del motor de simulación Git. */
export * from './types';
export { execute, promptParts, tokenize, parseSegments, SHELL_COMMANDS } from './shell';
export { analyzeDanger, type DangerInfo } from './danger';
export { complete } from './complete';
export * from './repo';
export * from './server';
export * from './world';
export { GIT_COMMANDS } from './git';
export { diffLines, hunks, splitLines } from './diff';
export { mergeText, hasConflictMarkers } from './merge';
export { parseGitignore, matchIgnore, isIgnored } from './ignore';
export { lineText, linesToText } from './output';
export * as vfs from './vfs';
