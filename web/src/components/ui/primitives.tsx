import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Severity } from '@/lib/types';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-brand-700/50',
  secondary: 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-50 disabled:text-stone-400',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-700/50',
  ghost: 'text-stone-700 hover:bg-stone-100',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

const SEVERITY_STYLES: Record<Severity, string> = {
  CRITICAL: 'bg-red-50 text-red-800 ring-red-200',
  WARNING: 'bg-amber-50 text-amber-900 ring-amber-200',
};

export function SeverityBadge({ severity, children }: { severity: Severity; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${SEVERITY_STYLES[severity]}`}>
      <span aria-hidden>{severity === 'CRITICAL' ? '●' : '▲'}</span>
      <span className="sr-only">{severity === 'CRITICAL' ? 'Crítico:' : 'Alerta:'}</span>
      {children}
    </span>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-stone-800">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && !error && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-stone-100';

export function Spinner({ label = 'Carregando' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-stone-500">
      <span className="size-4 animate-spin rounded-full border-2 border-stone-300 border-t-brand-700" aria-hidden />
      {label}
    </span>
  );
}

export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <p className="text-base font-semibold text-red-900">{title}</p>
      <p className="mt-1 text-sm text-red-800">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center">
      <p className="text-base font-semibold text-stone-800">{title}</p>
      {message && <p className="mt-1 text-sm text-stone-600">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Mostra a lista de requisitos faltantes que a API devolve (ex.: valor estimado, item de brinde). */
export function ApiErrorMessage({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as { message?: string; details?: { missing?: { message: string }[]; issues?: { path: string; message: string }[] } };
  const missing = e.details?.missing;
  const issues = e.details?.issues;
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
      {missing?.length ? (
        <>
          <p className="font-medium">Para continuar, falta:</p>
          <ul className="mt-1 list-disc pl-5">
            {missing.map((m) => (
              <li key={m.message}>{m.message}</li>
            ))}
          </ul>
        </>
      ) : issues?.length ? (
        <ul className="list-disc pl-5">
          {issues.map((i) => (
            <li key={i.path + i.message}>{i.message}</li>
          ))}
        </ul>
      ) : (
        <p>{e.message ?? 'Algo deu errado.'}</p>
      )}
    </div>
  );
}
