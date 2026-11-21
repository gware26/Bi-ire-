import type { ReactNode } from 'react'
import type { Icon } from '@phosphor-icons/react'

const TONES = {
  accent: 'bg-accent text-on-accent hover:brightness-110',
  primary: 'bg-primary text-on-primary hover:brightness-110',
  highlight: 'bg-highlight text-on-highlight hover:brightness-110',
  destructive: 'bg-destructive text-on-destructive hover:brightness-110',
  neutral: 'border-2 border-border bg-card text-card-foreground hover:bg-muted',
}

const SIZES = {
  lg: 'text-2xl sm:text-3xl',
  xl: 'text-4xl sm:text-5xl',
}

interface Props {
  onClick: () => void
  tone?: keyof typeof TONES
  size?: keyof typeof SIZES
  icon?: Icon
  hint?: string
  className?: string
  disabled?: boolean
  children: ReactNode
}

export function BigButton({
  onClick,
  tone = 'accent',
  size = 'lg',
  icon: IconCmp,
  hint,
  className = '',
  disabled,
  children,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl p-6 text-center font-display font-bold
        shadow-sm transition-[filter,background-color] duration-200 disabled:opacity-50 ${SIZES[size]} ${TONES[tone]} ${className}`}
    >
      <span className="flex flex-wrap items-center justify-center gap-3">
        {IconCmp && <IconCmp aria-hidden="true" weight="bold" className="size-[1.1em] shrink-0" />}
        {children}
      </span>
      {hint && <span className="font-sans text-lg font-medium">{hint}</span>}
    </button>
  )
}
