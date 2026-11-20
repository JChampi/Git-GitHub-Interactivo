/**
 * Valida el contenido educativo: cada laboratorio se construye sin errores,
 * sus objetivos NO están cumplidos al empezar y las soluciones propuestas
 * los cumplen realmente con el motor de simulación.
 */
import { describe, expect, it } from 'vitest';
import { CHALLENGES } from '../src/data/challenges';
import { GUIDED } from '../src/data/guided';
import { EVALUATIONS, scoreEvaluation } from '../src/data/evaluations';
import { SCENARIOS } from '../src/data/scenarios';
import { MODULE_LABS, createLabWorld } from '../src/labs/registry';
import { execute } from '../src/engine/shell';
import { linesToText } from '../src/engine/output';
import type { CommandRecord, World } from '../src/engine/types';
import { getServer, mergePullRequest } from '../src/engine/server';
import { findRepo } from '../src/engine/repo';

function runAll(w: World, cmds: string[], log: CommandRecord[] = []) {
  for (const c of cmds) {
    const r = execute(c, w, { confirmed: true });
    w = r.world;
    log.push(...r.records);
  }
  return { w, log };
}

describe('laboratorios de los módulos', () => {
  for (const id of [...Object.keys(MODULE_LABS), 'sandbox:1']) {
    it(`construye "${id}"`, () => {
      const w = createLabWorld(id);
      expect(w.home).toBe('/home/estudiante');
    });
  }
});

describe('retos', () => {
  for (const c of CHALLENGES) {
    it(`${c.id}: empieza sin resolver y la solución funciona`, () => {
      let w = c.setup();
      expect(c.checks.every((k) => k.test(w, []))).toBe(false);
      const cmds = c.solution.filter((s) => !s.startsWith('(') && !s.includes('mergetool')).map((s) => s.replace(/\s+\(.*\)$/, '').replace(/\s{2,}\(.*$/, ''));
      const log: CommandRecord[] = [];
      for (const cmd of cmds) {
        const r = execute(cmd, w, { confirmed: true });
        w = r.world;
        log.push(...r.records);
        if (c.automate) c.automate(w);
        if (c.id === 'c-conflict' && cmd.startsWith('git merge')) {
          // Resolución manual del conflicto
          const res = execute('echo -e "const titulo = \\"Tienda Online\\";\\nconst precio = 10;\\nconst moneda = \\"USD\\";" > config.js', w);
          w = res.world;
        }
        if (c.id === 'c-pr-flow' && cmd.startsWith('gh pr create')) {
          const s = getServer(w, 'https://github.com/equipo/tienda-web.git')!;
          c.automate!(w);
          const m = mergePullRequest(w, s, s.pulls[0].number, { by: 'estudiante', method: 'merge' });
          expect('sha' in m).toBe(true);
        }
      }
      const failing = c.checks.filter((k) => !k.test(w, log)).map((k) => k.label);
      expect(failing, linesToText([])).toEqual([]);
    });
  }
});

describe('lecciones guiadas', () => {
  const solutions: Record<string, string[][]> = {
    'g-first-repo': [['git init'], ['git status'], ['echo "# Hola" > README.md'], ['git add README.md'], ['git status'], ['git commit -m "docs: readme"'], ['git log']],
    'g-branches': [['git branch'], ['git switch -c feature/saludo'], ['echo hola > saludo.js', 'git add saludo.js', 'git commit -m "feat: saludo"'], ['git log --oneline --graph --all'], ['git switch main'], ['git merge feature/saludo'], ['git branch -d feature/saludo']],
    'g-undo': [
      ['echo "export const DEBUG = true;" > config.js'],
      ['git diff'],
      ['git restore config.js'],
      ['echo x > secreto.txt', 'git add secreto.txt'],
      ['git restore --staged secreto.txt'],
      ['git reset --soft HEAD~1'],
      ['echo "export function restar(a, b) { return a - b; }" > resta.js', 'git add resta.js', 'git commit -m "feat: función restar"'],
      ['git revert HEAD~1 --no-edit'],
    ],
    'g-remote': [['gh repo create proyecto --public'], ['git remote add origin https://github.com/estudiante/proyecto.git'], ['git push -u origin main'], ['git fetch'], ['git pull'], ['echo x >> README.md', 'git commit -am "docs: x"', 'git push']],
    'g-history': [['git log --oneline'], ['git log --author=Ana'], ['git show HEAD~1'], ['git diff v0.1.0 HEAD'], ['git log --oneline -- index.html']],
  };
  for (const g of GUIDED) {
    it(`${g.id}: cada paso se valida con su solución`, () => {
      let w = g.setup();
      const steps = solutions[g.id];
      expect(steps).toHaveLength(g.steps.length);
      g.steps.forEach((step, i) => {
        step.onEnter?.(w);
        const { w: next, log } = runAll(w, steps[i]);
        w = next;
        expect(step.validate(w, log), `${g.id} paso ${i + 1}: ${step.title}`).toBe(true);
      });
    });
  }
});

describe('evaluaciones', () => {
  const solutions: Record<string, string[]> = {
    'e-fund-states': ['git init', 'git add .', 'git commit -m "feat: versión inicial"'],
    'e-repos-untrack': ['git rm --cached config.local.json', 'echo config.local.json > .gitignore', 'git add .gitignore', 'git commit -m "chore: deja de rastrear config local"'],
    'e-commits-atomic': ['git add app.js', 'git commit -m "fix: corrige bug"', 'git add README.md', 'git commit -m "docs: instalación"'],
    'e-branch-fix': ['git switch -c fix/titulo', 'echo -e "<h1>Bienvenida a Mi Tienda</h1>" > index.html', 'git commit -am "fix: título"', 'git switch main', 'git merge fix/titulo', 'git branch -d fix/titulo'],
    'e-recovery-discard': ['git restore app.js'],
    'e-recovery-deleted': ['git restore README.md'],
    'e-remote-sync': ['git pull', 'git push'],
    'e-conflict-both': ['git merge feature/desarrollador-b', 'echo -e "const productos = [\\n  \\"Camiseta\\",\\n  \\"Taza\\",\\n  \\"Gorra\\",\\n];" > config.js', 'git add config.js', 'git commit -m "merge"'],
    'e-workflow-hotfix': ['git switch main', 'git switch -c hotfix/precio', 'echo "export const total = (p, iva) => p * (1 + iva);" > precio.js', 'git commit -am "fix: cálculo del precio"', 'git switch main', 'git merge hotfix/precio', 'git tag -a v1.0.1 -m "v1.0.1"', 'git switch develop', 'git merge hotfix/precio', 'git branch -d hotfix/precio'],
  };
  for (const ev of EVALUATIONS) {
    const sol = solutions[ev.id];
    if (!sol) continue;
    it(`${ev.id}: la solución obtiene la máxima puntuación`, () => {
      const { w, log } = runAll(ev.setup(), sol);
      const r = scoreEvaluation(ev, w, log, true);
      expect(r.goals.filter((g) => !g.passed).map((g) => g.label)).toEqual([]);
      expect(r.passed).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(90);
    });
  }
  it('penaliza operaciones destructivas en recuperación', () => {
    const ev = EVALUATIONS.find((e) => e.id === 'e-recovery-discard')!;
    const { w, log } = runAll(ev.setup(), ['git reset --hard']);
    const r = scoreEvaluation(ev, w, log, true);
    expect(r.passed).toBe(false);
    expect(r.notes.join(' ')).toContain('reset --hard');
  });
});

describe('escenarios reales', () => {
  it('todos se construyen y su primer paso arranca', () => {
    for (const s of SCENARIOS) {
      const w = s.setup();
      expect(getServer(w, s.repoUrl)).not.toBeNull();
      s.steps[0].onEnter?.(w);
    }
  });
  it('escenario C: el revisor pide cambios y luego aprueba', () => {
    const sc = SCENARIOS.find((s) => s.id === 's-pr')!;
    let { w } = runAll(sc.setup(), ['git clone https://github.com/equipo/tienda-web.git', 'cd tienda-web', 'git switch -c feature/carrito', 'echo x > carrito.js', 'git add .', 'git commit -m "feat: carrito"', 'git push -u origin feature/carrito', 'gh pr create --title Carrito --body x']);
    const ev1 = sc.automate!(w);
    expect(ev1[0].text).toContain('Solicité cambios');
    ({ w } = runAll(w, ['mkdir tests', 'echo t > tests/carrito.test.js', 'git add .', 'git commit -m "test: carrito"', 'git push']));
    expect(sc.steps[4].validate!(w, [])).toBe(true);
    const ev2 = sc.automate!(w);
    expect(ev2[0].text).toContain('aprobado');
    ({ w } = runAll(w, ['gh pr merge 1', 'git switch main', 'git pull']));
    expect(sc.steps[6].validate!(w, [])).toBe(true);
    expect(findRepo(w)!.heads.main).toBe(getServer(w, sc.repoUrl)!.heads.main);
  });
  it('escenario D: produce un conflicto real al hacer pull', () => {
    const sc = SCENARIOS.find((s) => s.id === 's-conflict')!;
    let { w } = runAll(sc.setup(), ['git clone https://github.com/equipo/tienda-web.git', 'cd tienda-web']);
    const css = w.fs.files['/home/estudiante/tienda-web/styles.css'];
    w.fs.files['/home/estudiante/tienda-web/styles.css'] = css.replace(/(h1 \{\n\s*color: )[^;]+;/, '$1green;');
    ({ w } = runAll(w, ['git commit -am "style: verde"']));
    expect(sc.steps[1].validate!(w, [])).toBe(true);
    sc.steps[2].onEnter!(w);
    const r1 = runAll(w, ['git push']);
    expect(sc.steps[3].validate!(r1.w, r1.log)).toBe(true);
    const r2 = runAll(r1.w, ['git pull']);
    expect(findRepo(r2.w)!.operation?.conflicts).toEqual(['styles.css']);
  });
});

describe('escenarios de deshacer', async () => {
  const { UNDO_SCENARIOS } = await import('../src/data/undoScenarios');
  const sols: Record<string, string[]> = {
    'staged-by-mistake': ['git restore --staged credenciales.txt'],
    'commit-extra': ['git reset --soft HEAD~1', 'git restore --staged debug.log', 'git commit -m "feat: pie de página"'],
    'lost-commits': ['git reflog', 'git reset --hard HEAD@{1}'],
    'published-bug': ['git revert HEAD~1 --no-edit'],
    'deleted-file': ['git restore styles.css'],
    'temp-files': ['git clean -f tmp1.txt tmp2.txt', 'git clean -fd cache'],
  };
  for (const u of UNDO_SCENARIOS) {
    it(`${u.id}: se resuelve con el comando esperado`, () => {
      const w0 = u.setup();
      expect(u.checks.every((c) => c.test(w0, []))).toBe(false);
      const { w, log } = runAll(w0, sols[u.id]);
      expect(u.checks.filter((c) => !c.test(w, log)).map((c) => c.label)).toEqual([]);
    });
  }
});

describe('workflows', async () => {
  const { WORKFLOWS, buildStep } = await import('../src/data/workflows');
  for (const wf of WORKFLOWS) {
    it(`${wf.id}: todos los pasos se ejecutan sin errores`, () => {
      const { world } = buildStep(wf, wf.steps.length - 1);
      expect(findRepo(world)).not.toBeNull();
    });
  }
});
