'use client'

import { cn } from '@muni/ui/cn'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname()
  const active =
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-fg-muted transition-colors hover:bg-state-hover hover:text-fg',
        active && 'bg-state-selected text-fg'
      )}
    >
      {children}
    </Link>
  )
}
