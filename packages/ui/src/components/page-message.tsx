import type { ReactNode } from 'react'

/** A whole-page message: not found, error. */
export function PageMessage({
  title,
  description,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold text-fg">{title}</h1>
      {description && <p className="mt-2 text-fg-muted">{description}</p>}
      {actions && <div className="mt-6 flex justify-center gap-2">{actions}</div>}
    </div>
  )
}
