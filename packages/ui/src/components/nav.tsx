import { Slot } from 'radix-ui'
import type { AnchorHTMLAttributes, HTMLAttributes } from 'react'

import { cn } from '../cn'

/**
 * Underlined tab look, shared by Radix `Tabs` (`data-state=active`) and route tabs
 * (`aria-current=page`). It lives here, outside the client-only tabs module, so server
 * components can use it.
 */
export const tabTriggerClass = cn(
  'inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-fg-muted transition-colors hover:text-fg [&_svg]:size-4 [&_svg]:shrink-0',
  'data-[state=active]:border-accent data-[state=active]:text-fg',
  'aria-[current=page]:border-accent aria-[current=page]:text-fg'
)

/**
 * The baseline is an inset shadow, not a border: the triggers' underline then sits on it
 * without the usual negative margin, which overflowed the strip by 1px and showed a scrollbar.
 */
export const tabListClass =
  'scrollbar-none flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-border-default)]'

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
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-fg-muted transition-colors hover:bg-state-hover hover:text-fg [&_svg]:size-4 [&_svg]:shrink-0',
        'aria-[current=page]:bg-state-selected aria-[current=page]:text-fg',
        className
      )}
      {...props}
    />
  )
}
