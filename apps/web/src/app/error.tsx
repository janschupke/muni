'use client'

import { Button } from '@muni/ui/button'
import { PageMessage } from '@muni/ui/page-message'
import { useTranslations } from 'next-intl'

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors')
  return (
    <PageMessage
      title={t('errorTitle')}
      description={t('errorBody')}
      actions={
        <Button variant="primary" onClick={reset}>
          {t('retry')}
        </Button>
      }
    />
  )
}
