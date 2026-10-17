'use client'

import { surfaceClass } from '@muni/ui/card'
import { cn } from '@muni/ui/cn'
import { Skeleton, SkeletonText } from '@muni/ui/skeleton'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

// Placeholders shaped like the pages they stand in for, so nothing moves when the data comes.

/** Says "Loading" to assistive technology while its placeholders show. */
export function LoadingRegion({ children }: { children: ReactNode }) {
  const t = useTranslations('common')
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{t('loading')}</span>
      {children}
    </div>
  )
}

/** A page heading: the title, and room for a line under it. */
function HeaderSkeleton() {
  return (
    <div className="mb-6 flex flex-col gap-2">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-8 w-64 max-w-full" />
    </div>
  )
}

/** A table: a header row and `rows` rows of `columns` cells. */
export function TableSkeleton({
  rows = 8,
  columns = 4,
}: {
  rows?: number | undefined
  columns?: number | undefined
}) {
  return (
    <div className={cn(surfaceClass, 'overflow-hidden')}>
      <div className="flex gap-4 border-b border-border-default bg-surface-sunken px-4 py-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="flex gap-4 border-b border-border-muted px-4 py-3.5 last:border-0"
        >
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton key={i} className={cn('h-4 flex-1', i === 0 && 'flex-2')} />
          ))}
        </div>
      ))}
    </div>
  )
}

function CardSkeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn(surfaceClass, 'flex flex-col gap-4 p-5', className)}>
      <Skeleton className="h-5 w-40" />
      <SkeletonText lines={lines} />
    </div>
  )
}

/** A list page below its heading: a toolbar, then the table. */
export function ListSkeleton({ columns }: { columns?: number | undefined }) {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-9 w-full max-w-md" />
      <TableSkeleton columns={columns} />
    </div>
  )
}

/** A record's page: its heading, the side cards and the main card. */
export function DetailSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={3} />
        </div>
        <CardSkeleton lines={8} className="lg:col-span-2" />
      </div>
    </>
  )
}

/** A form page: its heading with the buttons, then the card of fields. */
export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-8 w-64 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className={cn(surfaceClass, 'grid gap-6 p-5 sm:grid-cols-2')}>
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </>
  )
}

/** `count` figure cards in a row, as the overview and the advisor open with. */
function StatCardsSkeleton({ count, className }: { count: number; className: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3', className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn(surfaceClass, 'flex flex-col gap-3 p-4')}>
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  )
}

/** The advisor below its heading: four figures, the tabs, then the open tab's table. */
export function AdvisorSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <StatCardsSkeleton count={4} className="lg:grid-cols-4" />
      <div className="flex flex-col gap-4">
        <div className="flex gap-4 border-b border-border-default pb-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-28" />
          ))}
        </div>
        <TableSkeleton columns={6} />
      </div>
    </div>
  )
}

/** The planner below its heading: one card per course, each with its proposed sessions. */
export function PlannerSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <Skeleton className="h-6 w-72 max-w-full" />
          <TableSkeleton rows={2} columns={6} />
        </div>
      ))}
    </div>
  )
}

/** The import's first step: the steps, then the drop area for the files. */
export function ImportSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={i < 2 ? 'flex flex-1 items-center gap-2' : 'flex items-center'}>
            <Skeleton className="h-5 w-24" />
            {i < 2 && <Skeleton className="h-px flex-1" />}
          </div>
        ))}
      </div>
      <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-emphasis">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
    </div>
  )
}

/** An archived record: its heading, then one card of what was kept. */
export function ArchivedRecordSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <CardSkeleton lines={8} className="max-w-3xl" />
    </>
  )
}

/** The overview: five figures, then the two panels. */
export function DashboardSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <StatCardsSkeleton count={5} className="lg:grid-cols-5" />
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <CardSkeleton lines={8} className="lg:col-span-3" />
        <CardSkeleton lines={8} className="lg:col-span-2" />
      </div>
    </>
  )
}
