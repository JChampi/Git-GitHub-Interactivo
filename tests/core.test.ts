import { describe, expect, it } from 'vitest';
import { hashBlob, sha1 } from '../src/engine/sha1';
import { diffLines, hunks } from '../src/engine/diff';
import { mergeText } from '../src/engine/merge';
import { isIgnored, parseGitignore } from '../src/engine/ignore';
import { parseSegments, tokenize } from '../src/engine/shell';
import { parseArgs } from '../src/engine/args';
import { normalize, resolvePath } from '../src/engine/vfs';

describe('sha1 / blobs', () => {
  it('calcula SHA-1 estándar', () => {
    expect(sha1('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha1('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });
  it('hashea blobs igual que git hash-object', () => {
    expect(hashBlob('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    expect(hashBlob('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });
});

describe('diff', () => {
  it('detecta líneas añadidas y eliminadas', () => {
    const ops = diffLines('a\nb\nc\n', 'a\nB\nc\nd\n');
    expect(ops.filter((o) => o.type === 'del').map((o) => o.text)).toEqual(['b']);
    expect(ops.filter((o) => o.type === 'add').map((o) => o.text)).toEqual(['B', 'd']);
  });
  it('agrupa hunks con contexto', () => {
    const old = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n') + '\n';
    const neu = old.replace('l2\n', 'X\n').replace('l17\n', 'Y\n');
    const hs = hunks(diffLines(old, neu));
    expect(hs).toHaveLength(2);
    expect(hs[0].oldStart).toBe(1);
  });
});

describe('merge de tres vías', () => {
  const base = 'uno\ndos\ntres\ncuatro\n';
  it('combina cambios en zonas distintas', () => {
    const r = mergeText(base, 'UNO\ndos\ntres\ncuatro\n', 'uno\ndos\ntres\nCUATRO\n');
    expect(r.clean).toBe(true);
    expect(r.content).toBe('UNO\ndos\ntres\nCUATRO\n');
  });
  it('genera marcadores cuando ambos cambian la misma línea', () => {
    const r = mergeText(base, 'uno\nDOS-A\ntres\ncuatro\n', 'uno\nDOS-B\ntres\ncuatro\n', 'HEAD', 'feature');
    expect(r.clean).toBe(false);
    expect(r.content).toBe('uno\n<<<<<<< HEAD\nDOS-A\n=======\nDOS-B\n>>>>>>> feature\ntres\ncuatro\n');
  });
  it('acepta cambios idénticos en ambos lados', () => {
    const r = mergeText(base, 'uno\nX\ntres\ncuatro\n', 'uno\nX\ntres\ncuatro\n');
    expect(r.clean).toBe(true);
  });
  it('combina inserciones en extremos distintos', () => {
    const r = mergeText(base, 'cero\n' + base, base + 'cinco\n');
    expect(r.content).toBe('cero\nuno\ndos\ntres\ncuatro\ncinco\n');
  });
});

describe('.gitignore', () => {
  const rules = parseGitignore('node_modules/\n*.log\n!importante.log\n/build\n**/temp\n.env\n');
  it.each([
    ['node_modules/react/index.js', true],
    ['src/node_modules/x.js', true],
    ['error.log', true],
    ['logs/debug.log', true],
    ['importante.log', false],
    ['build/app.js', true],
    ['src/build/app.js', false],
    ['a/b/temp', true],
    ['.env', true],
    ['src/app.js', false],
  ])('%s → %s', (path, expected) => {
    expect(isIgnored(rules, path)).toBe(expected);
  });
});

describe('intérprete de comandos', () => {
  it('respeta comillas', () => {
    expect(tokenize('git commit -m "hola mundo"')).toEqual([
      { type: 'word', value: 'git' },
      { type: 'word', value: 'commit' },
      { type: 'word', value: '-m' },
      { type: 'word', value: 'hola mundo' },
    ]);
  });
  it('separa operadores y redirecciones', () => {
    const segs = parseSegments('echo "hola" > a.txt && git add a.txt; ls');
    expect(segs).toHaveLength(3);
    expect(segs[0].redirect).toEqual({ mode: '>', path: 'a.txt' });
    expect(segs[0].next).toBe('&&');
  });
  it('detecta comillas sin cerrar', () => {
    expect(() => tokenize('git commit -m "sin cerrar')).toThrow();
  });
  it('analiza opciones agrupadas de git', () => {
    const a = parseArgs(['-am', 'mensaje', '--', 'x'], { bool: ['a'], value: ['m'] });
    expect(a.flags).toMatchObject({ a: true, m: 'mensaje' });
    expect(a.paths).toEqual(['x']);
  });
  it('normaliza rutas', () => {
    expect(normalize('/a/b/../c/./d/')).toBe('/a/c/d');
    expect(resolvePath('/home/x/p', '../q', '/home/x')).toBe('/home/x/q');
    expect(resolvePath('/tmp', '~/r', '/home/x')).toBe('/home/x/r');
  });
});
