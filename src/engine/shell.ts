/**
 * Intérprete de comandos tipo Bash: tokenización con comillas, operadores
 * && ; || y redirecciones > >>, comandos del sistema de archivos y git.
 */
import { closest, runGit } from './git';
import type { GitCtx } from './git/context';
import { Out } from './output';
import { currentBranch, findRepo, headSha, short } from './repo';
import { runGh } from './gh';
import type { CommandRecord, ExecResult, ShellEvent, World } from './types';
import {
  basename,
  dirname,
  exists,
  isDir,
  isFile,
  listDir,
  mkdirp,
  move,
  normalize,
  remove,
  resolvePath,
  writeFile,
} from './vfs';

export type Token = { type: 'word'; value: string } | { type: 'op'; value: '&&' | '||' | ';' | '>' | '>>' | '|' };

export class ParseError extends Error {}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let cur = '';
  let inWord = false;
  let i = 0;
  const push = () => {
    if (inWord) tokens.push({ type: 'word', value: cur });
    cur = '';
    inWord = false;
  };
  while (i < input.length) {
    const ch = input[i];
    if (ch === "'") {
      const end = input.indexOf("'", i + 1);
      if (end === -1) throw new ParseError('bash: unexpected EOF while looking for matching `\'\'');
      cur += input.slice(i + 1, end);
      inWord = true;
      i = end + 1;
      continue;
    }
    if (ch === '"') {
      i++;
      inWord = true;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < input.length && '"\\$`'.includes(input[i + 1])) {
          cur += input[i + 1];
          i += 2;
        } else cur += input[i++];
      }
      if (i >= input.length) throw new ParseError('bash: unexpected EOF while looking for matching `"\'');
      i++;
      continue;
    }
    if (ch === '\\' && i + 1 < input.length) {
      cur += input[i + 1];
      inWord = true;
      i += 2;
      continue;
    }
    if (/\s/.test(ch)) {
      push();
      i++;
      continue;
    }
    const two = input.slice(i, i + 2);
    if (two === '&&' || two === '||' || two === '>>') {
      push();
      tokens.push({ type: 'op', value: two as '&&' | '||' | '>>' });
      i += 2;
      continue;
    }
    if (ch === ';' || ch === '>' || ch === '|') {
      push();
      tokens.push({ type: 'op', value: ch as ';' | '>' | '|' });
      i++;
      continue;
    }
    if (ch === '#' && !inWord) break; // comentario
    cur += ch;
    inWord = true;
    i++;
  }
  push();
  return tokens;
}

export interface Segment {
  argv: string[];
  redirect?: { mode: '>' | '>>'; path: string };
  /** Operador que conecta con el siguiente segmento. */
  next?: '&&' | '||' | ';' | '|';
}

export function parseSegments(input: string): Segment[] {
  const tokens = tokenize(input);
  const segs: Segment[] = [];
  let cur: Segment = { argv: [] };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'word') cur.argv.push(t.value);
    else if (t.value === '>' || t.value === '>>') {
      const target = tokens[i + 1];
      if (!target || target.type !== 'word') throw new ParseError("bash: syntax error near unexpected token `newline'");
      cur.redirect = { mode: t.value, path: target.value };
      i++;
    } else {
      if (!cur.argv.length) throw new ParseError(`bash: syntax error near unexpected token \`${t.value}'`);
      cur.next = t.value;
      segs.push(cur);
      cur = { argv: [] };
    }
  }
  if (cur.argv.length) segs.push(cur);
  return segs;
}

export const SHELL_COMMANDS: Record<string, string> = {
  ls: 'Lista archivos y carpetas (-a muestra ocultos, -l en detalle)',
  cd: 'Cambia de carpeta (cd .. sube un nivel, cd ~ va al inicio)',
  pwd: 'Muestra la carpeta actual',
  cat: 'Muestra el contenido de un archivo',
  echo: 'Imprime texto; con > o >> lo escribe en un archivo',
  touch: 'Crea un archivo vacío (o actualiza su fecha)',
  mkdir: 'Crea una carpeta (-p crea las intermedias)',
  rm: 'Elimina archivos (-r carpetas, -f sin preguntar). ¡No hay papelera!',
  rmdir: 'Elimina una carpeta vacía',
  mv: 'Mueve o renombra archivos',
  cp: 'Copia archivos',
  tree: 'Muestra la estructura de carpetas',
  nano: 'Abre un archivo en el editor del laboratorio (también: code, vim, edit)',
  clear: 'Limpia la terminal (también Ctrl+L)',
  history: 'Muestra el historial de comandos',
  whoami: 'Muestra el usuario actual',
  help: 'Muestra esta ayuda',
  git: 'Sistema de control de versiones (git help para ver los subcomandos)',
  gh: 'CLI de GitHub simulada (gh repo create, gh pr create, gh pr merge, gh issue create...)',
};

interface ShellCtx extends GitCtx {
  history: string[];
  /** Salida "cruda" para redirecciones (echo -n no añade salto de línea). */
  rawStdout?: string;
}

function shellError(ctx: ShellCtx, msg: string) {
  ctx.out.error(msg);
}

function runBuiltin(ctx: ShellCtx, argv: string[], stdinText?: string): string {
  const [cmd, ...args] = argv;
  const { world, out } = ctx;
  const res = (p: string) => resolvePath(world.cwd, p, world.home);
  const flags = args.filter((a) => /^-[a-zA-Z]+$/.test(a)).join('');
  const operands = args.filter((a) => !/^-[a-zA-Z]+$/.test(a));

  switch (cmd) {
    case 'pwd':
      out.line(world.cwd);
      return cmd;
    case 'whoami':
      out.line('estudiante');
      return cmd;
    case 'date':
      out.line(new Date().toString());
      return cmd;
    case 'cd': {
      const target = res(operands[0] ?? '~');
      if (!exists(world.fs, target)) shellError(ctx, `bash: cd: ${operands[0]}: No such file or directory`);
      else if (!isDir(world.fs, target)) shellError(ctx, `bash: cd: ${operands[0]}: Not a directory`);
      else world.cwd = target;
      return cmd;
    }
    case 'ls': {
      const all = flags.includes('a');
      const long = flags.includes('l');
      const targets = operands.length ? operands : ['.'];
      for (const t of targets) {
        const p = res(t);
        if (!exists(world.fs, p)) {
          shellError(ctx, `ls: cannot access '${t}': No such file or directory`);
          continue;
        }
        if (targets.length > 1) out.line(`${t}:`);
        if (isFile(world.fs, p)) {
          out.line(basename(p));
          continue;
        }
        const entries = listDir(world.fs, p).filter((e) => all || !e.name.startsWith('.'));
        const items = [...entries.map((e) => ({ name: e.name, dir: e.type === 'dir', size: e.type === 'file' ? world.fs.files[e.path].length : 4096 }))];
        if (all) {
          if (world.repos[p]) items.unshift({ name: '.git', dir: true, size: 4096 });
          items.unshift({ name: '..', dir: true, size: 4096 }, { name: '.', dir: true, size: 4096 });
        }
        if (long) {
          out.line(`total ${items.length}`);
          for (const it of items) {
            out.line(`${it.dir ? 'drwxr-xr-x' : '-rw-r--r--'} 1 estudiante estudiante ${String(it.size).padStart(5)} `, [it.name, it.dir ? 'blue' : undefined]);
          }
        } else if (items.length) {
          out.line(...items.flatMap((it, i) => [[it.name + (i < items.length - 1 ? '  ' : ''), it.dir ? 'blue' : undefined] as [string, 'blue' | undefined]]));
        }
      }
      return cmd;
    }
    case 'cat': {
      if (!operands.length && stdinText !== undefined) {
        out.text(stdinText.replace(/\n$/, ''));
        return cmd;
      }
      for (const f of operands) {
        const p = res(f);
        if (isDir(world.fs, p)) shellError(ctx, `cat: ${f}: Is a directory`);
        else if (!isFile(world.fs, p)) shellError(ctx, `cat: ${f}: No such file or directory`);
        else {
          const c = world.fs.files[p];
          if (c) out.text(c.replace(/\n$/, ''));
        }
      }
      return cmd;
    }
    case 'echo': {
      let words = args;
      let newline = true;
      let escapes = false;
      while (words[0] === '-n' || words[0] === '-e') {
        if (words[0] === '-n') newline = false;
        else escapes = true;
        words = words.slice(1);
      }
      let text = words.join(' ');
      if (escapes) text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      out.text(text);
      ctx.rawStdout = text + (newline ? '\n' : '');
      return cmd;
    }
    case 'touch': {
      if (!operands.length) shellError(ctx, 'touch: missing file operand');
      for (const f of operands) {
        const p = res(f);
        if (!isDir(world.fs, dirname(p))) {
          shellError(ctx, `touch: cannot touch '${f}': No such file or directory`);
          continue;
        }
        if (!exists(world.fs, p)) writeFile(world.fs, p, '');
      }
      return cmd;
    }
    case 'mkdir': {
      if (!operands.length) shellError(ctx, 'mkdir: missing operand');
      for (const d of operands) {
        const p = res(d);
        if (exists(world.fs, p)) {
          if (!flags.includes('p')) shellError(ctx, `mkdir: cannot create directory '${d}': File exists`);
          continue;
        }
        if (!flags.includes('p') && !isDir(world.fs, dirname(p))) {
          shellError(ctx, `mkdir: cannot create directory '${d}': No such file or directory`);
          continue;
        }
        mkdirp(world.fs, p);
      }
      return cmd;
    }
    case 'rm': {
      const recursive = flags.includes('r') || flags.includes('R');
      const force = flags.includes('f');
      if (!operands.length && !force) shellError(ctx, 'rm: missing operand');
      for (const f of operands) {
        const p = res(f);
        if (!exists(world.fs, p)) {
          if (!force) shellError(ctx, `rm: cannot remove '${f}': No such file or directory`);
          continue;
        }
        if (isDir(world.fs, p) && !recursive) {
          shellError(ctx, `rm: cannot remove '${f}': Is a directory`);
          continue;
        }
        if (p === '/' || p === world.home) {
          shellError(ctx, `rm: refusing to remove '${f}' (protección del laboratorio)`);
          continue;
        }
        if (world.repos[p]) delete world.repos[p];
        if (normalize(world.cwd).startsWith(p + '/') || world.cwd === p) world.cwd = dirname(p);
        remove(world.fs, p);
      }
      return cmd;
    }
    case 'rmdir': {
      for (const d of operands) {
        const p = res(d);
        if (!isDir(world.fs, p)) shellError(ctx, `rmdir: failed to remove '${d}': No such file or directory`);
        else if (listDir(world.fs, p).length || world.repos[p]) shellError(ctx, `rmdir: failed to remove '${d}': Directory not empty`);
        else remove(world.fs, p);
      }
      return cmd;
    }
    case 'mv':
    case 'cp': {
      if (operands.length < 2) {
        shellError(ctx, `${cmd}: missing destination file operand after '${operands[0] ?? ''}'`);
        return cmd;
      }
      const dst = res(operands[operands.length - 1]);
      for (const s of operands.slice(0, -1)) {
        const src = res(s);
        if (!exists(world.fs, src)) {
          shellError(ctx, `${cmd}: cannot stat '${s}': No such file or directory`);
          continue;
        }
        const finalDst = isDir(world.fs, dst) ? `${dst}/${basename(src)}` : dst;
        if (!isDir(world.fs, dirname(finalDst))) {
          shellError(ctx, `${cmd}: cannot move '${s}' to '${operands[operands.length - 1]}': No such file or directory`);
          continue;
        }
        if (cmd === 'mv') move(world.fs, src, finalDst);
        else if (isFile(world.fs, src)) writeFile(world.fs, finalDst, world.fs.files[src]);
        else if (!recursiveCopy(world, src, finalDst, flags.includes('r') || flags.includes('R'))) shellError(ctx, `cp: -r not specified; omitting directory '${s}'`);
      }
      return cmd;
    }
    case 'tree': {
      const root = res(operands[0] ?? '.');
      if (!isDir(world.fs, root)) {
        shellError(ctx, `${operands[0]} [error opening dir]`);
        return cmd;
      }
      out.line([operands[0] ?? '.', 'blue']);
      let dirs = 0;
      let files = 0;
      const walk = (p: string, prefix: string) => {
        const entries = listDir(world.fs, p).filter((e) => flags.includes('a') || !e.name.startsWith('.'));
        entries.forEach((e, i) => {
          const last = i === entries.length - 1;
          out.line(prefix + (last ? '└── ' : '├── '), [e.name, e.type === 'dir' ? 'blue' : undefined]);
          if (e.type === 'dir') {
            dirs++;
            walk(e.path, prefix + (last ? '    ' : '│   '));
          } else files++;
        });
      };
      walk(root, '');
      out.blank();
      out.line(`${dirs} directories, ${files} files`);
      return cmd;
    }
    case 'nano':
    case 'vim':
    case 'vi':
    case 'code':
    case 'edit': {
      const f = operands[0];
      if (!f) {
        shellError(ctx, `${cmd}: indica el archivo a editar, por ejemplo: ${cmd} README.md`);
        return cmd;
      }
      const p = res(f);
      if (isDir(world.fs, p)) {
        shellError(ctx, `${cmd}: ${f}: Is a directory`);
        return cmd;
      }
      if (!isDir(world.fs, dirname(p))) {
        shellError(ctx, `${cmd}: ${f}: No such file or directory`);
        return cmd;
      }
      if (!exists(world.fs, p)) writeFile(world.fs, p, '');
      ctx.events.push({ type: 'open-editor', path: p });
      out.line(['Abriendo ' + f + ' en el editor del laboratorio…', 'dim']);
      return 'editor';
    }
    case 'clear':
      ctx.events.push({ type: 'clear' });
      return cmd;
    case 'history':
      ctx.history.forEach((h, i) => out.line(['  ' + String(i + 1).padStart(3) + '  ', 'dim'], h));
      return cmd;
    case 'help':
      out.line(['Comandos disponibles en la terminal del laboratorio:', 'bold']);
      for (const [c, d] of Object.entries(SHELL_COMMANDS)) out.line(['  ' + c.padEnd(9), 'cyan'], d);
      out.blank();
      out.line(['Operadores: ', 'bold'], 'cmd1 && cmd2 · cmd1 ; cmd2 · echo "texto" > archivo · echo "más" >> archivo');
      out.line(['Atajos: ', 'bold'], '↑/↓ historial · Tab autocompletar · Ctrl+L limpiar · Ctrl+C cancelar');
      return cmd;
    case 'head':
    case 'tail': {
      const nIdx = args.indexOf('-n');
      const n = nIdx >= 0 ? parseInt(args[nIdx + 1], 10) : 10;
      const files = args.filter((a, i) => !a.startsWith('-') && !(nIdx >= 0 && i === nIdx + 1));
      const text = files.length ? world.fs.files[res(files[0])] : stdinText;
      if (text === undefined) {
        shellError(ctx, `${cmd}: cannot open '${files[0]}' for reading: No such file or directory`);
        return cmd;
      }
      const lines = text.replace(/\n$/, '').split('\n');
      out.text((cmd === 'head' ? lines.slice(0, n) : lines.slice(-n)).join('\n'));
      return cmd;
    }
    case 'grep': {
      const pattern = operands[0];
      if (!pattern) {
        shellError(ctx, 'Usage: grep PATTERN [FILE]...');
        return cmd;
      }
      const ci = flags.includes('i');
      const sources = operands.slice(1).length ? operands.slice(1).map((f) => [f, world.fs.files[res(f)]] as const) : [['(stdin)', stdinText] as const];
      for (const [name, text] of sources) {
        if (text === undefined) {
          shellError(ctx, `grep: ${name}: No such file or directory`);
          continue;
        }
        for (const l of text.split('\n')) {
          if ((ci ? l.toLowerCase().includes(pattern.toLowerCase()) : l.includes(pattern))) out.line(sources.length > 1 ? `${name}:` : '', l);
        }
      }
      return cmd;
    }
    default: {
      shellError(ctx, `bash: ${cmd}: command not found`);
      const sug = closest(cmd, [...Object.keys(SHELL_COMMANDS), 'git']);
      if (sug) out.hint(`¿Quisiste decir "${sug}"?`);
      else if (/^(add|commit|status|push|pull|init|log|branch|merge|checkout|switch|clone)$/.test(cmd)) out.hint(`Los comandos de Git empiezan por "git": git ${cmd}`);
      else out.hint('Escribe "help" para ver los comandos disponibles.');
      return cmd;
    }
  }
}

function recursiveCopy(world: World, src: string, dst: string, recursive: boolean): boolean {
  if (!recursive) return false;
  mkdirp(world.fs, dst);
  for (const d of Object.keys(world.fs.dirs)) if (d.startsWith(src + '/')) mkdirp(world.fs, dst + d.slice(src.length));
  for (const f of Object.keys(world.fs.files)) if (f.startsWith(src + '/')) writeFile(world.fs, dst + f.slice(src.length), world.fs.files[f]);
  return true;
}

/** Ejecuta una línea de comandos y devuelve el nuevo estado del mundo. */
export function execute(input: string, world: World, opts: { history?: string[]; confirmed?: boolean } = {}): ExecResult {
  const next: World = structuredClone(world);
  const events: ShellEvent[] = [];
  const lines: ExecResult['lines'] = [];
  const records: CommandRecord[] = [];
  let segments: Segment[];
  try {
    segments = parseSegments(input);
  } catch (e) {
    return { world, lines: [[{ t: (e as Error).message, c: 'error' }]], ok: false, events, records };
  }
  let lastOk = true;
  let topic: string | undefined;
  let skip = false;
  let pipeText: string | undefined;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prevOp = i > 0 ? segments[i - 1].next : undefined;
    if (prevOp === '&&' && !lastOk) skip = true;
    else if (prevOp === '||' && lastOk) skip = true;
    else if (prevOp !== '|') skip = false;
    if (skip) continue;

    const out = new Out();
    const ctx: ShellCtx = { world: next, out, events, history: opts.history ?? [], confirmed: opts.confirmed };
    const [cmd, ...rest] = seg.argv;
    let command: string;
    if (cmd === 'git') command = runGit(ctx, rest);
    else if (cmd === 'gh') command = runGh(ctx, rest);
    else command = runBuiltin(ctx, seg.argv, prevOp === '|' ? pipeText : undefined);
    topic = command === 'editor' ? topic : command;

    let produced = out.lines;
    if (seg.redirect) {
      const target = resolvePath(next.cwd, seg.redirect.path, next.home);
      if (isDir(next.fs, target)) {
        out.error(`bash: ${seg.redirect.path}: Is a directory`);
        produced = out.lines.filter((l) => l.some((s) => s.c === 'error'));
      } else if (!isDir(next.fs, dirname(target))) {
        out.error(`bash: ${seg.redirect.path}: No such file or directory`);
        produced = out.lines.filter((l) => l.some((s) => s.c === 'error'));
      } else {
        const textOut =
          ctx.rawStdout ??
          out.lines
            .filter((l) => !l.some((s) => s.c === 'error' || s.c === 'hint'))
            .map((l) => l.map((s) => s.t).join(''))
            .join('\n') + (out.lines.length ? '\n' : '');
        const prev = seg.redirect.mode === '>>' ? next.fs.files[target] ?? '' : '';
        writeFile(next.fs, target, prev + textOut);
        produced = out.lines.filter((l) => l.some((s) => s.c === 'error' || s.c === 'hint'));
      }
    }
    if (seg.next === '|') {
      pipeText = out.lines
        .filter((l) => !l.some((s) => s.c === 'hint'))
        .map((l) => l.map((s) => s.t).join(''))
        .join('\n');
      produced = out.lines.filter((l) => l.some((s) => s.c === 'error'));
    }
    lines.push(...produced);
    lastOk = out.ok;
    records.push({ input: seg.argv.join(' '), command, argv: seg.argv, ok: out.ok, timestamp: Date.now() });
  }
  return { world: next, lines, ok: lastOk, events, topic, records };
}

/** Texto del prompt: estudiante@git-lab:~/proyecto (main)$ */
export function promptParts(world: World): { user: string; path: string; branch: string | null; state: string | null } {
  const home = world.home;
  const path = world.cwd === home ? '~' : world.cwd.startsWith(home + '/') ? '~' + world.cwd.slice(home.length) : world.cwd;
  const repo = findRepo(world);
  let branch: string | null = null;
  let state: string | null = null;
  if (repo) {
    branch = currentBranch(repo) ?? `(${short(headSha(repo) ?? '')}...)`;
    if (repo.operation) state = repo.operation.kind === 'merge' ? 'MERGING' : repo.operation.kind === 'rebase' ? 'REBASE' : repo.operation.kind.toUpperCase();
  }
  return { user: 'estudiante@git-lab', path, branch, state };
}
