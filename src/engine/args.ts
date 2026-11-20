/**
 * Analizador de argumentos al estilo de Git:
 *   -m "msg"  -m"msg"  --message=msg  --message msg  -am "msg"  -- rutas
 */

export interface ArgSpec {
  /** Opciones booleanas (sin "-"), p. ej. ["a", "all", "amend"]. */
  bool?: string[];
  /** Opciones que reciben valor, p. ej. ["m", "message"]. */
  value?: string[];
  /** Alias: { a: "all" } para normalizar nombres. */
  alias?: Record<string, string>;
  /** Opciones cuyo valor es opcional cuando se usa "--opcion=valor" (p. ej. --source). */
}

export interface ParsedArgs {
  flags: Record<string, string | boolean>;
  /** Valores repetidos (p. ej. varios -m). */
  multi: Record<string, string[]>;
  positional: string[];
  /** Argumentos después de "--". */
  paths: string[];
  dashDash: boolean;
}

export class ArgError extends Error {}

export function parseArgs(argv: string[], spec: ArgSpec): ParsedArgs {
  const bool = new Set(spec.bool ?? []);
  const value = new Set(spec.value ?? []);
  const alias = spec.alias ?? {};
  const res: ParsedArgs = { flags: {}, multi: {}, positional: [], paths: [], dashDash: false };
  const canon = (n: string) => alias[n] ?? n;
  const set = (name: string, v: string | boolean) => {
    const c = canon(name);
    res.flags[c] = v;
    if (typeof v === 'string') (res.multi[c] ??= []).push(v);
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (res.dashDash) {
      res.paths.push(arg);
      continue;
    }
    if (arg === '--') {
      res.dashDash = true;
      continue;
    }
    if (arg.startsWith('--') && arg.length > 2) {
      const eq = arg.indexOf('=');
      const name = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
      if (value.has(name) || value.has(canon(name))) {
        if (eq >= 0) set(name, arg.slice(eq + 1));
        else {
          const v = argv[++i];
          if (v === undefined) throw new ArgError(`error: option \`${name}' requires a value`);
          set(name, v);
        }
      } else if (bool.has(name) || bool.has(canon(name))) {
        if (eq >= 0) throw new ArgError(`error: option \`${name}' takes no value`);
        set(name, true);
      } else if (name.startsWith('no-') && (bool.has(name.slice(3)) || bool.has(canon(name.slice(3))))) {
        set(name.slice(3), false);
      } else {
        throw new ArgError(`error: unknown option \`${name}'`);
      }
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1 && !/^-\d+$/.test(arg)) {
      // Opciones cortas agrupadas: -am "msg", -fd
      const letters = arg.slice(1);
      for (let k = 0; k < letters.length; k++) {
        const ch = letters[k];
        if (value.has(ch) || value.has(canon(ch))) {
          const rest = letters.slice(k + 1);
          if (rest) set(ch, rest);
          else {
            const v = argv[++i];
            if (v === undefined) throw new ArgError(`error: switch \`${ch}' requires a value`);
            set(ch, v);
          }
          break;
        }
        if (bool.has(ch) || bool.has(canon(ch))) set(ch, true);
        else throw new ArgError(`error: unknown switch \`${ch}'`);
      }
      continue;
    }
    if (/^-\d+$/.test(arg) && (value.has('n') || value.has('max-count'))) {
      set('n', arg.slice(1));
      continue;
    }
    res.positional.push(arg);
  }
  return res;
}
