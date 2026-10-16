import { buttonClass } from '@muni/ui/button'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function NotFound() {
  const t = await getTranslations('errors')
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold">{t('notFoundTitle')}</h1>
      <p className="mt-2 text-fg-muted">{t('notFoundBody')}</p>
      <Link href="/" className={`${buttonClass({ variant: 'primary' })} mt-6`}>
        {t('home')}
      </Link>
    </div>
  )
}
