'use client'

import { cn } from '@muni/ui/cn'
import { IconButton } from '@muni/ui/icon-button'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { type ReactNode } from 'react'

import { MobileNav } from './mobile-nav'
import { Brand, Nav, type NavGroup, type ShellLabels } from './nav'
import { usePersistedCollapse } from './use-persisted-collapse'

const TOP_BAR =
  'sticky top-0 z-30 flex h-header shrink-0 items-center gap-2 border-b border-border-default bg-surface-elevated/95 px-4 backdrop-blur sm:px-6 lg:px-5'

/** The frame for visitors (the landing page, sign-in): the top bar without navigation. */
export function PublicShell({
  appName,
  controls,
  children,
}: {
  appName: string
  controls: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className={TOP_BAR}>
        <Brand name={appName} />
        <div className="ml-auto flex shrink-0 items-center gap-2">{controls}</div>
      </header>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

/**
 * The app frame. A top bar at every size carries the logo and name, and the language, theme
 * and account controls. From `lg` a sidebar below it holds the navigation and collapses to
 * an icon rail (remembered in a cookie, so the server renders it the same way); below `lg`
 * the bar's menu opens the same navigation in a drawer.
 */
export function SidebarShell({
  groups,
  controls,
  labels,
  initiallyCollapsed,
  children,
}: {
  groups: NavGroup[]
  /** Language, theme and account controls, at the bar's end. */
  controls: ReactNode
  labels: ShellLabels
  initiallyCollapsed: boolean
  children: ReactNode
}) {
  const [collapsed, toggle] = usePersistedCollapse(initiallyCollapsed)

  return (
    <div className="flex min-h-dvh flex-col">
      <header className={TOP_BAR}>
        <MobileNav groups={groups} labels={labels} />
        <Brand name={labels.appName} />
        <div className="ml-auto flex shrink-0 items-center gap-2">{controls}</div>
      </header>

      <div className="flex flex-1">
        <aside
          id="sidebar"
          data-collapsed={collapsed}
          className={cn(
            'sticky top-header hidden h-[calc(100dvh-var(--spacing-header))] shrink-0 flex-col border-r border-border-default bg-surface-elevated transition-[width] duration-(--motion-normal) lg:flex',
            collapsed ? 'w-16' : 'w-64'
          )}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Nav groups={groups} label={labels.primary} collapsed={collapsed} />
          </div>
          <div
            className={cn(
              'flex border-t border-border-muted py-3',
              collapsed ? 'justify-center' : 'justify-end px-4'
            )}
          >
            <IconButton
              side="right"
              label={collapsed ? labels.expand : labels.collapse}
              aria-expanded={!collapsed}
              aria-controls="sidebar"
              onClick={toggle}
            >
              {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            </IconButton>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  )
}
