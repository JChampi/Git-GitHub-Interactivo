/**
 * Tipos del motor de simulación Git.
 *
 * Todo el estado es serializable (objetos planos) para poder guardarlo en
 * localStorage y clonarlo con structuredClone antes de cada operación.
 */

/** Árbol plano: ruta relativa a la raíz del repositorio → hash del blob. */
export type Tree = Record<string, string>;

export interface Person {
  name: string;
  email: string;
}

export interface Commit {
  sha: string;
  tree: Tree;
  parents: string[];
  message: string;
  author: Person;
  committer: Person;
  timestamp: number;
}

export interface ObjectStore {
  commits: Record<string, Commit>;
  blobs: Record<string, string>;
}

export interface Tag {
  name: string;
  target: string;
  annotated: boolean;
  message?: string;
  tagger?: Person;
  timestamp?: number;
}

export type Head = { kind: 'branch'; name: string } | { kind: 'detached'; sha: string };

export interface ReflogEntry {
  sha: string;
  prev: string | null;
  message: string;
  timestamp: number;
}

export interface Upstream {
  remote: string;
  branch: string;
}

/** Operación en curso (merge / revert / cherry-pick / rebase con conflictos). */
export interface PendingOperation {
  kind: 'merge' | 'revert' | 'cherry-pick' | 'rebase';
  /** Commit "de ellos" (rama fusionada, commit revertido o aplicado). */
  theirs: string;
  theirsLabel: string;
  /** Estado previo para poder hacer --abort. */
  origHead: string | null;
  origBranch: string | null;
  message: string;
  conflicts: string[];
  /** Solo rebase: commits restantes por aplicar, destino y autor del commit actual. */
  rebase?: {
    onto: string;
    upstreamLabel: string;
    remaining: string[];
    current: string;
    branch: string | null;
  };
}

export interface StashEntry {
  message: string;
  base: string;
  index: Tree;
  worktree: Record<string, string | null>;
  timestamp: number;
}

export interface Repository {
  root: string;
  objects: ObjectStore;
  heads: Record<string, string>;
  remoteRefs: Record<string, string>;
  tags: Record<string, Tag>;
  head: Head;
  index: Tree;
  reflog: ReflogEntry[];
  remotes: Record<string, string>;
  upstream: Record<string, Upstream>;
  config: Record<string, string>;
  operation: PendingOperation | null;
  stash: StashEntry[];
}

// ---------------------------------------------------------------------------
// Servidor remoto simulado (estilo GitHub)
// ---------------------------------------------------------------------------

export interface Comment {
  id: number;
  author: string;
  body: string;
  timestamp: number;
}

export interface Issue {
  number: number;
  title: string;
  body: string;
  author: string;
  state: 'open' | 'closed';
  labels: string[];
  comments: Comment[];
  timestamp: number;
  closedBy?: string;
}

export interface Review {
  id: number;
  author: string;
  state: 'approved' | 'changes_requested' | 'commented';
  body: string;
  timestamp: number;
  /** Commit revisado: si llegan commits nuevos, la revisión queda desactualizada. */
  commit: string;
}

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  author: string;
  /** URL del repositorio que contiene la rama head (igual al repo base salvo forks). */
  headRepo: string;
  head: string;
  base: string;
  state: 'open' | 'closed' | 'merged';
  reviews: Review[];
  comments: Comment[];
  timestamp: number;
  mergedSha?: string;
  mergedBy?: string;
  mergeMethod?: 'merge' | 'squash';
  /** Commit head en el momento de fusionar o cerrar. */
  headSha?: string;
}

export interface BranchProtection {
  requirePullRequest: boolean;
  requiredApprovals: number;
  allowForcePush: boolean;
}

export interface Collaborator {
  username: string;
  role: 'read' | 'write' | 'admin';
  status: 'active' | 'invited';
}

export interface Release {
  tag: string;
  title: string;
  notes: string;
  target: string;
  author: string;
  timestamp: number;
  prerelease: boolean;
}

export interface WorkflowRun {
  id: number;
  workflow: string;
  file: string;
  event: 'push' | 'pull_request';
  branch: string;
  sha: string;
  status: 'success' | 'failure';
  steps: { name: string; ok: boolean; log: string }[];
  timestamp: number;
}

export interface RemoteServer {
  url: string;
  owner: string;
  name: string;
  description: string;
  visibility: 'public' | 'private';
  objects: ObjectStore;
  heads: Record<string, string>;
  tags: Record<string, Tag>;
  defaultBranch: string;
  issues: Issue[];
  pulls: PullRequest[];
  nextNumber: number;
  protectedBranches: Record<string, BranchProtection>;
  collaborators: Collaborator[];
  stars: number;
  starredByMe: boolean;
  watching: boolean;
  forks: number;
  forkOf?: string;
  releases: Release[];
  pages: { enabled: boolean; branch: string };
  runs: WorkflowRun[];
  topics: string[];
  /** Tablero de GitHub Projects: número de issue → columna. */
  project?: Record<string, 'todo' | 'doing' | 'done'>;
}

// ---------------------------------------------------------------------------
// Mundo: sistema de archivos virtual + repos locales + servidores remotos
// ---------------------------------------------------------------------------

export interface VirtualFS {
  files: Record<string, string>;
  dirs: Record<string, true>;
}

export interface World {
  fs: VirtualFS;
  cwd: string;
  home: string;
  repos: Record<string, Repository>;
  servers: Record<string, RemoteServer>;
  globalConfig: Record<string, string>;
  /** Usuario de la plataforma remota simulada (GitHub). */
  githubUser: string;
  clock: number;
  /** Si es true el reloj avanza de forma determinista (pruebas). */
  deterministicClock?: boolean;
}

// ---------------------------------------------------------------------------
// Salida de la terminal
// ---------------------------------------------------------------------------

export type Color =
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'cyan'
  | 'magenta'
  | 'dim'
  | 'bold'
  | 'error'
  | 'hint'
  | 'prompt';

export interface Seg {
  t: string;
  c?: Color;
}

export type Line = Seg[];

export type ShellEvent =
  | { type: 'clear' }
  | { type: 'open-editor'; path: string }
  | { type: 'open-mergetool'; path: string };

export interface ExecResult {
  world: World;
  lines: Line[];
  ok: boolean;
  events: ShellEvent[];
  /** Clave del diccionario para mostrar la explicación contextual (p. ej. "git commit"). */
  topic?: string;
  /** Registro de cada comando ejecutado (para validar retos y estadísticas). */
  records: CommandRecord[];
}

export interface CommandRecord {
  input: string;
  /** Programa + subcomando: "git commit", "ls", ... */
  command: string;
  argv: string[];
  ok: boolean;
  timestamp: number;
}
