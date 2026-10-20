import type { ReactNode } from 'react'

import { cn } from '../../cn'

/**
 * A whole-page message: not found, error. The icon says which kind at a glance. Its title is
 * the page's `h1`, or an `h2` where the page already has its own title above (`level`).
 */
export function PageMessage({
  title,
  description,
  icon,
  tone = 'neutral',
  actions,
  level = 1,
  children,
}: {
  title: ReactNode
  description?: ReactNode | undefined
  icon?: ReactNode | undefined
  tone?: 'neutral' | 'danger' | undefined
  actions?: ReactNode | undefined
  level?: 1 | 2 | undefined
  /** Extra content under the actions (a reference, a list of links). */
  children?: ReactNode | undefined
}) {
  const Heading = level === 1 ? 'h1' : 'h2'
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-16 text-center">
      {Boolean(icon) && (
        <div
          className={cn(
            'mb-5 flex size-14 items-center justify-center rounded-full [&_svg]:size-7',
            tone === 'danger' ? 'bg-danger-soft text-danger-fg' : 'bg-tint text-fg-muted'
          )}
        >
          {icon}
        </div>
      )}
      <Heading className="text-2xl font-semibold text-fg">{title}</Heading>
      {Boolean(description) && <p className="mt-2 text-fg-muted">{description}</p>}
      {Boolean(actions) && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>
      )}
      {Boolean(children) && <div className="mt-6 text-sm text-fg-muted">{children}</div>}
    </div>
  )
}
