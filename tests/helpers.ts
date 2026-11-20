import { execute } from '../src/engine/shell';
import { linesToText } from '../src/engine/output';
import { createWorld } from '../src/engine/world';
import type { World } from '../src/engine/types';
import { findRepo } from '../src/engine/repo';

export interface Session {
  world: World;
  /** Ejecuta un comando; devuelve la salida como texto. */
  run(cmd: string): { text: string; ok: boolean };
  /** Ejecuta varios comandos y falla si alguno no tiene éxito. */
  ok(...cmds: string[]): string;
  repo(): NonNullable<ReturnType<typeof findRepo>>;
  file(path: string): string | undefined;
}

export function session(world: World = createWorld({ deterministic: true, dirs: ['proyecto'], cwd: 'proyecto' })): Session {
  const s: Session = {
    world,
    run(cmd) {
      const r = execute(cmd, s.world, { confirmed: true });
      s.world = r.world;
      return { text: linesToText(r.lines), ok: r.ok };
    },
    ok(...cmds) {
      let all = '';
      for (const c of cmds) {
        const r = s.run(c);
        if (!r.ok) throw new Error(`"${c}" falló:\n${r.text}`);
        all += r.text + '\n';
      }
      return all;
    },
    repo() {
      const r = findRepo(s.world);
      if (!r) throw new Error('no repo');
      return r;
    },
    file(path) {
      const abs = path.startsWith('/') ? path : `${s.world.cwd}/${path}`;
      return s.world.fs.files[abs];
    },
  };
  return s;
}
