/**
 * Interpretación de archivos .gitignore (subconjunto fiel de la sintaxis):
 *  - comentarios (#) y líneas vacías
 *  - comodines *, ?, **
 *  - "/" inicial: patrón anclado a la carpeta del .gitignore
 *  - "/" final: solo coincide con carpetas
 *  - "!" niega un patrón anterior
 */

export interface IgnoreRule {
  pattern: string;
  negate: boolean;
  dirOnly: boolean;
  regex: RegExp;
  /** Carpeta (relativa a la raíz del repo) donde está el .gitignore. */
  base: string;
  source: string;
  line: number;
}

function globToRegex(glob: string, anchored: boolean): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // "**/" coincide con cero o más carpetas; "**" final con todo.
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else re += '[^/]*';
    } else if (ch === '?') re += '[^/]';
    else if ('.+^$(){}|[]\\'.includes(ch)) re += '\\' + ch;
    else re += ch;
  }
  const prefix = anchored ? '^' : '^(?:.*/)?';
  // Un patrón que coincide con una carpeta ignora todo su contenido.
  return new RegExp(prefix + re + '(?:/.*)?$');
}

export function parseGitignore(content: string, base = '', source = '.gitignore'): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  content.split('\n').forEach((raw, idx) => {
    let line = raw.replace(/\s+$/, '');
    if (!line || line.startsWith('#')) return;
    let negate = false;
    if (line.startsWith('!')) {
      negate = true;
      line = line.slice(1);
    }
    let dirOnly = false;
    if (line.endsWith('/')) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    let anchored = line.includes('/') && !line.startsWith('**/');
    if (line.startsWith('/')) line = line.slice(1);
    if (!line) return;
    if (line.startsWith('**/')) anchored = false;
    rules.push({
      pattern: raw.trim(),
      negate,
      dirOnly,
      regex: globToRegex(line, anchored),
      base,
      source,
      line: idx + 1,
    });
  });
  return rules;
}

/**
 * Devuelve la regla que decide el resultado para `path` (relativo al repo) o
 * null si ninguna coincide. La última regla coincidente gana.
 */
export function matchIgnore(rules: IgnoreRule[], path: string): IgnoreRule | null {
  let decision: IgnoreRule | null = null;
  for (const rule of rules) {
    let rel = path;
    if (rule.base) {
      if (!path.startsWith(rule.base + '/')) continue;
      rel = path.slice(rule.base.length + 1);
    }
    if (rule.dirOnly) {
      // Solo coincide si alguna carpeta contenedora cumple el patrón.
      const parts = rel.split('/');
      let ok = false;
      for (let i = 1; i < parts.length; i++) {
        const dir = parts.slice(0, i).join('/');
        if (rule.regex.test(dir)) ok = true;
      }
      if (!ok) continue;
    } else if (!rule.regex.test(rel)) continue;
    decision = rule;
  }
  return decision;
}

export function isIgnored(rules: IgnoreRule[], path: string): boolean {
  const r = matchIgnore(rules, path);
  return !!r && !r.negate;
}
