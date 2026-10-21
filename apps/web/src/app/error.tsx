'use client'

import { Button } from '@muni/ui/button'
import { PageMessage } from '@muni/ui/page-message'
import { House, RotateCw, ServerCrash } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useTransition } from 'react'

import { Link } from '@/components/navigation/link'

/**
 * A page that failed to render, inside the app frame. The error is logged; its digest (the
 * server's id for it) is shown so it can be reported. Retrying refetches the server data
 * before rendering again.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <PageMessage
      icon={<ServerCrash aria-hidden />}
      tone="danger"
      title={t('errorTitle')}
      description={t('errorBody')}
      actions={
        <>
          <Button asChild>
            <Link href="/">
              <House aria-hidden />
              {t('home')}
            </Link>
          </Button>
          <Button
            variant="primary"
            disabled={pending}
            onClick={() => {
              startTransition(() => {
                router.refresh()
                reset()
              })
            }}
          >
            <RotateCw aria-hidden />
            {t('retry')}
          </Button>
        </>
      }
    >
      {error.digest && <code className="text-xs">{t('reference', { digest: error.digest })}</code>}
    </PageMessage>
  )
}
