'use client'

import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { EmptyState } from '@muni/ui/empty-state'
import { SplitLayout } from '@muni/ui/layout'
import { PageHeader } from '@muni/ui/page-header'
import { SectionHeading } from '@muni/ui/section-heading'
import { TextLink } from '@muni/ui/text-link'
import { formatCurrency, formatDate, formatOptional } from '@muni/utils/format'
import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'

import { BackLink } from '@/components/back-link'
import { ReadView } from '@/components/read-view'
import { RecordActions } from '@/components/record-actions'
import { DetailSkeleton } from '@/components/skeletons'
import {
  ProviderCompletionsTable,
  ProviderCoursesTable,
} from '@/features/providers/provider-tables'
import { readQuery } from '@/lib/query/queries'
import { useDocumentTitle } from '@/lib/query/use-document-title'
import type { ReadOutput } from '@/server/reads/registry'

export function ProviderView({ id, canEdit }: { id: string; canEdit: boolean }) {
  const read = useQuery(readQuery('provider', { id }))
  useDocumentTitle(read.data?.name)
  return (
    <ReadView query={read} skeleton={<DetailSkeleton />} entity="providers">
      {data => <ProviderDetail data={data} canEdit={canEdit} />}
    </ReadView>
  )
}

function ProviderDetail({ data, canEdit }: { data: ReadOutput<'provider'>; canEdit: boolean }) {
  const provider = data
  const t = useTranslations('providers')
  const locale = useLocale()
  const { companyId, email, phone, website, note } = provider
  const hasDetails = [companyId, email, phone, website, note].some(v => v !== null)

  return (
    <>
      <PageHeader
        eyebrow={<BackLink fallback={{ href: '/providers', label: t('title') }} />}
        title={provider.name}
        actions={
          canEdit && (
            <RecordActions
              kind="provider"
              id={provider.id}
              name={provider.name}
              editHref={`/providers/${provider.id}/edit`}
              then="/providers"
            />
          )
        }
      />
      <SplitLayout
        side={
          <Card>
            <CardHeader title={t('detail.facts')} />
            <CardBody className="flex flex-col gap-5">
              {hasDetails ? (
                <DescriptionList>
                  {companyId && (
                    <DescriptionItem label={t('detail.companyId')}>{companyId}</DescriptionItem>
                  )}
                  {email && (
                    <DescriptionItem label={t('detail.email')}>
                      <TextLink href={`mailto:${email}`}>{email}</TextLink>
                    </DescriptionItem>
                  )}
                  {phone && (
                    <DescriptionItem label={t('detail.phone')}>
                      <TextLink href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</TextLink>
                    </DescriptionItem>
                  )}
                  {website && (
                    <DescriptionItem label={t('detail.website')}>
                      <TextLink href={website} rel="noreferrer" className="break-all">
                        {website.replace(/^https?:\/\//, '')}
                      </TextLink>
                    </DescriptionItem>
                  )}
                  {note && (
                    <DescriptionItem label={t('detail.note')}>
                      <span className="whitespace-pre-line">{note}</span>
                    </DescriptionItem>
                  )}
                </DescriptionList>
              ) : (
                <p className="text-sm text-fg-subtle">{t('detail.noDetails')}</p>
              )}
              <DescriptionList>
                <DescriptionItem label={t('detail.totals')}>
                  {t('detail.completions', { count: provider.completions })} ·{' '}
                  {t('detail.people', { count: provider.people })} ·{' '}
                  {t('detail.courses', { count: provider.courses })}
                </DescriptionItem>
                {provider.prices && (
                  <DescriptionItem label={t('detail.spend')}>
                    {formatCurrency(provider.spend, locale)}
                  </DescriptionItem>
                )}
                <DescriptionItem label={t('detail.last')}>
                  {formatOptional(provider.lastCompletedOn, v => formatDate(v, locale))}
                </DescriptionItem>
              </DescriptionList>
            </CardBody>
          </Card>
        }
        main={
          <>
            <SectionHeading className="mt-0" description={t('detail.byCourseDescription')}>
              {t('detail.byCourse')}
            </SectionHeading>
            {provider.byCourse.length === 0 ? (
              <EmptyState variant="inline" title={t('detail.noCompletions')} />
            ) : (
              <ProviderCoursesTable rows={provider.byCourse} prices={provider.prices} />
            )}
          </>
        }
      />
      {provider.recentCompletions.length > 0 && (
        <>
          <SectionHeading
            description={t('detail.recentDescription', {
              count: provider.recentCompletions.length,
            })}
          >
            {t('detail.recent')}
          </SectionHeading>
          <ProviderCompletionsTable rows={provider.recentCompletions} prices={provider.prices} />
        </>
      )}
    </>
  )
}
