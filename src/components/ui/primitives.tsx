import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

import { cn } from '@/lib/utils';

/* ==========================================================================
   Primitivas de interfaz. Server-safe: no usan hooks ni estado.
   ========================================================================== */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'brand-gradient text-white shadow-sm hover:brightness-[1.06] active:brightness-95',
  secondary:
    'bg-white text-[var(--color-ink)] border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-muted)] shadow-sm',
  ghost: 'text-[var(--color-ink-muted)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]',
  danger: 'bg-[var(--color-danger-500)] text-white hover:bg-[var(--color-danger-700)] shadow-sm',
  subtle: 'bg-[var(--color-brand-50)] text-[var(--color-brand-700)] hover:bg-[var(--color-brand-100)]',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 sm:h-10 px-4 text-sm rounded-lg gap-2',
  lg: 'h-11 px-5 text-base rounded-lg gap-2',
  icon: 'h-9 w-9 rounded-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Cabecera de tarjeta.
 *
 * El `icon` es opcional y decorativo: identifica el bloque de un vistazo en una
 * pantalla con varias tarjetas, pero el título siempre dice lo mismo por
 * escrito. Un icono nunca es la única forma de saber qué hay adentro — quien no
 * lo reconozca, o use lector de pantalla, no pierde nada.
 */
export function CardHeader({
  title,
  description,
  actions,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span
            aria-hidden
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-50)] text-[var(--color-brand-600)] [&>svg]:h-4 [&>svg]:w-4"
          >
            {icon}
          </span>
        )}
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-[var(--color-ink)]">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-[var(--color-ink-subtle)]">{description}</p>
        )}
      </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

type BadgeTone = 'neutral' | 'brand' | 'positive' | 'warning' | 'danger';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--color-canvas)] text-[var(--color-ink-muted)] ring-[var(--color-border-strong)]',
  brand: 'bg-[var(--color-brand-50)] text-[var(--color-brand-700)] ring-[var(--color-brand-200)]',
  positive: 'bg-[var(--color-positive-50)] text-[var(--color-positive-700)] ring-emerald-200',
  warning: 'bg-[var(--color-warning-50)] text-[var(--color-warning-700)] ring-amber-200',
  danger: 'bg-[var(--color-danger-50)] text-[var(--color-danger-700)] ring-red-200',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Label({
  htmlFor,
  children,
  required,
  className,
}: {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn('block text-sm font-medium text-[var(--color-ink-muted)]', className)}
    >
      {children}
      {required && <span className="ml-0.5 text-[var(--color-danger-500)]">*</span>}
    </label>
  );
}

// `text-base` en móvil (16px) evita el zoom automático de iOS al enfocar; en
// escritorio baja a `text-sm` (14px).
const FIELD_BASE =
  'w-full rounded-lg border bg-white px-3 py-2 text-base sm:text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-subtle)] transition-colors disabled:cursor-not-allowed disabled:bg-[var(--color-canvas)] disabled:text-[var(--color-ink-subtle)]';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      className={cn(
        FIELD_BASE,
        'h-11 sm:h-10',
        invalid
          ? 'border-[var(--color-danger-500)] focus:border-[var(--color-danger-500)]'
          : 'border-[var(--color-border-strong)] focus:border-[var(--color-brand-500)]',
        className,
      )}
      {...props}
    />
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export function Select({ className, invalid, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        FIELD_BASE,
        'h-11 sm:h-10 appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 20 20\' fill=\'%23667085\'%3E%3Cpath d=\'M5.5 7.5 10 12l4.5-4.5\' stroke=\'%23667085\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E")] bg-[length:20px_20px] bg-[right_0.5rem_center] bg-no-repeat pr-9',
        invalid ? 'border-[var(--color-danger-500)]' : 'border-[var(--color-border-strong)]',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({
  className,
  invalid,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      className={cn(
        FIELD_BASE,
        'min-h-[80px] resize-y',
        invalid ? 'border-[var(--color-danger-500)]' : 'border-[var(--color-border-strong)]',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Campo de formulario: etiqueta, control y, debajo, el error o la ayuda.
 *
 * El `icon` acompaña a la etiqueta y es puramente visual (`aria-hidden`): sirve
 * para recorrer un formulario largo con la vista y encontrar el campo que se
 * busca sin leer cada etiqueta. Nunca reemplaza al texto — un icono solo es
 * adivinanza, y de las que cada persona resuelve distinto.
 */
export function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  icon,
  children,
  className,
}: {
  label?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  error?: string | null;
  hint?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <Label htmlFor={htmlFor} required={required} className="flex items-center gap-1.5">
          {icon && (
            <span
              aria-hidden
              className="shrink-0 text-[var(--color-ink-subtle)] [&>svg]:h-3.5 [&>svg]:w-3.5"
            >
              {icon}
            </span>
          )}
          {label}
        </Label>
      )}
      {children}
      {error ? (
        <p className="text-xs font-medium text-[var(--color-danger-700)]">{error}</p>
      ) : hint ? (
        <p className="text-xs text-[var(--color-ink-subtle)]">{hint}</p>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-canvas)] text-[var(--color-ink-subtle)]">
          {icon}
        </div>
      )}
      <div>
        <p className="text-sm font-semibold text-[var(--color-ink)]">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--color-ink-subtle)]">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} />;
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-[var(--color-border)]">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4 px-5 py-3.5">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn('h-4', colIndex === 0 ? 'w-1/3' : 'flex-1')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <header className="warm-hero mb-5 flex flex-wrap items-start justify-between gap-4 rounded-3xl p-5 shadow-sm sm:p-6">
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1 text-xs text-[var(--color-ink-subtle)]">{breadcrumb}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-muted)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* --------------------------------- Tablas -------------------------------- */

export function TableWrapper({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      {/* `erp-table`: en móvil cada fila se apila como tarjeta (ver globals.css). */}
      <table className="erp-table w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = 'left',
  className,
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  return (
    <th
      className={cn(
        'border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-subtle)]',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className,
  colSpan,
  label,
}: {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  colSpan?: number;
  /** Etiqueta que se muestra antes del valor cuando la fila se ve como tarjeta (móvil). */
  label?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      data-label={label}
      className={cn(
        'border-b border-[var(--color-border)] px-4 py-3 text-[var(--color-ink)]',
        align === 'right' && 'text-right tabular',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('transition-colors hover:bg-[var(--color-surface-muted)]', className)} {...props}>
      {children}
    </tr>
  );
}
