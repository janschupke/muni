import type { ReactNode } from 'react'

import { cn } from '../cn'

/** A whole-page message: not found, error. The icon says which kind at a glance. */
export function PageMessage({
  title,
  description,
  icon,
  tone = 'neutral',
  actions,
  children,
}: {
  title: ReactNode
  description?: ReactNode | undefined
  icon?: ReactNode | undefined
  tone?: 'neutral' | 'danger' | undefined
  actions?: ReactNode | undefined
  /** Extra content under the actions (a reference, a list of links). */
  children?: ReactNode | undefined
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-16 text-center">
      {icon && (
        <div
          className={cn(
            'mb-5 flex size-14 items-center justify-center rounded-full [&_svg]:size-7',
            tone === 'danger' ? 'bg-danger-soft text-danger-fg' : 'bg-surface-sunken text-fg-muted'
          )}
        >
          {icon}
        </div>
      )}
      <h1 className="text-2xl font-semibold text-fg">{title}</h1>
      {description && <p className="mt-2 text-fg-muted">{description}</p>}
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
      {children && <div className="mt-6 text-sm text-fg-muted">{children}</div>}
    </div>
  )
}
