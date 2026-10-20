'use client'

import { COMPLIANCE_STATUSES, EMPLOYMENT_STATES } from '@muni/domain/enums'
import { Button } from '@muni/ui/button'
import { cn } from '@muni/ui/cn'
import { Field, Input } from '@muni/ui/field'
import { IconButton } from '@muni/ui/icon-button'
import { Select } from '@muni/ui/select'
import { Toolbar, ToolbarChip, ToolbarSummary } from '@muni/ui/toolbar'
import { ChevronDown, FilterX, Search, SlidersHorizontal, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useId, useState, useTransition } from 'react'

import { withParams } from '@/lib/list/search-params'

type Query = Record<string, string | undefined>

const FILTERS = ['department', 'position', 'status', 'compliance'] as const

/**
 * Search and filters for the employee list, kept in the URL. A select applies as soon as it
 * changes; the search applies on submit. Any change returns to the first page.
 */
export function EmployeeFilters({
  query,
  departments,
  positions,
  total,
  manager,
}: {
  /** Every current URL parameter (filters and sort). */
  query: Query
  departments: string[]
  positions: string[]
  total: number
  /** "Reports to …", when the list came from a person's team link: a chip that removes it. */
  manager?: { label: string } | undefined
}) {
  const t = useTranslations('employees')
  const ts = useTranslations('status')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const filtersId = useId()
  const applied = FILTERS.filter(key => query[key]).length

  const apply = (changes: Query) => {
    startTransition(() => {
      router.replace(withParams('/employees', query, { ...changes, page: undefined }), {
        scroll: false,
      })
    })
  }

  return (
    <Toolbar asChild>
      <form
        role="search"
        aria-busy={pending}
        onSubmit={event => {
          event.preventDefault()
          const q = new FormData(event.currentTarget).get('q')
          apply({ q: typeof q === 'string' ? q.trim() : undefined })
        }}
      >
        <Field label={t('search')} className="w-full sm:w-56">
          {control => (
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-subtle"
              />
              <Input
                {...control}
                // Remount when the URL's query changes (reset, back) so the field follows it.
                key={query['q'] ?? ''}
                type="search"
                name="q"
                defaultValue={query['q']}
                placeholder={t('searchPlaceholder')}
                className="pl-8"
              />
            </div>
          )}
        </Field>
        <Button
          type="button"
          variant="secondary"
          className="sm:hidden"
          aria-expanded={open}
          aria-controls={filtersId}
          onClick={() => {
            setOpen(o => !o)
          }}
        >
          <SlidersHorizontal aria-hidden />
          {t('filters.toggle', { count: applied })}
          <ChevronDown
            aria-hidden
            className={cn('motion-safe:transition-transform', open && 'rotate-180')}
          />
        </Button>
        {/* On a phone the four selects fold away behind the button; from `sm` up they sit in the row. */}
        <div
          id={filtersId}
          className={cn('w-full flex-col gap-3 sm:contents', open ? 'flex' : 'hidden')}
        >
          <Field label={t('filters.department')} className="w-full sm:w-52">
            {control => (
              <Select
                {...control}
                value={query['department'] ?? ''}
                onValueChange={department => {
                  apply({ department })
                }}
                emptyLabel={t('filters.any')}
                options={departments.map(d => ({ value: d, label: d }))}
              />
            )}
          </Field>
          <Field label={t('filters.position')} className="w-full sm:w-48">
            {control => (
              <Select
                {...control}
                value={query['position'] ?? ''}
                onValueChange={position => {
                  apply({ position })
                }}
                emptyLabel={t('filters.any')}
                options={positions.map(p => ({ value: p, label: p }))}
              />
            )}
          </Field>
          <Field label={t('filters.status')} className="w-full sm:w-40">
            {control => (
              <Select
                {...control}
                value={query['status'] ?? ''}
                onValueChange={status => {
                  apply({ status })
                }}
                emptyLabel={t('filters.any')}
                options={EMPLOYMENT_STATES.map(s => ({ value: s, label: ts(`employment.${s}`) }))}
              />
            )}
          </Field>
          <Field label={t('filters.compliance')} className="w-full sm:w-40">
            {control => (
              <Select
                {...control}
                value={query['compliance'] ?? ''}
                onValueChange={compliance => {
                  apply({ compliance })
                }}
                emptyLabel={t('filters.any')}
                options={COMPLIANCE_STATUSES.map(s => ({ value: s, label: ts(`compliance.${s}`) }))}
              />
            )}
          </Field>
        </div>
        {manager && (
          <ToolbarChip
            remove={
              <IconButton asChild label={t('filters.clearManager')}>
                <Link
                  href={withParams('/employees', query, { manager: undefined, page: undefined })}
                >
                  <X aria-hidden />
                </Link>
              </IconButton>
            }
          >
            {manager.label}
          </ToolbarChip>
        )}
        {/* The selects apply as they change; this sends the search box. */}
        <Button asChild>
          <Link href="/employees">
            <FilterX aria-hidden />
            {t('filters.reset')}
          </Link>
        </Button>
        <Button type="submit" variant="primary">
          <Search aria-hidden />
          {t('filters.apply')}
        </Button>
        <ToolbarSummary>{t('total', { count: total })}</ToolbarSummary>
      </form>
    </Toolbar>
  )
}
