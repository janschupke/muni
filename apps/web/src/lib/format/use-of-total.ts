'use client'

import { formatInteger } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback } from 'react'

/** "3 of 12", the one way a part and its whole are written, with the locale's digits. */
export function useOfTotal() {
  const t = useTranslations('common')
  const locale = useLocale()
  return useCallback(
    (part: number, total: number) =>
      t('ofTotal', { part: formatInteger(part, locale), total: formatInteger(total, locale) }),
    [t, locale]
  )
}
