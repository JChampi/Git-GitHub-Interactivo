import { Globe, Shield, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { inviteCollaborator } from '../../engine/server';
import { Badge, Button, Callout } from '../ui';
import { Avatar, type GhCtx, Input, Select, SimNote } from './shared';

export function RepoSettings({ ctx }: { ctx: GhCtx }) {
  const { server, act } = ctx;
  const [branch, setBranch] = useState(server.defaultBranch);
  const existing = server.protectedBranches[branch];
  const [reqPR, setReqPR] = useState(existing?.requirePullRequest ?? true);
  const [approvals, setApprovals] = useState(existing?.requiredApprovals ?? 1);
  const [force, setForce] = useState(existing?.allowForcePush ?? false);
  const [user, setUser] = useState('');
  const [role, setRole] = useState<'read' | 'write' | 'admin'>('write');
  const [error, setError] = useState<string | null>(null);
  const [pagesBranch, setPagesBranch] = useState(server.pages.branch);
  const pagesHtml = server.pages.enabled && server.heads[server.pages.branch] ? server.objects.blobs[server.objects.commits[server.heads[server.pages.branch]].tree['index.html'] ?? ''] : undefined;

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h4 className="font-semibold">General</h4>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Visibilidad:</span>
          <Badge tone={server.visibility === 'public' ? 'green' : 'yellow'}>{server.visibility === 'public' ? 'Pública' : 'Privada'}</Badge>
          <Button size="sm" onClick={() => act((_, s) => { s.visibility = s.visibility === 'public' ? 'private' : 'public'; }, `Visibilidad cambiada`)}>
            Cambiar a {server.visibility === 'public' ? 'privada' : 'pública'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Rama por defecto:</span>
          <Select value={server.defaultBranch} onChange={(e) => act((_, s) => { s.defaultBranch = e.target.value; })} aria-label="Rama por defecto">
            {Object.keys(server.heads).length ? Object.keys(server.heads).map((h) => <option key={h}>{h}</option>) : <option>{server.defaultBranch}</option>}
          </Select>
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="flex items-center gap-2 font-semibold">
          <Shield size={15} /> Protección de ramas
        </h4>
        <p className="text-xs text-fg-2">Las reglas impiden push directo y exigen revisiones antes de fusionar. En la vida real las configura un administrador del repositorio.</p>
        <div className="space-y-2 rounded-md border border-line p-3 text-sm">
          <div className="flex items-center gap-2">
            <span>Rama:</span>
            <Select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Rama a proteger">
              {[...new Set([server.defaultBranch, ...Object.keys(server.heads)])].map((h) => (
                <option key={h}>{h}</option>
              ))}
            </Select>
            {existing && <Badge tone="green">protegida</Badge>}
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={reqPR} onChange={(e) => setReqPR(e.target.checked)} /> Requerir Pull Request antes de fusionar (bloquea git push directo)
          </label>
          <label className="flex items-center gap-2">
            Aprobaciones requeridas:
            <Input type="number" min={0} max={5} value={approvals} onChange={(e) => setApprovals(Math.max(0, Math.min(5, Number(e.target.value))))} className="w-16" aria-label="Aprobaciones requeridas" />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Permitir force push
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => act((_, s) => { s.protectedBranches[branch] = { requirePullRequest: reqPR, requiredApprovals: approvals, allowForcePush: force }; }, `Regla de protección guardada para ${branch}`)}>
              Guardar regla
            </Button>
            {existing && (
              <Button size="sm" variant="danger" icon={<Trash2 size={12} />} onClick={() => act((_, s) => { delete s.protectedBranches[branch]; }, `Protección eliminada de ${branch}`)}>
                Quitar protección
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="flex items-center gap-2 font-semibold">
          <Users size={15} /> Colaboradores y permisos
        </h4>
        <div className="overflow-hidden rounded-md border border-line">
          {server.collaborators.map((c) => (
            <div key={c.username} className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-sm last:border-0">
              <Avatar user={c.username} /> {c.username}
              <Badge tone={c.role === 'admin' ? 'red' : c.role === 'write' ? 'blue' : 'neutral'}>{c.role}</Badge>
              {c.status === 'invited' && (
                <>
                  <Badge tone="yellow">invitación pendiente</Badge>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => act((_, s) => { s.collaborators.find((x) => x.username === c.username)!.status = 'active'; }, `${c.username} aceptó la invitación (simulado)`)}>
                    Simular aceptación
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input value={user} onChange={(e) => setUser(e.target.value)} placeholder="usuario de GitHub" aria-label="Usuario a invitar" className="max-w-[200px]" />
          <Select value={role} onChange={(e) => setRole(e.target.value as 'read' | 'write' | 'admin')} aria-label="Rol">
            <option value="read">Read — ver y clonar</option>
            <option value="write">Write — push y PRs</option>
            <option value="admin">Admin — configuración</option>
          </Select>
          <Button
            size="sm"
            onClick={() => {
              let err: string | null = null;
              act((_, s) => {
                err = inviteCollaborator(s, user.trim(), role);
              }, `Invitación enviada a ${user}`);
              setError(err);
              if (!err) setUser('');
            }}
          >
            Invitar
          </Button>
        </div>
        {error && <p className="text-xs text-gred">{error}</p>}
        <SimNote>En GitHub real el invitado recibe un correo y debe aceptar. Aquí puedes simular la aceptación.</SimNote>
      </section>

      <section className="space-y-2">
        <h4 className="flex items-center gap-2 font-semibold">
          <Globe size={15} /> GitHub Pages
        </h4>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Publicar desde la rama</span>
          <Select value={pagesBranch} onChange={(e) => setPagesBranch(e.target.value)} aria-label="Rama de Pages">
            {Object.keys(server.heads).map((h) => (
              <option key={h}>{h}</option>
            ))}
          </Select>
          <Button size="sm" variant={server.pages.enabled ? 'danger' : 'primary'} disabled={!Object.keys(server.heads).length} onClick={() => act((_, s) => { s.pages = { enabled: !s.pages.enabled, branch: pagesBranch }; }, server.pages.enabled ? 'GitHub Pages desactivado' : `GitHub Pages activado desde ${pagesBranch}`)}>
            {server.pages.enabled ? 'Desactivar' : 'Activar Pages'}
          </Button>
        </div>
        {server.pages.enabled && (
          <>
            <Callout tone="success">
              Tu sitio estaría publicado en <b>https://{server.owner}.github.io/{server.name}/</b> (URL simulada). Cada push a {server.pages.branch} lo actualizaría.
            </Callout>
            {pagesHtml ? (
              <div className="overflow-hidden rounded-md border border-line">
                <p className="border-b border-line bg-bg-3 px-3 py-1 text-[11px] text-muted">Vista previa de index.html en {server.pages.branch}</p>
                <iframe title="Vista previa de GitHub Pages" sandbox="" srcDoc={pagesHtml} className="h-48 w-full bg-white" />
              </div>
            ) : (
              <p className="text-xs text-gyellow">No hay index.html en la rama {server.pages.branch}: Pages no tiene nada que mostrar.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
