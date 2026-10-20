'use client'

import { cn } from '@muni/ui/cn'
import { NavItem } from '@muni/ui/nav'
import { Tooltip } from '@muni/ui/tooltip'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/** Current for its route and everything below it; the overview only for itself. */
function isActive(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * A primary-navigation item. In the collapsed rail only its icon shows; the label stays its
 * accessible name and appears as a tooltip.
 */
export function NavLink({
  href,
  icon,
  label,
  collapsed = false,
  onNavigate,
}: {
  href: string
  icon: ReactNode
  label: string
  collapsed?: boolean | undefined
  onNavigate?: (() => void) | undefined
}) {
  const pathname = usePathname()
  const link = (
    <NavItem
      asChild
      active={isActive(href, pathname)}
      className={cn('w-full', collapsed ? 'justify-center px-0' : 'justify-start')}
    >
      <Link
        href={href}
        // Next's Link types `onClick` without `undefined`: pass it only when there is one.
        {...(onNavigate && { onClick: onNavigate })}
        aria-label={collapsed ? label : undefined}
      >
        {icon}
        {!collapsed && label}
      </Link>
    </NavItem>
  )
  return collapsed ? (
    <Tooltip content={label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  )
}
