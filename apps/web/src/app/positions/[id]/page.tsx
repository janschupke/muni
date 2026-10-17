import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PositionView } from '@/features/org/group-views'
import { requireReader } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

interface Props {
  params: Promise<{ id: string }>
}

/** The record's name, from the read the page shows (the list's title while it is not there). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return titleOf(
    { name: 'position', input: { id } },
    data => data.name,
    (await getTranslations('positions'))('title')
  )
}

export default async function PositionPage({ params }: Props) {
  const user = await requireReader()
  const { id } = await params
  return prefetched(
    user,
    [{ name: 'position', input: { id } }],
    <PositionView id={id} canEdit={canWrite(user.role)} />
  )
}
