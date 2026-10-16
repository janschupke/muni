import type { ReactNode } from 'react'

export function EmptyState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border-emphasis px-6 py-10 text-center">
      <p className="font-medium text-fg">{title}</p>
      {children && <div className="mt-1 text-sm text-fg-muted">{children}</div>}
    </div>
  )
}
