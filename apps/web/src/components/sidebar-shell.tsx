'use client'

import { Button } from '@muni/ui/button'
import { cn } from '@muni/ui/cn'
import { Drawer } from '@muni/ui/dialog'
import { Tooltip } from '@muni/ui/tooltip'
import { GraduationCap, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'

import { SIDEBAR_COOKIE } from '@/lib/sidebar'

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

function Brand({ name, iconOnly = false }: { name: string; iconOnly?: boolean }) {
  return (
    <Link
      href="/"
      aria-label={iconOnly ? name : undefined}
      className="flex min-h-9 items-center gap-2 rounded-md font-semibold text-fg transition-colors hover:text-accent-text"
    >
      <GraduationCap aria-hidden className="size-5 shrink-0 text-accent-text" />
      {!iconOnly && <span className="truncate">{name}</span>}
    </Link>
  )
}

function Nav({
  groups,
  label,
  collapsed = false,
  onNavigate,
}: {
  groups: NavGroup[]
  label: string
  collapsed?: boolean
  onNavigate?: () => void
}) {
  return (
    <nav aria-label={label} className="flex flex-col gap-4 px-3 py-4">
      {groups.map((group, index) => (
        <div key={group.label ?? index} className="flex flex-col gap-1">
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

/**
 * The app frame: from `lg` a left sidebar that collapses to an icon rail (remembered in a
 * cookie, so the server renders it the same way); below `lg` a top bar whose menu opens the
 * same navigation in a drawer.
 */
export function SidebarShell({
  groups,
  controls,
  labels,
  initiallyCollapsed,
  children,
}: {
  groups: NavGroup[]
  /** Language, theme and account controls, shown expanded and in the drawer. */
  controls: ReactNode
  labels: ShellLabels
  initiallyCollapsed: boolean
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = usePathname()

  // A route change (link, back button) closes the drawer.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrawerOpen(false)
  }, [pathname])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <div className="flex min-h-dvh">
      <aside
        id="sidebar"
        data-collapsed={collapsed}
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border-default bg-surface-elevated transition-[width] duration-(--motion-normal) lg:flex',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <div
          className={cn(
            'flex h-14 items-center border-b border-border-muted',
            collapsed ? 'justify-center' : 'px-5'
          )}
        >
          <Brand name={labels.appName} iconOnly={collapsed} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Nav groups={groups} label={labels.primary} collapsed={collapsed} />
        </div>
        <div
          className={cn(
            'flex flex-col gap-3 border-t border-border-muted py-3',
            collapsed ? 'items-center' : 'px-4'
          )}
        >
          {!collapsed && controls}
          <Tooltip content={collapsed ? labels.expand : labels.collapse} side="right">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={collapsed ? labels.expand : labels.collapse}
              aria-expanded={!collapsed}
              aria-controls="sidebar"
              onClick={toggle}
              className={collapsed ? undefined : 'self-end'}
            >
              {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            </Button>
          </Tooltip>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border-default bg-surface-elevated/95 px-4 backdrop-blur sm:px-6 lg:hidden">
          <Brand name={labels.appName} />
          <Drawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            title={labels.appName}
            closeLabel={labels.close}
            trigger={
              <Button variant="ghost" size="icon" aria-label={labels.menu}>
                <Menu aria-hidden />
              </Button>
            }
          >
            <Nav
              groups={groups}
              label={labels.primary}
              onNavigate={() => {
                setDrawerOpen(false)
              }}
            />
            <div className="mt-auto flex flex-col gap-3 border-t border-border-muted p-4">
              {controls}
            </div>
          </Drawer>
        </div>
        {children}
      </div>
    </div>
  )
}
