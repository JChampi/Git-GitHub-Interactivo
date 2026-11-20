/**
 * Simulación visual de repositorio local vs remoto: ramas locales, ramas
 * remotas (origin/*), commits pendientes de subir y de descargar.
 */
import { CloudDownload, CloudUpload, Laptop, RefreshCw, Server, UserPlus } from 'lucide-react';
import { useMemo } from 'react';
import { ancestors, findRepo } from '../engine/repo';
import { getServer, serverCommit } from '../engine/server';
import { TEAM } from '../engine/world';
import { useLab, useLabs } from '../store/labs';
import { useProgress } from '../store/progress';
import { useUI } from '../store/ui';
import { CommitGraph, refsForRepo, refsForServer } from './CommitGraph';
import { Badge, Button } from './ui';

export function RemoteView({ labId, allowTeammate = true }: { labId: string; allowTeammate?: boolean }) {
  const lab = useLab(labId);
  const run = useLabs((s) => s.run);
  const mutate = useLabs((s) => s.mutate);
  const record = useProgress((s) => s.recordCommands);
  const setTopic = useUI((s) => s.setTopic);
  const world = lab.world;
  const repo = findRepo(world);
  const remoteName = repo ? (Object.keys(repo.remotes).includes('origin') ? 'origin' : Object.keys(repo.remotes)[0]) : undefined;
  const server = repo && remoteName ? getServer(world, repo.remotes[remoteName]) : null;

  const info = useMemo(() => {
    if (!repo || !server || !remoteName) return null;
    const branches = Object.keys(repo.heads).map((b) => {
      const up = repo.upstream[b];
      const local = repo.heads[b];
      const trackRef = up ? `${up.remote}/${up.branch}` : `${remoteName}/${b}`;
      const known = repo.remoteRefs[trackRef];
      const real = server.heads[up?.branch ?? b];
      const localAnc = ancestors(repo.objects, local);
      const toPush = real ? [...localAnc].filter((s) => !ancestors(server.objects, real).has(s)) : [...localAnc];
      const toPull = real ? [...ancestors(server.objects, real)].filter((s) => !localAnc.has(s)) : [];
      const notFetched = real ? [...ancestors(server.objects, real)].filter((s) => !repo.objects.commits[s]) : [];
      return { b, up, known, real, toPush, toPull, notFetched, published: !!real };
    });
    const pushSet = new Set(branches.flatMap((x) => x.toPush));
    const pullSet = new Set(branches.flatMap((x) => x.toPull));
    return { branches, pushSet, pullSet };
  }, [repo, server, remoteName]);

  const exec = (cmd: string) => {
    const r = run(labId, cmd);
    record(r.records);
    if (r.topic) setTopic(r.topic);
  };

  if (!repo) return <p className="p-4 text-sm text-muted">Entra en un repositorio (cd) para ver su relación con el remoto.</p>;
  if (!remoteName || !server) {
    return (
      <div className="rounded-lg border border-dashed border-line-2 p-5 text-sm text-muted">
        <p className="font-medium text-fg-2">Este repositorio no tiene un remoto válido.</p>
        <p className="mt-1">Crea el repositorio en GitHub (pestaña GitHub o <code className="font-mono text-accent">gh repo create</code>) y conéctalo con <code className="font-mono text-accent">git remote add origin &lt;url&gt;</code>.</p>
      </div>
    );
  }

  const teammate = () => {
    mutate(labId, (w) => {
      const s = getServer(w, repo.remotes[remoteName])!;
      const branch = s.defaultBranch;
      const n = Object.keys(s.objects.commits).length + 1;
      serverCommit(w, s, { branch, author: TEAM.frontend, message: `feat: mejora #${n} del equipo`, changes: { [`equipo/cambio-${n}.md`]: `Cambio ${n} subido por ${TEAM.frontend.name}\n` } });
    }, { kind: 'notice', text: `[GitHub] ${TEAM.frontend.name} subió un commit a ${remoteName}/${server.defaultBranch}. Tu repositorio local aún no lo sabe: prueba git status, luego git fetch.`, tone: 'warn' });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<RefreshCw size={13} />} onClick={() => exec('git fetch')}>
          git fetch
        </Button>
        <Button size="sm" icon={<CloudDownload size={13} />} onClick={() => exec('git pull')}>
          git pull
        </Button>
        <Button size="sm" icon={<CloudUpload size={13} />} onClick={() => exec('git push')}>
          git push
        </Button>
        {allowTeammate && (
          <Button size="sm" variant="ghost" icon={<UserPlus size={13} />} onClick={teammate} className="ml-auto">
            Simular push de un compañero
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[520px] text-xs">
          <thead className="bg-bg-3 text-left text-muted">
            <tr>
              <th className="px-3 py-1.5 font-medium">Rama local</th>
              <th className="px-3 py-1.5 font-medium">Sigue a</th>
              <th className="px-3 py-1.5 font-medium">Pendiente de subir</th>
              <th className="px-3 py-1.5 font-medium">Pendiente de descargar</th>
            </tr>
          </thead>
          <tbody>
            {info?.branches.map((x) => (
              <tr key={x.b} className="border-t border-line">
                <td className="px-3 py-1.5 font-mono text-ggreen">{x.b}</td>
                <td className="px-3 py-1.5 font-mono">{x.up ? `${x.up.remote}/${x.up.branch}` : <span className="text-muted">— (sin upstream)</span>}</td>
                <td className="px-3 py-1.5">{x.toPush.length ? <Badge tone="yellow">{x.toPush.length} commit(s) ↑</Badge> : <span className="text-muted">nada</span>}{!x.published && <span className="ml-1 text-muted">(rama no publicada)</span>}</td>
                <td className="px-3 py-1.5">
                  {x.toPull.length ? <Badge tone="blue">{x.toPull.length} commit(s) ↓</Badge> : <span className="text-muted">nada</span>}
                  {x.notFetched.length > 0 && <span className="ml-1 text-gyellow">({x.notFetched.length} sin fetch)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-bg-1">
          <p className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-xs font-semibold">
            <Laptop size={14} className="text-gyellow" /> Repositorio local <span className="font-normal text-muted">— incluye origin/* (estado del último fetch)</span>
          </p>
          <CommitGraph objects={repo.objects} refs={refsForRepo(repo)} compact className="max-h-72 p-1" highlight={info?.pushSet} highlightLabel="↑ push" />
        </div>
        <div className="rounded-lg border border-line bg-bg-1">
          <p className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-xs font-semibold">
            <Server size={14} className="text-gpurple" /> GitHub · {server.owner}/{server.name} <span className="font-normal text-muted">— estado real del servidor</span>
          </p>
          <CommitGraph objects={server.objects} refs={refsForServer(server)} compact className="max-h-72 p-1" highlight={info?.pullSet} highlightLabel="↓ nuevo" emptyText="El repositorio remoto está vacío. Sube tu rama con git push -u origin main." />
        </div>
      </div>
    </div>
  );
}
