/**
 * Componentes base de la interfaz: botones, tarjetas, insignias, pestañas,
 * diálogos y avisos.
 */
import { AlertTriangle, CheckCircle2, Info, Trophy, X } from 'lucide-react';
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef } from 'react';
import { useProgress } from '../store/progress';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  icon,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: ReactNode }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-accent text-white hover:brightness-110 border-transparent',
    secondary: 'bg-bg-3 text-fg hover:bg-bg-4 border-line',
    ghost: 'bg-transparent text-fg-2 hover:bg-bg-3 hover:text-fg border-transparent',
    danger: 'bg-gred/15 text-gred hover:bg-gred/25 border-gred/40',
    success: 'bg-ggreen/90 text-white hover:bg-ggreen border-transparent',
  };
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap',
        size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        styles[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function Card({ className, children, title, actions, icon }: { className?: string; children: ReactNode; title?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <section className={cx('rounded-lg border border-line bg-bg-2', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
            {icon}
            {title}
          </h3>
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'accent'; className?: string }) {
  const tones = {
    neutral: 'bg-bg-4 text-fg-2 border-line',
    green: 'bg-ggreen/15 text-ggreen border-ggreen/30',
    red: 'bg-gred/15 text-gred border-gred/30',
    yellow: 'bg-gyellow/15 text-gyellow border-gyellow/30',
    blue: 'bg-gblue/15 text-gblue border-gblue/30',
    purple: 'bg-gpurple/15 text-gpurple border-gpurple/30',
    accent: 'bg-accent/15 text-accent border-accent/30',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4', tones[tone], className)}>{children}</span>;
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode; icon?: ReactNode; badge?: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cx('flex gap-0.5 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors cursor-pointer',
            value === t.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg-2',
          )}
        >
          {t.icon}
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in" onMouseDown={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={cx('max-h-[90vh] w-full overflow-auto rounded-xl border border-line bg-bg-2 shadow-2xl outline-none', wide ? 'max-w-4xl' : 'max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg-2 px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button aria-label="Cerrar" onClick={onClose} className="rounded p-1 text-muted hover:bg-bg-3 hover:text-fg cursor-pointer">
            <X size={18} />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirmar',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="space-y-4 text-sm text-fg-2">{children}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export function Toasts() {
  const toasts = useProgress((s) => s.toasts);
  const dismiss = useProgress((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-bg-3 p-3 shadow-xl animate-in">
          <span className={cx('mt-0.5', t.tone === 'achievement' ? 'text-gyellow' : t.tone === 'success' ? 'text-ggreen' : t.tone === 'warn' ? 'text-gyellow' : 'text-gblue')}>
            {t.tone === 'achievement' ? <Trophy size={18} /> : t.tone === 'success' ? <CheckCircle2 size={18} /> : t.tone === 'warn' ? <AlertTriangle size={18} /> : <Info size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t.title}</p>
            {t.body && <p className="mt-0.5 text-xs text-fg-2">{t.body}</p>}
          </div>
          <button aria-label="Cerrar aviso" onClick={() => dismiss(t.id)} className="text-muted hover:text-fg cursor-pointer">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ProgressBar({ value, className, tone = 'accent' }: { value: number; className?: string; tone?: 'accent' | 'green' | 'blue' }) {
  const color = tone === 'green' ? 'bg-ggreen' : tone === 'blue' ? 'bg-gblue' : 'bg-accent';
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-bg-4', className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function PageHeader({ icon, title, subtitle, actions, kicker }: { icon?: ReactNode; title: string; subtitle?: ReactNode; actions?: ReactNode; kicker?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {kicker && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-accent">{kicker}</p>}
        <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight sm:text-2xl">
          {icon && <span className="text-accent">{icon}</span>}
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-fg-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Callout({ tone = 'info', title, children, icon }: { tone?: 'info' | 'warn' | 'success' | 'danger' | 'sim'; title?: ReactNode; children: ReactNode; icon?: ReactNode }) {
  const tones = {
    info: 'border-gblue/30 bg-gblue/8 text-fg-2',
    warn: 'border-gyellow/40 bg-gyellow/8 text-fg-2',
    success: 'border-ggreen/30 bg-ggreen/8 text-fg-2',
    danger: 'border-gred/40 bg-gred/8 text-fg-2',
    sim: 'border-gpurple/35 bg-gpurple/8 text-fg-2',
  };
  return (
    <div className={cx('rounded-lg border px-4 py-3 text-sm leading-relaxed', tones[tone])}>
      {title && (
        <p className="mb-1 flex items-center gap-2 font-semibold text-fg">
          {icon}
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-2 bg-bg-3 px-1.5 py-0.5 font-mono text-[11px] text-fg-2">{children}</kbd>;
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-bg-4 px-1.5 py-0.5 font-mono text-[0.85em] text-accent-2">{children}</code>;
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-sm text-muted">
      <span className="text-line-2">{icon}</span>
      <p className="font-medium text-fg-2">{title}</p>
      {children}
    </div>
  );
}
