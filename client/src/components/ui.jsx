import { Link } from 'react-router-dom'
import { Activity, LoaderCircle, TriangleAlert } from 'lucide-react'

const BUTTON_BASE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-bold transition ' +
  'disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]'
const BUTTON_VARIANTS = {
  primary: 'bg-accent text-ink hover:bg-accent-dark',
  ghost: 'bg-white/10 text-white hover:bg-white/20',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
}

export function Button({ variant = 'primary', className = '', loading = false, children, ...props }) {
  return (
    <button
      type="button"
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
      disabled={props.disabled || loading}
    >
      {loading && <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}

export function LinkButton({ variant = 'primary', className = '', children, ...props }) {
  return (
    <Link className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`} {...props}>
      {children}
    </Link>
  )
}

export const INPUT_CLASS =
  'min-h-12 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-base text-white ' +
  'placeholder:text-white/40 focus:border-accent focus:outline-none'

export function Field({ label, hint, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-semibold text-white/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-white/60">{hint}</span>}
    </label>
  )
}

export function Panel({ className = '', children }) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur sm:p-6 ${className}`}>
      {children}
    </div>
  )
}

export function ErrorNote({ children }) {
  if (!children) return null
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-950 px-4 py-3 text-sm font-semibold text-rose-100 ring-1 ring-rose-500/50">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

export function Spinner({ label = 'Загрузка…' }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-16 text-white/70">
      <LoaderCircle className="size-8 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function Logo({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-lg font-extrabold tracking-tight ${className}`}>
      <span className="grid size-9 place-items-center rounded-xl bg-accent text-ink">
        <Activity className="size-5" strokeWidth={3} aria-hidden="true" />
      </span>
      КвизПульс
    </span>
  )
}

// Экран-заглушка на всю высоту: «не найдено», «комната закрыта» и т.п.
export function Centered({ children }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-4 py-10 text-center">
      {children}
    </div>
  )
}
