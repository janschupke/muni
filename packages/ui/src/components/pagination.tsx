import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'

import { cn } from '../cn'
import { Button } from './button'

type LinkComponent = ComponentType<{ href: string; children: ReactNode; rel?: string | undefined }>

interface PaginationLabels {
  /** Accessible name of the navigation landmark. */
  nav: string
  previous: string
  next: string
  /** "Page 2 of 5". */
  status: ReactNode
}

/**
 * Previous / next with a page status. Either links (`hrefFor`, rendered with `linkAs`,
 * e.g. Next's `Link`) or buttons (`onPageChange`). Renders nothing for a single page.
 */
export function Pagination({
  page,
  pageCount,
  labels,
  hrefFor,
  linkAs: LinkAs,
  onPageChange,
  className,
}: {
  /** 1-based. */
  page: number
  pageCount: number
  labels: PaginationLabels
  /** Link mode: where each page lives, rendered with `linkAs`. */
  hrefFor?: ((page: number) => string) | undefined
  linkAs?: LinkComponent | undefined
  /** Button mode. */
  onPageChange?: ((page: number) => void) | undefined
  className?: string | undefined
}) {
  if (pageCount <= 1) return null

  const step = (target: number, rel: 'prev' | 'next', children: ReactNode) => {
    const disabled = target < 1 || target > pageCount
    if (hrefFor && LinkAs && !disabled) {
      return (
        <Button asChild size="sm">
          <LinkAs href={hrefFor(target)} rel={rel}>
            {children}
          </LinkAs>
        </Button>
      )
    }
    // Only button mode gets a handler: a link-mode page renders on the server, where a
    // disabled step must stay a plain element.
    return (
      <Button
        size="sm"
        disabled={disabled}
        onClick={
          onPageChange &&
          (() => {
            onPageChange(target)
          })
        }
      >
        {children}
      </Button>
    )
  }

  return (
    <nav
      aria-label={labels.nav}
      className={cn(
        'mt-4 flex items-center justify-between gap-2 text-sm text-fg-muted',
        className
      )}
    >
      {step(
        page - 1,
        'prev',
        <>
          <ChevronLeft aria-hidden />
          {labels.previous}
        </>
      )}
      <span className="tabular-nums">{labels.status}</span>
      {step(
        page + 1,
        'next',
        <>
          {labels.next}
          <ChevronRight aria-hidden />
        </>
      )}
    </nav>
  )
}
