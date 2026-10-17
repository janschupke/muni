'use client'

import { ChevronRight } from 'lucide-react'
import type { ComponentProps } from 'react'

import { cn } from '../cn'

/**
 * The disclosure chevron that opens a row's details: a table's own rows (DataTable) and the
 * compliance matrix's departments open the same way.
 */
export function ExpandButton({
  open,
  className,
  ...props
}: Omit<ComponentProps<'button'>, 'aria-expanded' | 'type'> & { open: boolean }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-state-active hover:text-fg',
        className
      )}
      {...props}
    >
      <ChevronRight
        aria-hidden
        className={cn('size-4 transition-transform', open && 'rotate-90')}
      />
    </button>
  )
}
