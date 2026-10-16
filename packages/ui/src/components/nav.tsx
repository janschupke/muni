import { Slot } from 'radix-ui'
import type { AnchorHTMLAttributes, HTMLAttributes } from 'react'

import { cn } from '../cn'

/**
 * Underlined tab look, shared by Radix `Tabs` (`data-state=active`) and route tabs
 * (`aria-current=page`). It lives here, outside the client-only tabs module, so server
 * components can use it.
 */
export const tabTriggerClass = cn(
  '-mb-px inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-fg-muted hover:text-fg',
  'data-[state=active]:border-accent data-[state=active]:text-fg',
  'aria-[current=page]:border-accent aria-[current=page]:text-fg'
)

export const tabListClass = 'flex gap-1 overflow-x-auto border-b border-border-default'

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { asChild?: boolean; active?: boolean }

/** Tabs that are routes: each tab is a link, the current one marked `aria-current="page"`. */
export function LinkTabs({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <nav className={cn(tabListClass, 'mb-4', className)} {...props} />
}

export function LinkTab({ asChild = false, active = false, className, ...props }: LinkProps) {
  const Comp = asChild ? Slot.Root : 'a'
  return (
    <Comp
      aria-current={active ? 'page' : undefined}
      className={cn(tabTriggerClass, className)}
      {...props}
    />
  )
}

/** A primary-navigation item (header). */
export function NavItem({ asChild = false, active = false, className, ...props }: LinkProps) {
  const Comp = asChild ? Slot.Root : 'a'
  return (
    <Comp
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-fg-muted transition-colors hover:bg-state-hover hover:text-fg',
        'aria-[current=page]:bg-state-selected aria-[current=page]:text-fg',
        className
      )}
      {...props}
    />
  )
}
