/**
 * Análisis de comandos potencialmente destructivos ANTES de ejecutarlos.
 * Calcula qué se perdería exactamente con el estado actual del repositorio.
 */
import { parseSegments } from './shell';
import { hashBlob } from './sha1';
import {
  ancestors,
  collapseUntracked,
  computeStatus,
  currentBranch,
  findRepo,
  headSha,
  headTree,
  isAncestor,
  resolveRev,
  worktree,
} from './repo';
import { getServer } from './server';
import type { World } from './types';
import { isDir, relative, resolvePath } from './vfs';

export interface DangerInfo {
  command: string;
  title: string;
  severity: 'high' | 'medium';
  /** Qué se perderá (calculado sobre el estado real). */
  details: string[];
  /** Cómo recuperarse si fue un error. */
  recovery: string;
}

function relPaths(world: World, root: string, specs: string[]): string[] {
  return specs.map((s) => relative(root, resolvePath(world.cwd, s, world.home)));
}

function matches(rel: string, specs: string[]): boolean {
  return specs.some((s) => s === '' || rel === s || rel.startsWith(s + '/') || (s.includes('*') && new RegExp('^' + s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(rel)));
}

export function analyzeDanger(world: World, input: string): DangerInfo[] {
  let segs;
  try {
    segs = parseSegments(input);
  } catch {
    return [];
  }
  const out: DangerInfo[] = [];
  for (const seg of segs) {
    const [prog, sub, ...args] = seg.argv;
    const cmd = seg.argv.join(' ');
    if (prog === 'rm') {
      const flags = seg.argv.slice(1).filter((a) => a.startsWith('-')).join('');
      const targets = seg.argv.slice(1).filter((a) => !a.startsWith('-'));
      const repo = findRepo(world);
      const lostFiles: string[] = [];
      for (const t of targets) {
        const abs = resolvePath(world.cwd, t, world.home);
        if (isDir(world.fs, abs)) lostFiles.push(`${t}/ (carpeta completa${world.repos[abs] ? ', ¡incluye el repositorio .git y TODO su historial!' : ''})`);
        else if (repo && world.fs.files[abs] !== undefined) {
          const rel = relative(repo.root, abs);
          const committed = headTree(repo)[rel];
          if (!committed) lostFiles.push(`${t} (no está en ningún commit: se perderá para siempre)`);
          else if (committed !== hashBlob(world.fs.files[abs])) lostFiles.push(`${t} (tiene cambios sin confirmar que se perderán)`);
        } else if (world.fs.files[abs] !== undefined) lostFiles.push(`${t} (fuera de un repositorio: no hay copia)`);
      }
      if (flags.includes('r') || lostFiles.length) {
        out.push({
          command: cmd,
          title: 'rm borra archivos del disco sin papelera de reciclaje',
          severity: lostFiles.some((l) => l.includes('historial') || l.includes('para siempre')) ? 'high' : 'medium',
          details: lostFiles.length ? lostFiles : ['Se eliminarán los archivos indicados.'],
          recovery: 'Solo se puede recuperar lo que esté guardado en un commit (git restore <archivo>).',
        });
      }
      continue;
    }
    if (prog !== 'git' || !sub) continue;
    const repo = findRepo(world);
    if (!repo) continue;
    const st = computeStatus(world, repo);
    const flagsOf = (list: string[]) => list.filter((a) => a.startsWith('-'));
    const posOf = (list: string[]) => list.filter((a) => !a.startsWith('-') && a !== '--');

    if (sub === 'reset' && args.includes('--hard')) {
      const target = posOf(args)[0] ?? 'HEAD';
      const targetSha = resolveRev(repo, target);
      const details: string[] = [];
      const changed = [...new Set([...st.staged.map((c) => c.path), ...st.unstaged.map((c) => c.path), ...st.unmerged])];
      if (changed.length) details.push(`Cambios sin confirmar que se perderán: ${changed.join(', ')}`);
      const head = headSha(repo);
      if (head && targetSha && !isAncestor(repo.objects, head, targetSha)) {
        const keep = ancestors(repo.objects, targetSha);
        const lost = [...ancestors(repo.objects, head)].filter((s) => !keep.has(s));
        const inOtherBranches = new Set<string>();
        for (const [b, sha] of Object.entries(repo.heads)) if (b !== currentBranch(repo)) for (const s of ancestors(repo.objects, sha)) inOtherBranches.add(s);
        const orphan = lost.filter((s) => !inOtherBranches.has(s));
        if (lost.length) details.push(`${lost.length} commit(s) dejarán de estar en la rama "${currentBranch(repo) ?? 'HEAD'}"${orphan.length ? ` (${orphan.length} no están en ninguna otra rama)` : ''}.`);
      }
      if (!details.length) details.push('Ahora mismo no hay cambios sin confirmar, así que no perderás trabajo.');
      if (st.untracked.length) details.push(`Los archivos sin rastrear NO se tocan: ${collapseUntracked(st.untracked, repo.index).join(', ')}`);
      out.push({
        command: cmd,
        title: 'git reset --hard sobrescribe staging y working directory',
        severity: changed.length ? 'high' : 'medium',
        details,
        recovery: 'Los commits se recuperan con git reflog + git reset --hard HEAD@{1}. Los cambios NO confirmados no se pueden recuperar.',
      });
    }
    if ((sub === 'restore' && !(args.includes('--staged') || args.includes('-S')) ) || (sub === 'restore' && (args.includes('--worktree') || args.includes('-W'))) || (sub === 'checkout' && args.includes('--'))) {
      const specs = sub === 'checkout' ? args.slice(args.indexOf('--') + 1) : posOf(args).filter((a) => !a.startsWith('--source'));
      const rels = relPaths(world, repo.root, specs);
      const work = worktree(world, repo);
      const lost = Object.keys({ ...repo.index, ...headTree(repo) }).filter((p) => matches(p, rels) && p in work && hashBlob(work[p]) !== (repo.index[p] ?? ''));
      const hasSource = args.some((a) => a.startsWith('--source') || a === '-s');
      out.push({
        command: cmd,
        title: `${sub === 'checkout' ? 'git checkout --' : 'git restore'} descarta los cambios del working directory`,
        severity: lost.length ? 'high' : 'medium',
        details: lost.length
          ? [`Se perderán las modificaciones no preparadas de: ${lost.join(', ')}`]
          : [hasSource ? 'El contenido de los archivos se sustituirá por la versión indicada.' : 'Los archivos indicados no tienen cambios sin preparar: no perderás nada.'],
        recovery: 'Los cambios que nunca se añadieron ni confirmaron no se pueden recuperar con Git.',
      });
    }
    if (sub === 'clean' && flagsOf(args).some((f) => /^-[a-zA-Z]*f/.test(f) || f === '--force') && !flagsOf(args).some((f) => /^-[a-zA-Z]*n/.test(f) || f === '--dry-run')) {
      const withDirs = flagsOf(args).some((f) => /^-[a-zA-Z]*d/.test(f));
      const withIgnored = flagsOf(args).some((f) => /^-[a-zA-Z]*x/.test(f));
      const files = collapseUntracked(withIgnored ? [...st.untracked, ...st.ignored] : st.untracked, repo.index).filter((f) => withDirs || !f.endsWith('/'));
      out.push({
        command: cmd,
        title: 'git clean elimina archivos sin rastrear de forma permanente',
        severity: files.length ? 'high' : 'medium',
        details: files.length ? [`Se borrarán: ${files.join(', ')}`] : ['No hay archivos sin rastrear que borrar.'],
        recovery: 'Git nunca guardó esos archivos: no hay forma de recuperarlos. Usa git clean -n para previsualizar.',
      });
    }
    if (sub === 'branch' && (args.includes('-D') || (args.includes('-d') && args.includes('--force')))) {
      const details: string[] = [];
      for (const b of posOf(args)) {
        const sha = repo.heads[b];
        if (!sha) continue;
        const others = new Set<string>();
        for (const [n, s] of Object.entries(repo.heads)) if (n !== b) for (const x of ancestors(repo.objects, s)) others.add(x);
        for (const s of Object.values(repo.remoteRefs)) for (const x of ancestors(repo.objects, s)) others.add(x);
        const unique = [...ancestors(repo.objects, sha)].filter((s) => !others.has(s));
        details.push(unique.length ? `La rama "${b}" tiene ${unique.length} commit(s) que no están en otra rama.` : `La rama "${b}" ya está integrada: no perderás commits.`);
      }
      out.push({
        command: cmd,
        title: 'git branch -D fuerza el borrado aunque la rama no esté fusionada',
        severity: details.some((d) => d.includes('que no están')) ? 'high' : 'medium',
        details: details.length ? details : ['La rama indicada no existe.'],
        recovery: 'Puedes recrearla con git branch <nombre> <sha> usando el SHA que muestra git reflog.',
      });
    }
    if (sub === 'push' && args.some((a) => a === '--force' || a === '-f' || /^-[a-zA-Z]*f/.test(a) || a.startsWith('+'))) {
      const pos = posOf(args);
      const remote = pos[0] ?? 'origin';
      const branch = pos[1]?.replace(/^\+/, '').split(':').pop() ?? currentBranch(repo) ?? '';
      const server = repo.remotes[remote] ? getServer(world, repo.remotes[remote]) : null;
      const details: string[] = [];
      const local = repo.heads[pos[1]?.replace(/^\+/, '').split(':')[0] ?? branch] ?? headSha(repo);
      const remoteSha = server?.heads[branch];
      if (server && remoteSha && local && !isAncestor(server.objects, remoteSha, local) && !ancestors(repo.objects, local).has(remoteSha)) {
        const keep = repo.objects.commits[local] ? ancestors(repo.objects, local) : new Set<string>();
        const lost = [...ancestors(server.objects, remoteSha)].filter((s) => !keep.has(s));
        details.push(`Se sobrescribirán ${lost.length} commit(s) de ${remote}/${branch} que tu rama no contiene (quizá de otros compañeros).`);
      } else details.push('Ahora mismo el push sería fast-forward: no se perderían commits remotos.');
      out.push({
        command: cmd,
        title: 'git push --force reescribe la historia del repositorio remoto',
        severity: details[0].includes('sobrescribirán') ? 'high' : 'medium',
        details,
        recovery: 'Prefiere git push --force-with-lease: se niega si el remoto tiene trabajo que no has visto.',
      });
    }
    if (sub === 'stash' && (args[0] === 'drop' || args[0] === 'clear')) {
      out.push({
        command: cmd,
        title: `git stash ${args[0]} elimina ${args[0] === 'clear' ? 'todas las entradas' : 'una entrada'} del stash`,
        severity: 'medium',
        details: [args[0] === 'clear' ? `Se borrarán ${repo.stash.length} entrada(s).` : repo.stash[0] ? `Se borrará: ${repo.stash[0].message}` : 'No hay entradas en el stash.'],
        recovery: 'Recuperarlas requiere comandos avanzados (git fsck --unreachable). Considéralo permanente.',
      });
    }
    if (sub === 'rm' && args.some((a) => a === '-f' || a === '--force')) {
      out.push({
        command: cmd,
        title: 'git rm -f elimina archivos aunque tengan cambios sin confirmar',
        severity: 'high',
        details: ['Los cambios locales de esos archivos se perderán.'],
        recovery: 'La última versión confirmada se recupera con git restore --source=HEAD --staged --worktree <archivo>.',
      });
    }
    if (sub === 'commit' && args.includes('--amend')) {
      const cur = currentBranch(repo);
      const up = cur ? repo.upstream[cur] : undefined;
      const remoteSha = up ? repo.remoteRefs[`${up.remote}/${up.branch}`] : undefined;
      const head = headSha(repo);
      if (head && remoteSha && isAncestor(repo.objects, head, remoteSha)) {
        out.push({
          command: cmd,
          title: 'Vas a reescribir un commit que ya está publicado',
          severity: 'medium',
          details: [`El último commit ya existe en ${up!.remote}/${up!.branch}. Tras --amend tendrás que hacer push --force y tus compañeros tendrán historias distintas.`],
          recovery: 'Si ya está publicado, es más seguro crear un commit nuevo con la corrección.',
        });
      }
    }
  }
  return out;
}
