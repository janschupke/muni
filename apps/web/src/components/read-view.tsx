'use client'

import { Button } from '@muni/ui/button'
import { PageMessage } from '@muni/ui/page-message'
import type { UseQueryResult } from '@tanstack/react-query'
import { CloudOff, RotateCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { ReadError } from '@/lib/query/fetch-read'

import { type Entity, NotFoundMessage } from './not-found-message'
import { LoadingRegion } from './skeletons'

/**
 * A page's data as it arrives: the skeleton until the first answer, then the page. Once there
 * is data it stays on screen, also while it refetches or when a refetch fails. A record that
 * is not there shows the not-found message; a failed load says so with a way to try again.
 */
export function ReadView<T>({
  query,
  skeleton,
  entity,
  children,
}: {
  query: UseQueryResult<T>
  skeleton: ReactNode
  /** Whose not-found message a missing record shows. */
  entity?: Entity | undefined
  children: (data: T) => ReactNode
}) {
  const t = useTranslations('errors')
  if (query.data !== undefined) return children(query.data)
  if (query.isError) {
    if (query.error instanceof ReadError && query.error.status === 404)
      return <NotFoundMessage entity={entity} />
    return (
      <PageMessage
        icon={<CloudOff aria-hidden />}
        title={t('loadFailedTitle')}
        description={
          query.error instanceof ReadError && query.error.status === 429
            ? t('rateLimitedBody')
            : t('loadFailedBody')
        }
        actions={
          <Button
            variant="primary"
            onClick={() => {
              void query.refetch()
            }}
          >
            <RotateCw aria-hidden />
            {t('retry')}
          </Button>
        }
      />
    )
  }
  return <LoadingRegion>{skeleton}</LoadingRegion>
}
