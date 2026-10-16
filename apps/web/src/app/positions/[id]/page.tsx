import { getPosition } from '@muni/db/repositories'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { SplitLayout } from '@muni/ui/layout'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { cache } from 'react'

import { BackLink } from '@/components/back-link'
import { GroupBreakdown } from '@/features/org/group-breakdown'
import { GroupFacts } from '@/features/org/group-facts'
import { GroupMain } from '@/features/org/group-main'

type Props = { params: Promise<{ id: string }> }

const loadPosition = cache((id: string) => getPosition(id))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return { title: (await loadPosition(id))?.name ?? id }
}

export default async function PositionPage({ params }: Props) {
  const { id } = await params
  const [position, t] = await Promise.all([loadPosition(id), getTranslations('positions')])
  if (!position) notFound()
  return (
    <>
      <PageHeader
        eyebrow={<BackLink fallback={{ href: '/positions', label: t('title') }} />}
        title={position.name}
      />
      <SplitLayout
        side={
          <Card>
            <CardHeader title={t('detail.facts')} />
            <CardBody className="flex flex-col gap-5">
              <GroupFacts group={position} />
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-muted">
                  {t('detail.departments')}
                </p>
                {position.departments.length === 0 ? (
                  <p className="text-sm text-fg-subtle">{t('detail.noDepartments')}</p>
                ) : (
                  <GroupBreakdown kind="departments" groups={position.departments} />
                )}
              </div>
            </CardBody>
          </Card>
        }
        main={<GroupMain kind="positions" group={position} />}
      />
    </>
  )
}
