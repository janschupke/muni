'use client'

import type { ReactNode } from 'react'

import { IntentLink } from '@/components/navigation/intent-link'

import { LogoMark } from './logo-mark'
import { NavLink } from './nav-link'

export interface NavGroup {
  /** null for the first group (the overview), which has no heading. */
  label: string | null
  items: { href: string; label: string; icon: ReactNode }[]
}

export interface ShellLabels {
  appName: string
  primary: string
  menu: string
  close: string
  collapse: string
  expand: string
}

export function Brand({ name }: { name: string }) {
  return (
    // The app's mark and name: known as the way home by its place, not by a link colour.
    <IntentLink
      href="/"
      data-slot="brand"
      className="flex min-h-9 min-w-0 items-center gap-2.5 rounded-md font-semibold text-fg transition-colors hover:text-accent-text"
    >
      <LogoMark />
      {/* A phone keeps the mark only; the name stays the link's accessible text. */}
      <span className="truncate max-sm:sr-only">{name}</span>
    </IntentLink>
  )
}

export function Nav({
  groups,
  label,
  collapsed = false,
  onNavigate,
}: {
  groups: NavGroup[]
  label: string
  collapsed?: boolean | undefined
  onNavigate?: (() => void) | undefined
}) {
  return (
    <nav aria-label={label} className="flex flex-col gap-4 px-3 py-4">
      {groups.map(group => (
        <div key={group.label ?? group.items[0]?.href} className="flex flex-col gap-1">
          {group.label &&
            (collapsed ? (
              <hr className="mx-2 mb-1 border-border-muted" />
            ) : (
              <p className="px-3 pb-1 text-xs font-medium tracking-wide text-fg-subtle uppercase">
                {group.label}
              </p>
            ))}
          <ul className="flex flex-col gap-0.5">
            {group.items.map(item => (
              <li key={item.href}>
                <NavLink {...item} collapsed={collapsed} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
