'use client'

import { Button } from '@muni/ui/button'
import { cn } from '@muni/ui/cn'
import { Drawer } from '@muni/ui/dialog'
import { IconButton } from '@muni/ui/icon-button'
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode, useEffect, useState } from 'react'

import { SIDEBAR_COOKIE } from '@/lib/sidebar'

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

/** Where the sidebar takes over from the drawer: Tailwind's `lg`. */
const DESKTOP = '(min-width: 64rem)'

function Brand({ name }: { name: string }) {
  return (
    // The app's mark and name: known as the way home by its place, not by a link colour.
    <Link
      href="/"
      data-slot="brand"
      className="flex min-h-9 min-w-0 items-center gap-2.5 rounded-md font-semibold text-fg transition-colors hover:text-accent-text"
    >
      <LogoMark />
      {/* A phone keeps the mark only; the name stays the link's accessible text. */}
      <span className="truncate max-sm:sr-only">{name}</span>
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

/** The navigation drawer of small screens: it closes on any route change and at `lg`. */
function MobileNav({ groups, labels }: { groups: NavGroup[]; labels: ShellLabels }) {
  const pathname = usePathname()
  const [drawer, setDrawer] = useState({ open: false, at: pathname })
  // A route change (a link, the back button) closes it: adjusted while rendering, as React
  // recommends for state that follows a prop.
  if (drawer.at !== pathname) setDrawer({ open: false, at: pathname })
  const close = () => {
    setDrawer(d => ({ ...d, open: false }))
  }

  // Widening past `lg` swaps the drawer for the sidebar, so it must not stay open behind it.
  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP)
    const onChange = () => {
      if (desktop.matches) setDrawer(d => ({ ...d, open: false }))
    }
    desktop.addEventListener('change', onChange)
    return () => {
      desktop.removeEventListener('change', onChange)
    }
  }, [])

  return (
    <Drawer
      open={drawer.open}
      onOpenChange={open => {
        setDrawer({ open, at: pathname })
      }}
      title={labels.menu}
      closeLabel={labels.close}
      trigger={
        <Button variant="ghost" size="icon" aria-label={labels.menu} className="lg:hidden">
          <Menu aria-hidden />
        </Button>
      }
    >
      <Nav groups={groups} label={labels.primary} onNavigate={close} />
    </Drawer>
  )
}

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
  const [collapsed, setCollapsed] = useState(initiallyCollapsed)

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`
  }

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
