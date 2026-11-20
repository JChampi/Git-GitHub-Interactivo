import { describe, expect, it } from 'vitest';
import { session } from './helpers';
import { computeStatus, headSha, currentBranch } from '../src/engine/repo';
import { createWorld } from '../src/engine/world';
import { analyzeDanger } from '../src/engine/danger';
import { complete } from '../src/engine/complete';
import { serverCommit } from '../src/engine/server';

describe('flujo básico: init → add → commit → log', () => {
  it('crea un repositorio y registra el primer commit', () => {
    const s = session();
    expect(s.run('git status').text).toContain('fatal: not a git repository');
    expect(s.ok('git init')).toContain('Initialized empty Git repository in /home/estudiante/proyecto/.git/');
    const st = s.ok('git status');
    expect(st).toContain('On branch main');
    expect(st).toContain('No commits yet');
    s.ok('echo "# Hola" > README.md');
    expect(s.ok('git status')).toContain('Untracked files:');
    s.ok('git add README.md');
    expect(s.ok('git status')).toContain('new file:   README.md');
    const out = s.ok('git commit -m "Primer commit"');
    expect(out).toMatch(/\[main \(root-commit\) [0-9a-f]{7}\] Primer commit/);
    expect(out).toContain('1 file changed, 1 insertion(+)');
    expect(out).toContain('create mode 100644 README.md');
    expect(s.ok('git status')).toContain('nothing to commit, working tree clean');
    const log = s.ok('git log --oneline');
    expect(log).toMatch(/[0-9a-f]{7} \(HEAD -> main\) Primer commit/);
  });

  it('distingue cambios preparados y no preparados del mismo archivo', () => {
    const s = session();
    s.ok('git init', 'echo a > f.txt', 'git add f.txt', 'git commit -m uno', 'echo b > f.txt', 'git add f.txt', 'echo c > f.txt');
    const st = computeStatus(s.world, s.repo());
    expect(st.staged.map((c) => c.path)).toEqual(['f.txt']);
    expect(st.unstaged.map((c) => c.path)).toEqual(['f.txt']);
    expect(s.ok('git diff')).toContain('-b\n+c');
    expect(s.ok('git diff --staged')).toContain('-a\n+b');
  });

  it('exige identidad para hacer commit', () => {
    const s = session(createWorld({ identity: false, dirs: ['p'], cwd: 'p', deterministic: true }));
    s.ok('git init', 'touch a', 'git add a');
    const r = s.run('git commit -m x');
    expect(r.ok).toBe(false);
    expect(r.text).toContain('Author identity unknown');
    s.ok('git config --global user.name "Ana"', 'git config --global user.email ana@x.dev', 'git commit -m x');
  });

  it('no permite commits vacíos y sugiere git add', () => {
    const s = session();
    s.ok('git init', 'echo x > a', 'git add a', 'git commit -m a', 'echo y > a');
    const r = s.run('git commit -m b');
    expect(r.ok).toBe(false);
    expect(r.text).toContain('no changes added to commit');
  });

  it('commit -a incluye archivos modificados rastreados pero no los nuevos', () => {
    const s = session();
    s.ok('git init', 'echo x > a', 'git add a', 'git commit -m a', 'echo y > a', 'echo n > nuevo');
    s.ok('git commit -am "b"');
    const st = computeStatus(s.world, s.repo());
    expect(st.untracked).toEqual(['nuevo']);
    expect(st.unstaged).toEqual([]);
  });

  it('amend reemplaza el último commit', () => {
    const s = session();
    s.ok('git init', 'echo x > a', 'git add a', 'git commit -m "mensaje con errr"');
    const before = headSha(s.repo());
    s.ok('git commit --amend -m "mensaje corregido"');
    const repo = s.repo();
    expect(headSha(repo)).not.toBe(before);
    expect(repo.objects.commits[headSha(repo)!].message).toBe('mensaje corregido');
    expect(repo.objects.commits[headSha(repo)!].parents).toEqual([]);
  });

  it('git rm y git mv actualizan el índice', () => {
    const s = session();
    s.ok('git init', 'echo x > a.txt', 'echo y > b.txt', 'git add .', 'git commit -m base');
    s.ok('git mv a.txt c.txt', 'git rm b.txt');
    const st = computeStatus(s.world, s.repo());
    expect(st.staged).toEqual([
      { path: 'b.txt', kind: 'deleted' },
      { path: 'c.txt', kind: 'renamed', from: 'a.txt' },
    ]);
    expect(s.file('b.txt')).toBeUndefined();
  });

  it('respeta .gitignore al añadir', () => {
    const s = session();
    s.ok('git init', 'echo "*.log" > .gitignore', 'echo e > error.log', 'echo a > app.js', 'git add .');
    expect(Object.keys(s.repo().index).sort()).toEqual(['.gitignore', 'app.js']);
    const r = s.run('git add error.log');
    expect(r.text).toContain('ignored by one of your .gitignore files');
    s.ok('git add -f error.log');
    expect(s.repo().index['error.log']).toBeDefined();
  });

  it('valida opciones desconocidas', () => {
    const s = session();
    s.ok('git init');
    const r = s.run('git commit --mensaje x');
    expect(r.ok).toBe(false);
    expect(r.text).toContain("unknown option `mensaje'");
  });
});

describe('ramas y fusiones', () => {
  function base() {
    const s = session();
    s.ok('git init', 'echo "linea 1\nlinea 2\nlinea 3" > app.txt', 'git add .', 'git commit -m "base"');
    return s;
  }

  it('crea, cambia y lista ramas', () => {
    const s = base();
    s.ok('git branch feature/login');
    expect(s.ok('git branch')).toContain('  feature/login\n* main');
    expect(s.ok('git switch feature/login')).toContain("Switched to branch 'feature/login'");
    expect(currentBranch(s.repo())).toBe('feature/login');
    s.ok('git switch -c fix/error');
    expect(Object.keys(s.repo().heads).sort()).toEqual(['feature/login', 'fix/error', 'main']);
    expect(s.run('git branch "mal nombre"').text).toContain('is not a valid branch name');
  });

  it('fusión fast-forward', () => {
    const s = base();
    s.ok('git switch -c feature', 'echo nuevo > nuevo.txt', 'git add .', 'git commit -m "feat: nuevo"', 'git switch main');
    expect(s.file('nuevo.txt')).toBeUndefined();
    const out = s.ok('git merge feature');
    expect(out).toContain('Fast-forward');
    expect(s.file('nuevo.txt')).toBe('nuevo\n');
    expect(s.repo().heads.main).toBe(s.repo().heads.feature);
  });

  it('fusión de tres vías con commit de merge', () => {
    const s = base();
    s.ok('git switch -c feature', 'echo f > f.txt', 'git add .', 'git commit -m f', 'git switch main', 'echo m > m.txt', 'git add .', 'git commit -m m');
    const out = s.ok('git merge feature');
    expect(out).toContain("Merge made by the 'ort' strategy.");
    const repo = s.repo();
    const c = repo.objects.commits[headSha(repo)!];
    expect(c.parents).toHaveLength(2);
    expect(c.message).toBe("Merge branch 'feature'");
    expect(Object.keys(c.tree).sort()).toEqual(['app.txt', 'f.txt', 'm.txt']);
  });

  it('conflicto de fusión: detecta, bloquea commit y se resuelve', () => {
    const s = base();
    s.ok('git switch -c feature', 'echo "linea 1\nlinea B\nlinea 3" > app.txt', 'git commit -am "B"', 'git switch main', 'echo "linea 1\nlinea A\nlinea 3" > app.txt', 'git commit -am "A"');
    const r = s.run('git merge feature');
    expect(r.ok).toBe(false);
    expect(r.text).toContain('CONFLICT (content): Merge conflict in app.txt');
    expect(s.file('app.txt')).toBe('linea 1\n<<<<<<< HEAD\nlinea A\n=======\nlinea B\n>>>>>>> feature\nlinea 3\n');
    expect(s.ok('git status')).toContain('both modified:   app.txt');
    expect(s.run('git commit -m x').text).toContain('Committing is not possible because you have unmerged files');
    s.ok('echo "linea 1\nlinea A y B\nlinea 3" > app.txt', 'git add app.txt');
    s.ok('git commit -m "Merge resuelto"');
    const repo = s.repo();
    expect(repo.operation).toBeNull();
    expect(repo.objects.commits[headSha(repo)!].parents).toHaveLength(2);
  });

  it('merge --abort restaura el estado previo', () => {
    const s = base();
    s.ok('git switch -c f', 'echo "X" > app.txt', 'git commit -am x', 'git switch main', 'echo "Y" > app.txt', 'git commit -am y');
    s.run('git merge f');
    s.ok('git merge --abort');
    expect(s.file('app.txt')).toBe('Y\n');
    expect(s.repo().operation).toBeNull();
  });

  it('impide cambiar de rama si se perderían cambios', () => {
    const s = base();
    s.ok('git switch -c f', 'echo "otro" > app.txt', 'git commit -am cambio', 'git switch main', 'echo "local" > app.txt');
    const r = s.run('git switch f');
    expect(r.ok).toBe(false);
    expect(r.text).toContain('would be overwritten by checkout');
  });

  it('lleva los cambios locales al cambiar de rama si no hay conflicto', () => {
    const s = base();
    s.ok('git branch otra', 'echo extra >> app.txt', 'git switch otra');
    expect(s.file('app.txt')).toContain('extra');
  });

  it('branch -d protege ramas no fusionadas', () => {
    const s = base();
    s.ok('git switch -c exp', 'echo e > e', 'git add e', 'git commit -m e', 'git switch main');
    expect(s.run('git branch -d exp').text).toContain('is not fully merged');
    expect(s.ok('git branch -D exp')).toContain('Deleted branch exp');
  });

  it('detached HEAD con checkout de un commit', () => {
    const s = base();
    s.ok('echo 2 > dos', 'git add .', 'git commit -m dos');
    const out = s.ok('git checkout HEAD~1');
    expect(out).toContain("You are in 'detached HEAD' state");
    expect(s.repo().head.kind).toBe('detached');
    expect(s.file('dos')).toBeUndefined();
  });

  it('rebase reaplica commits sobre otra base', () => {
    const s = base();
    s.ok('git switch -c feat', 'echo f > f', 'git add f', 'git commit -m f', 'git switch main', 'echo m > m', 'git add m', 'git commit -m m', 'git switch feat');
    s.ok('git rebase main');
    const repo = s.repo();
    const head = repo.objects.commits[headSha(repo)!];
    expect(head.parents).toEqual([repo.heads.main]);
    expect(s.file('m')).toBe('m\n');
  });

  it('cherry-pick copia un commit', () => {
    const s = base();
    s.ok('git switch -c feat', 'echo f > f', 'git add f', 'git commit -m "feat: f"', 'git switch main', 'git cherry-pick feat');
    expect(s.file('f')).toBe('f\n');
    expect(s.repo().objects.commits[s.repo().heads.main].message).toBe('feat: f');
  });

  it('stash guarda y recupera cambios', () => {
    const s = base();
    s.ok('echo cambio >> app.txt');
    s.ok('git stash');
    expect(s.file('app.txt')).not.toContain('cambio');
    expect(s.ok('git stash list')).toContain('stash@{0}: WIP on main');
    s.ok('git stash pop');
    expect(s.file('app.txt')).toContain('cambio');
    expect(s.repo().stash).toHaveLength(0);
  });

  it('tags ligeros y anotados', () => {
    const s = base();
    s.ok('git tag v0.1', 'git tag -a v1.0 -m "Versión 1"');
    expect(s.ok('git tag')).toContain('v0.1\nv1.0');
    expect(s.ok('git show v1.0')).toContain('Versión 1');
  });

  it('log --graph dibuja las ramas', () => {
    const s = base();
    s.ok('git switch -c f', 'echo f > f', 'git add f', 'git commit -m f', 'git switch main', 'echo m > m', 'git add m', 'git commit -m m', 'git merge f');
    const out = s.ok('git log --graph --oneline --all');
    expect(out).toMatch(/^\*/);
    expect(out).toContain('|\\');
  });
});

describe('deshacer cambios', () => {
  function three() {
    const s = session();
    s.ok('git init');
    for (const n of ['uno', 'dos', 'tres']) s.ok(`echo ${n} > ${n}.txt`, `git add ${n}.txt`, `git commit -m ${n}`);
    return s;
  }

  it('restore descarta cambios del working directory', () => {
    const s = three();
    s.ok('echo roto > uno.txt', 'git restore uno.txt');
    expect(s.file('uno.txt')).toBe('uno\n');
  });

  it('restore --staged saca de staging sin perder cambios', () => {
    const s = three();
    s.ok('echo nuevo > uno.txt', 'git add uno.txt', 'git restore --staged uno.txt');
    const st = computeStatus(s.world, s.repo());
    expect(st.staged).toEqual([]);
    expect(st.unstaged.map((c) => c.path)).toEqual(['uno.txt']);
    expect(s.file('uno.txt')).toBe('nuevo\n');
  });

  it('reset --soft mantiene los cambios en staging', () => {
    const s = three();
    s.ok('git reset --soft HEAD~1');
    const st = computeStatus(s.world, s.repo());
    expect(st.staged.map((c) => c.path)).toEqual(['tres.txt']);
    expect(s.file('tres.txt')).toBe('tres\n');
  });

  it('reset --mixed vacía staging pero conserva archivos', () => {
    const s = three();
    s.ok('git reset HEAD~1');
    const st = computeStatus(s.world, s.repo());
    expect(st.staged).toEqual([]);
    expect(st.untracked).toEqual(['tres.txt']);
  });

  it('reset --hard descarta todo y reflog lo recupera', () => {
    const s = three();
    s.ok('git reset --hard HEAD~2');
    expect(s.file('dos.txt')).toBeUndefined();
    expect(s.repo().objects.commits[headSha(s.repo())!].message).toBe('uno');
    expect(s.ok('git reflog')).toContain('HEAD@{0}: reset: moving to HEAD~2');
    s.ok('git reset --hard HEAD@{1}');
    expect(s.file('tres.txt')).toBe('tres\n');
  });

  it('reset --hard no toca archivos sin rastrear', () => {
    const s = three();
    s.ok('echo tmp > temporal.txt', 'echo x > uno.txt', 'git reset --hard');
    expect(s.file('temporal.txt')).toBe('tmp\n');
    expect(s.file('uno.txt')).toBe('uno\n');
  });

  it('revert crea un commit inverso sin reescribir historia', () => {
    const s = three();
    const before = headSha(s.repo());
    s.ok('git revert HEAD --no-edit');
    const repo = s.repo();
    const c = repo.objects.commits[headSha(repo)!];
    expect(c.parents).toEqual([before]);
    expect(c.message).toContain('Revert "tres"');
    expect(s.file('tres.txt')).toBeUndefined();
  });

  it('clean requiere -f y borra sin rastrear', () => {
    const s = three();
    s.ok('echo x > basura.txt', 'mkdir tmp', 'echo y > tmp/a');
    expect(s.run('git clean').text).toContain('refusing to clean');
    expect(s.ok('git clean -n')).toContain('Would remove basura.txt');
    s.ok('git clean -fd');
    expect(s.file('basura.txt')).toBeUndefined();
    expect(s.file('tmp/a')).toBeUndefined();
  });

  it('el analizador de peligro calcula lo que se perdería', () => {
    const s = three();
    s.ok('echo cambio > uno.txt');
    const d = analyzeDanger(s.world, 'git reset --hard HEAD~1');
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe('high');
    expect(d[0].details.join(' ')).toContain('uno.txt');
    expect(analyzeDanger(s.world, 'git restore --staged uno.txt')).toHaveLength(0);
    expect(analyzeDanger(s.world, 'git restore uno.txt')[0].details[0]).toContain('uno.txt');
    expect(analyzeDanger(s.world, 'git status')).toHaveLength(0);
  });
});

describe('remotos y GitHub simulado', () => {
  function withRemote() {
    const s = session();
    s.ok('gh repo create proyecto --public');
    s.ok('git init', 'echo hola > README.md', 'git add .', 'git commit -m inicial');
    s.ok('git remote add origin https://github.com/estudiante/proyecto.git');
    return s;
  }

  it('push -u publica la rama y configura upstream', () => {
    const s = withRemote();
    expect(s.run('git push').text).toContain('has no upstream branch');
    const out = s.ok('git push -u origin main');
    expect(out).toContain('* [new branch]      main -> main');
    expect(out).toContain("branch 'main' set up to track 'origin/main'.");
    expect(s.ok('git status')).toContain("Your branch is up to date with 'origin/main'.");
    s.ok('echo mas >> README.md', 'git commit -am dos');
    expect(s.ok('git status')).toContain("ahead of 'origin/main' by 1 commit");
    s.ok('git push');
    expect(s.world.servers['https://github.com/estudiante/proyecto.git'].heads.main).toBe(s.repo().heads.main);
  });

  it('push rechazado si el remoto tiene trabajo nuevo; pull lo integra', () => {
    const s = withRemote();
    s.ok('git push -u origin main');
    // Un compañero sube un cambio directamente
    s.ok('cd ..', 'git clone https://github.com/estudiante/proyecto.git copia', 'cd copia', 'echo b > b.txt', 'git add .', 'git commit -m "compañero"', 'git push', 'cd ../proyecto');
    s.ok('echo a > a.txt', 'git add .', 'git commit -m "mío"');
    const r = s.run('git push');
    expect(r.ok).toBe(false);
    expect(r.text).toContain('[rejected]');
    expect(r.text).toContain('fetch first');
    s.ok('git pull');
    expect(s.file('b.txt')).toBe('b\n');
    s.ok('git push');
  });

  it('fetch actualiza origin/* sin tocar la rama local', () => {
    const s = withRemote();
    s.ok('git push -u origin main');
    const server = s.world.servers['https://github.com/estudiante/proyecto.git'];

    serverCommit(s.world, server, { branch: 'main', author: { name: 'X', email: 'x@x' }, message: 'remoto', changes: { 'r.txt': 'r\n' } });
    const local = s.repo().heads.main;
    s.ok('git fetch');
    expect(s.repo().heads.main).toBe(local);
    expect(s.repo().remoteRefs['origin/main']).toBe(server.heads.main);
    expect(s.ok('git status')).toContain('behind');
    expect(s.file('r.txt')).toBeUndefined();
  });

  it('clone copia el historial y crea la rama de seguimiento', () => {
    const s = withRemote();
    s.ok('git push -u origin main', 'cd ..', 'git clone https://github.com/estudiante/proyecto.git otra', 'cd otra');
    expect(s.file('README.md')).toBe('hola\n');
    expect(s.repo().upstream.main).toEqual({ remote: 'origin', branch: 'main' });
    expect(s.ok('git log --oneline')).toContain('inicial');
  });

  it('ramas protegidas rechazan push directo', () => {
    const s = withRemote();
    s.ok('git push -u origin main');
    const server = s.world.servers['https://github.com/estudiante/proyecto.git'];
    server.protectedBranches.main = { requirePullRequest: true, requiredApprovals: 1, allowForcePush: false };
    s.ok('echo x >> README.md', 'git commit -am x');
    const r = s.run('git push');
    expect(r.ok).toBe(false);
    expect(r.text).toContain('GH006: Protected branch update failed');
  });

  it('flujo completo de Pull Request con revisión', async () => {
    const s = withRemote();
    s.ok('git push -u origin main');
    const { reviewPullRequest, mergePullRequest } = await import('../src/engine/server');
    const server = s.world.servers['https://github.com/estudiante/proyecto.git'];
    server.protectedBranches.main = { requirePullRequest: true, requiredApprovals: 1, allowForcePush: false };
    s.ok('git switch -c feature/login', 'echo login > login.js', 'git add .', 'git commit -m "feat: login"', 'git push -u origin feature/login');
    s.ok('gh pr create --title "Login" --body "Closes #9"');
    const srv = s.world.servers['https://github.com/estudiante/proyecto.git'];
    const pr = srv.pulls[0];
    expect(pr.head).toBe('feature/login');
    let res = mergePullRequest(s.world, srv, pr.number, { by: 'estudiante', method: 'merge' });
    expect('error' in res && res.error).toContain('requiere 1 aprobación');
    expect(reviewPullRequest(s.world, srv, pr.number, { author: 'estudiante', state: 'approved', body: '' })).toContain('propio');
    reviewPullRequest(s.world, srv, pr.number, { author: 'carlos-review', state: 'approved', body: 'LGTM' });
    res = mergePullRequest(s.world, srv, pr.number, { by: 'estudiante', method: 'merge' });
    expect('sha' in res).toBe(true);
    expect(srv.pulls[0].state).toBe('merged');
    s.ok('git switch main', 'git pull');
    expect(s.file('login.js')).toBe('login\n');
  });

  it('una aprobación queda desactualizada con commits nuevos', async () => {
    const s = withRemote();
    s.ok('git push -u origin main');
    const { reviewPullRequest, mergeBlockers } = await import('../src/engine/server');
    const srv = s.world.servers['https://github.com/estudiante/proyecto.git'];
    srv.protectedBranches.main = { requirePullRequest: true, requiredApprovals: 1, allowForcePush: false };
    s.ok('git switch -c f', 'echo 1 > f', 'git add f', 'git commit -m f', 'git push -u origin f', 'gh pr create --title F --body ""');
    const srv2 = s.world.servers['https://github.com/estudiante/proyecto.git'];
    reviewPullRequest(s.world, srv2, 1, { author: 'carlos-review', state: 'approved', body: '' });
    expect(mergeBlockers(s.world, srv2, srv2.pulls[0])).toEqual([]);
    s.ok('echo 2 > f', 'git commit -am f2', 'git push');
    const srv3 = s.world.servers['https://github.com/estudiante/proyecto.git'];
    expect(mergeBlockers(s.world, srv3, srv3.pulls[0]).join(' ')).toContain('desactualizada');
  });

  it('push --delete elimina ramas remotas', () => {
    const s = withRemote();
    s.ok('git push -u origin main', 'git switch -c tmp', 'git push origin tmp');
    expect(s.world.servers['https://github.com/estudiante/proyecto.git'].heads.tmp).toBeDefined();
    s.ok('git push origin --delete tmp');
    expect(s.world.servers['https://github.com/estudiante/proyecto.git'].heads.tmp).toBeUndefined();
  });
});

describe('terminal', () => {
  it('sugiere comandos parecidos', () => {
    const s = session();
    s.ok('git init');
    const r = s.run('git comit -m x');
    expect(r.text).toContain('The most similar command is\n\tcommit');
  });
  it('autocompleta subcomandos y ramas', () => {
    const s = session();
    s.ok('git init', 'touch a', 'git add a', 'git commit -m a', 'git branch feature/login');
    expect(complete(s.world, 'git sw').line).toBe('git switch ');
    expect(complete(s.world, 'git switch fea').line).toBe('git switch feature/login ');
  });
  it('&& se detiene ante un error', () => {
    const s = session();
    s.run('git status && echo hola > x.txt');
    expect(s.file('x.txt')).toBeUndefined();
  });
  it('redirecciones > y >>', () => {
    const s = session();
    s.ok('echo uno > a.txt', 'echo dos >> a.txt');
    expect(s.file('a.txt')).toBe('uno\ndos\n');
  });
});
