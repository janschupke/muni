'use client'

import { useTranslations } from 'next-intl'

/** What a paged table's controls are called, in every table that pages on the client. */
export function usePaginationLabels() {
  const t = useTranslations('common')
  return {
    nav: t('pagination'),
    previous: t('previous'),
    next: t('next'),
    status: (page: number, pageCount: number) => t('page', { page, pageCount }),
  }
}
