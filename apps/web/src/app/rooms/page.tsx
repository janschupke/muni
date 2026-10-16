import { listRooms } from '@muni/db/repositories'
import { Button } from '@muni/ui/button'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { RoomsTable } from '@/features/rooms/rooms-table'
import { getViewer } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('rooms'))('title') }
}

export default async function RoomsPage() {
  const [rooms, viewer, t] = await Promise.all([listRooms(), getViewer(), getTranslations('rooms')])
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          viewer === 'authenticated' && (
            <Button asChild variant="primary">
              <Link href="/rooms/new">
                <Plus aria-hidden />
                {t('new')}
              </Link>
            </Button>
          )
        }
      />
      {rooms.length === 0 ? <EmptyState title={t('empty')} /> : <RoomsTable rooms={rooms} />}
    </>
  )
}
