'use client'

import { Button } from '@muni/ui/button'
import { useTranslations } from 'next-intl'

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors')
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold">{t('errorTitle')}</h1>
      <p className="mt-2 text-fg-muted">{t('errorBody')}</p>
      <Button variant="primary" className="mt-6" onClick={reset}>
        {t('retry')}
      </Button>
    </div>
  )
}
