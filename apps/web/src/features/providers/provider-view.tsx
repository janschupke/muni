'use client'

import { Card, CardBody, CardHeader } from '@muni/ui/card'
import type { TablePaging } from '@muni/ui/data-table'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { EmptyState } from '@muni/ui/empty-state'
import { SplitLayout } from '@muni/ui/layout'
import { SectionHeading } from '@muni/ui/section-heading'
import { TextLink } from '@muni/ui/text-link'
import { formatCurrency, formatDate, formatOptional } from '@muni/utils/format'
import { useTranslations } from 'next-intl'

import { EmailLink } from '@/components/email-link'
import { ReadView } from '@/components/read-view'
import { RecordHeader, useRecordRead } from '@/components/record-view'
import { SessionTable } from '@/components/session-table'
import { DetailSkeleton } from '@/components/skeletons'
import {
  ProviderCompletionsTable,
  ProviderCoursesTable,
  ProviderOfferingsTable,
} from '@/features/providers/provider-tables'
import { COMPLETION_SORT, PROVIDER_COURSE_SORT, SESSION_SORT } from '@/lib/list-keys'
import { type PageInfo, useListUrl } from '@/lib/use-list-url'
import type { ReadOutput } from '@/server/reads/registry'

/**
 * A provider's page: its details and totals, what it offers, and a page each of its sessions
 * ahead, its courses and its completions.
 */
export function ProviderView({ id, canEdit }: { id: string; canEdit: boolean }) {
  const sessions = useListUrl(SESSION_SORT, { id: 'date', desc: false }, 'sessions')
  const courses = useListUrl(PROVIDER_COURSE_SORT, undefined, 'courses')
  const completions = useListUrl(COMPLETION_SORT, { id: 'completedOn', desc: true }, 'completions')
  const read = useRecordRead(
    'provider',
    { id, ...sessions.input, ...courses.input, ...completions.input },
    provider => provider.name
  )
  return (
    <ReadView query={read} skeleton={<DetailSkeleton />} entity="providers">
      {data => (
        <ProviderDetail
          data={data}
          canEdit={canEdit}
          paging={{
            sessions: sessions.paging,
            courses: courses.paging,
            completions: completions.paging,
          }}
        />
      )}
    </ReadView>
  )
}

function ProviderDetail({
  data,
  canEdit,
  paging,
}: {
  data: ReadOutput<'provider'>
  canEdit: boolean
  paging: Record<'sessions' | 'courses' | 'completions', (page: PageInfo) => TablePaging>
}) {
  const provider = data
  const t = useTranslations('providers')
  const { companyId, email, phone, website, note } = provider
  const hasDetails = [companyId, email, phone, website, note].some(v => v !== null)

  return (
    <>
      <RecordHeader
        list={{ href: '/providers', label: t('title') }}
        title={provider.name}
        description={provider.isDefault ? t('detail.isDefault') : undefined}
        record={
          canEdit && {
            kind: 'provider',
            id: provider.id,
            name: provider.name,
            editHref: `/providers/${provider.id}/edit`,
          }
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
                      <EmailLink email={email} />
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
                <EmptyState variant="inline" title={t('detail.noDetails')} />
              )}
              <DescriptionList>
                <DescriptionItem label={t('detail.totals')}>
                  {t('detail.completions', { count: provider.completions })} ·{' '}
                  {t('detail.people', { count: provider.people })} ·{' '}
                  {t('detail.courses', { count: provider.courses })}
                </DescriptionItem>
                {provider.prices && (
                  <DescriptionItem label={t('detail.spend')}>
                    {formatCurrency(provider.spend)}
                  </DescriptionItem>
                )}
                <DescriptionItem label={t('detail.last')}>
                  {formatOptional(provider.lastCompletedOn, v => formatDate(v))}
                </DescriptionItem>
              </DescriptionList>
            </CardBody>
          </Card>
        }
        main={
          <>
            <SectionHeading className="mt-0" description={t('detail.offeringsDescription')}>
              {t('detail.offerings.title')}
            </SectionHeading>
            {provider.offerings.length === 0 ? (
              <EmptyState title={t('detail.noOfferings')} />
            ) : (
              <ProviderOfferingsTable
                providerId={provider.id}
                providerName={provider.name}
                rows={provider.offerings}
                canEdit={canEdit}
              />
            )}
            <SectionHeading description={t('detail.byCourseDescription')}>
              {t('detail.byCourse')}
            </SectionHeading>
            {provider.byCourse.total === 0 ? (
              <EmptyState title={t('detail.noCompletions')} />
            ) : (
              <ProviderCoursesTable
                rows={provider.byCourse.items}
                paging={paging.courses(provider.byCourse)}
                prices={provider.prices}
              />
            )}
          </>
        }
      />
      {/* Full width, as on a course's and a room's page: the session table needs it. */}
      <SectionHeading description={t('detail.upcomingDescription')}>
        {t('detail.upcoming')}
      </SectionHeading>
      {provider.upcoming.total === 0 ? (
        <EmptyState title={t('detail.noUpcoming')} />
      ) : (
        <SessionTable
          sessions={provider.upcoming.items}
          paging={paging.sessions(provider.upcoming)}
          canEdit={canEdit}
          showProvider={false}
          caption={t('detail.upcoming')}
          panelLevel={3}
        />
      )}
      <SectionHeading
        description={
          provider.completionList.total > 0 &&
          t('detail.recentDescription', { count: provider.completionList.total })
        }
      >
        {t('detail.recent')}
      </SectionHeading>
      {provider.completionList.total === 0 ? (
        <EmptyState title={t('detail.noRecent')} />
      ) : (
        <ProviderCompletionsTable
          rows={provider.completionList.items}
          paging={paging.completions(provider.completionList)}
          prices={provider.prices}
          canEdit={canEdit}
        />
      )}
    </>
  )
}
