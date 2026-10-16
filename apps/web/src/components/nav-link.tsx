'use client'

import { NavItem } from '@muni/ui/nav'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/** Header navigation item, marked current for its route and everything below it. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname()
  const active =
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
  return (
    <NavItem asChild active={active}>
      <Link href={href}>{children}</Link>
    </NavItem>
  )
}
