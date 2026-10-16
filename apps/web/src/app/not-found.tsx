import { Button } from '@muni/ui/button'
import { PageMessage } from '@muni/ui/page-message'
import { House } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function NotFound() {
  const t = await getTranslations('errors')
  return (
    <PageMessage
      title={t('notFoundTitle')}
      description={t('notFoundBody')}
      actions={
        <Button asChild variant="primary">
          <Link href="/">
            <House aria-hidden />
            {t('home')}
          </Link>
        </Button>
      }
    />
  )
}
