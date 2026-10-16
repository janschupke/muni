'use client'

import { COMPLIANCE_STATUSES, EMPLOYMENT_STATUSES } from '@muni/domain/enums'
import { Button } from '@muni/ui/button'
import { Field, Input } from '@muni/ui/field'
import { Select } from '@muni/ui/select'
import { Toolbar, ToolbarSummary } from '@muni/ui/toolbar'
import { Filter, FilterX, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'

import { withParams } from '@/lib/search-params'

type Query = Record<string, string | undefined>

/**
 * Search and filters for the employee list, kept in the URL. A select applies as soon as it
 * changes; the search applies on submit. Any change returns to the first page.
 */
export function EmployeeFilters({
  query,
  departments,
  positions,
  total,
}: {
  /** Every current URL parameter (filters and sort). */
  query: Query
  departments: string[]
  positions: string[]
  total: number
}) {
  const t = useTranslations('employees')
  const ts = useTranslations('status')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

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
                key={query.q ?? ''}
                type="search"
                name="q"
                defaultValue={query.q}
                placeholder={t('searchPlaceholder')}
                className="pl-8"
              />
            </div>
          )}
        </Field>
        <Field label={t('filters.department')} className="w-full sm:w-52">
          {control => (
            <Select
              {...control}
              value={query.department ?? ''}
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
              value={query.position ?? ''}
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
              value={query.status ?? ''}
              onValueChange={status => {
                apply({ status })
              }}
              emptyLabel={t('filters.any')}
              options={EMPLOYMENT_STATUSES.map(s => ({ value: s, label: ts(`employment.${s}`) }))}
            />
          )}
        </Field>
        <Field label={t('filters.compliance')} className="w-full sm:w-40">
          {control => (
            <Select
              {...control}
              value={query.compliance ?? ''}
              onValueChange={compliance => {
                apply({ compliance })
              }}
              emptyLabel={t('filters.any')}
              options={COMPLIANCE_STATUSES.map(s => ({ value: s, label: ts(`compliance.${s}`) }))}
            />
          )}
        </Field>
        <Button type="submit" variant="primary">
          <Filter aria-hidden />
          {t('filters.apply')}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/employees">
            <FilterX aria-hidden />
            {t('filters.reset')}
          </Link>
        </Button>
        <ToolbarSummary>{t('total', { count: total })}</ToolbarSummary>
      </form>
    </Toolbar>
  )
}
