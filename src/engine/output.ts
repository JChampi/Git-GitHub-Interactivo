import type { Color, Line, Seg } from './types';

export type SegInput = string | [string, Color | undefined] | Seg;

/** Construye una línea a partir de fragmentos: "texto" o ["texto", "green"]. */
export function L(...parts: SegInput[]): Line {
  return parts.map((p) => {
    if (typeof p === 'string') return { t: p };
    if (Array.isArray(p)) return { t: p[0], c: p[1] };
    return p;
  });
}

/** Convierte un texto multilínea en líneas con un único color. */
export function text(str: string, c?: Color): Line[] {
  return str.split('\n').map((t) => [{ t, c }]);
}

export class Out {
  lines: Line[] = [];
  ok = true;

  line(...parts: SegInput[]): this {
    this.lines.push(L(...parts));
    return this;
  }
  text(str: string, c?: Color): this {
    this.lines.push(...text(str, c));
    return this;
  }
  blank(): this {
    this.lines.push([{ t: '' }]);
    return this;
  }
  /** Mensaje de error estilo Git ("fatal: ..." / "error: ..."). Marca el resultado como fallido. */
  error(str: string): this {
    this.ok = false;
    this.lines.push(...text(str, 'error'));
    return this;
  }
  /** Pista educativa en español (no forma parte de la salida real de Git). */
  hint(str: string): this {
    this.lines.push(...str.split('\n').map((t, i) => [{ t: (i === 0 ? '💡 ' : '   ') + t, c: 'hint' as Color }]));
    return this;
  }
  push(lines: Line[]): this {
    this.lines.push(...lines);
    return this;
  }
}

export function lineText(line: Line): string {
  return line.map((s) => s.t).join('');
}

export function linesToText(lines: Line[]): string {
  return lines.map(lineText).join('\n');
}
