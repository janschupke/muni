import { buttonClass } from '@muni/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export async function Pagination({
  page,
  pageCount,
  hrefFor,
}: {
  page: number
  pageCount: number
  hrefFor: (page: number) => string
}) {
  if (pageCount <= 1) return null
  const t = await getTranslations('common')
  const disabled = 'pointer-events-none opacity-40'
  return (
    <nav
      className="mt-4 flex items-center justify-between gap-2 text-sm text-fg-muted"
      aria-label={t('page', { page, pageCount })}
    >
      <Link
        href={hrefFor(page - 1)}
        aria-disabled={page <= 1}
        className={`${buttonClass({ size: 'sm' })} ${page <= 1 ? disabled : ''}`}
      >
        <ChevronLeft aria-hidden />
        {t('previous')}
      </Link>
      <span>{t('page', { page, pageCount })}</span>
      <Link
        href={hrefFor(page + 1)}
        aria-disabled={page >= pageCount}
        className={`${buttonClass({ size: 'sm' })} ${page >= pageCount ? disabled : ''}`}
      >
        {t('next')}
        <ChevronRight aria-hidden />
      </Link>
    </nav>
  )
}
