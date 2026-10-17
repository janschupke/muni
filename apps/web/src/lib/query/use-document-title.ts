'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

/** Names the browser tab after a record once its data is there (`Name · Training register`). */
export function useDocumentTitle(title: string | undefined): void {
  const t = useTranslations('meta')
  const suffix = t('title')
  useEffect(() => {
    if (title) document.title = `${title} · ${suffix}`
  }, [title, suffix])
}
