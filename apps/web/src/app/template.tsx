import type { ReactNode } from 'react'

/**
 * Remounts on every route change (unlike a layout), so each page fades in: the route-change
 * cue. Search-param changes (filters, sort) keep the page mounted and do not replay it.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="animate-fade-in">{children}</div>
}
