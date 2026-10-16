'use client'

import { Button } from '@muni/ui/button'
import { PageMessage } from '@muni/ui/page-message'
import { TextLink } from '@muni/ui/text-link'
import { ArrowLeft, House, SearchX } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

const ENTITIES = ['employees', 'courses', 'sessions', 'rooms', 'departments', 'positions'] as const
type Entity = (typeof ENTITIES)[number]

/** "Page not found" naming the address, or, under a record's route, which record is missing. */
export function NotFoundMessage({ entity }: { entity?: Entity }) {
  const t = useTranslations('errors')
  const tn = useTranslations('nav')
  const pathname = usePathname()
  if (entity) {
    // The record's key is the segment after the list: /employees/E9999(/edit).
    const id = decodeURIComponent(pathname.split('/')[2] ?? '')
    return (
      <PageMessage
        icon={<SearchX aria-hidden />}
        title={t(`entity.${entity}.title`)}
        description={t(`entity.${entity}.body`, { id })}
        actions={
          <Button asChild variant="primary">
            <Link href={`/${entity}`}>
              <ArrowLeft aria-hidden />
              {t(`entity.${entity}.back`)}
            </Link>
          </Button>
        }
      />
    )
  }
  return (
    <PageMessage
      icon={<SearchX aria-hidden />}
      title={t('notFoundTitle')}
      description={t('notFoundBody', { path: pathname })}
      actions={
        <Button asChild variant="primary">
          <Link href="/">
            <House aria-hidden />
            {t('home')}
          </Link>
        </Button>
      }
    >
      <p className="mb-2">{t('goTo')}</p>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {ENTITIES.map(e => (
          <li key={e}>
            <TextLink asChild>
              <Link href={`/${e}`}>{tn(e)}</Link>
            </TextLink>
          </li>
        ))}
      </ul>
    </PageMessage>
  )
}
