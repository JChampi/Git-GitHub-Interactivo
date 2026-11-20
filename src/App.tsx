import { Menu, Moon, PanelRightClose, PanelRightOpen, Sun, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';
import { ContextPanel } from './components/ContextPanel';
import { ProgressBar, Toasts, cx } from './components/ui';
import { MODULES, moduleById } from './data/modules';
import { href, useRoute } from './lib/router';
import { levelFor, useProgress } from './store/progress';
import { useUI } from './store/ui';

const PAGES: Record<string, ComponentType<{ segments: string[] }>> = {
  dashboard: lazy(() => import('./modules/Dashboard')),
  fundamentos: lazy(() => import('./modules/Fundamentals')),
  terminal: lazy(() => import('./modules/TerminalModule')),
  repositorios: lazy(() => import('./modules/Repositories')),
  historial: lazy(() => import('./modules/History')),
  ramas: lazy(() => import('./modules/Branches')),
  deshacer: lazy(() => import('./modules/Undo')),
  remoto: lazy(() => import('./modules/Remote')),
  github: lazy(() => import('./modules/GitHubModule')),
  colaboracion: lazy(() => import('./modules/Collaboration')),
  conflictos: lazy(() => import('./modules/Conflicts')),
  workflows: lazy(() => import('./modules/Workflows')),
  archivos: lazy(() => import('./modules/ImportantFiles')),
  sandbox: lazy(() => import('./modules/Sandbox')),
  guiado: lazy(() => import('./modules/Guided')),
  escenarios: lazy(() => import('./modules/Scenarios')),
  retos: lazy(() => import('./modules/Challenges')),
  evaluaciones: lazy(() => import('./modules/Evaluations')),
  progreso: lazy(() => import('./modules/ProgressPage')),
  diccionario: lazy(() => import('./modules/Dictionary')),
};

function Sidebar() {
  const { path } = useRoute();
  const open = useUI((s) => s.sidebarOpen);
  const toggle = useUI((s) => s.toggleSidebar);
  const xp = useProgress((s) => s.xp);
  const visited = useProgress((s) => s.modulesVisited);
  const completed = useProgress((s) => s.modulesCompleted);
  const lvl = levelFor(xp);
  const groups = ['Inicio', 'Aprender', 'Practicar', 'Seguimiento'] as const;
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => toggle(false)} aria-hidden />}
      <nav
        aria-label="Navegación principal"
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-bg-1 transition-transform duration-200 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <a href={href('dashboard')} className="flex items-center gap-2.5 border-b border-line px-4 py-3.5" onClick={() => toggle(false)}>
          <img src="/logo_github.png" alt="GitHub" className="brand-logo h-8 w-8" />
          <span className="leading-tight">
            <span className="block text-sm font-semibold">Git &amp; GitHub</span>
            <span className="block text-[11px] text-muted">Interactive Lab</span>
          </span>
          <button className="ml-auto rounded p-1 text-muted lg:hidden cursor-pointer" aria-label="Cerrar menú" onClick={(e) => { e.preventDefault(); toggle(false); }}>
            <X size={16} />
          </button>
        </a>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {groups.map((g) => (
            <div key={g} className="mb-3">
              <p className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">{g}</p>
              {MODULES.filter((m) => m.group === g).map((m) => {
                const Icon = m.icon;
                const active = path === m.id;
                return (
                  <a
                    key={m.id}
                    href={href(m.id)}
                    onClick={() => toggle(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors',
                      active ? 'bg-bg-3 font-medium text-fg' : 'text-fg-2 hover:bg-bg-2 hover:text-fg',
                    )}
                  >
                    <Icon size={15} className={cx(active ? 'text-accent' : 'text-muted group-hover:text-fg-2')} />
                    <span className="truncate">{m.label}</span>
                    {m.countsForProgress && (completed[m.id] ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-ggreen" title="Completado" /> : visited[m.id] ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gyellow/70" title="Visitado" /> : null)}
                  </a>
                );
              })}
            </div>
          ))}
        </div>
        <a href={href('progreso')} className="border-t border-line px-4 py-3 hover:bg-bg-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">Nivel {lvl.level} · {lvl.name}</span>
            <span className="font-mono text-muted">{xp} XP</span>
          </div>
          <ProgressBar value={lvl.progress} className="mt-1.5" />
          {lvl.next && <p className="mt-1 text-[10.5px] text-muted">{lvl.next.xp - xp} XP para nivel {lvl.next.level}</p>}
        </a>
      </nav>
    </>
  );
}

export default function App() {
  const { path, segments } = useRoute();
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  const panelOpen = useUI((s) => s.panelOpen);
  const togglePanel = useUI((s) => s.togglePanel);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const visit = useProgress((s) => s.visitModule);
  const tick = useProgress((s) => s.tick);
  const [mobilePanel, setMobilePanel] = useState(false);
  const mod = moduleById(path) ?? MODULES[0];
  const isWide = () => window.matchMedia('(min-width: 1280px)').matches;
  const Page = PAGES[mod.id] ?? PAGES.dashboard;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    visit(mod.id);
    document.title = `${mod.label} · Git & GitHub Interactive Lab`;
    window.scrollTo({ top: 0 });
  }, [mod.id, mod.label, visit]);

  // Tiempo de aprendizaje: solo cuenta con la pestaña visible.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') tick(15);
    }, 15000);
    return () => window.clearInterval(id);
  }, [tick]);

  return (
    <div className="flex h-full">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-bg-3 focus:px-3 focus:py-2">
        Saltar al contenido
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-bg-1 px-3 sm:px-4">
          <button className="rounded p-1.5 text-fg-2 hover:bg-bg-3 lg:hidden cursor-pointer" aria-label="Abrir menú" onClick={() => toggleSidebar(true)}>
            <Menu size={18} />
          </button>
          <mod.icon size={16} className="text-accent" />
          <span className="truncate text-sm font-medium">{mod.label}</span>
          <span className="hidden truncate text-xs text-muted md:inline">— {mod.description}</span>
          <div className="ml-auto flex items-center gap-1">
            <button className="rounded p-1.5 text-fg-2 hover:bg-bg-3 cursor-pointer" aria-label={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button className="rounded p-1.5 text-fg-2 hover:bg-bg-3 cursor-pointer" aria-label={panelOpen ? 'Ocultar panel contextual' : 'Mostrar panel contextual'} title="Panel contextual" onClick={() => (isWide() ? togglePanel() : setMobilePanel((v) => !v))}>
              {panelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <main id="contenido" className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 animate-in" key={mod.id}>
              <Suspense fallback={<p className="p-8 text-center text-sm text-muted">Cargando módulo…</p>}>
                <Page segments={segments} />
              </Suspense>
            </div>
          </main>
          {panelOpen && <ContextPanel className="hidden w-80 shrink-0 xl:flex" />}
          {mobilePanel && (
            <div className="fixed inset-0 z-30 flex justify-end bg-black/40 xl:hidden" onClick={() => setMobilePanel(false)}>
              <div onClick={(e) => e.stopPropagation()} className="h-full w-[min(22rem,90vw)]">
                <ContextPanel className="h-full" onClose={() => setMobilePanel(false)} />
              </div>
            </div>
          )}
        </div>
      </div>
      <Toasts />
    </div>
  );
}
