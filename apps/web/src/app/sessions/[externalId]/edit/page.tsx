import { getSession, listRoomOptions } from '@muni/db/repositories'
import { EmptyState } from '@muni/ui/empty-state'
import { ItemList, ItemListRow } from '@muni/ui/item-list'
import { PageHeader } from '@muni/ui/page-header'
import { SectionHeading } from '@muni/ui/section-heading'
import { TextLink } from '@muni/ui/text-link'
import { toZonedParts } from '@muni/utils/dates'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { BackLink } from '@/components/back-link'
import { SessionForm } from '@/components/form/entity-forms'
import { RemoveBookingButton } from '@/components/remove-booking-button'
import { saveSession } from '@/server/actions/edit'
import { requireAdminPage } from '@/server/auth'

export default async function EditSessionPage({
  params,
}: {
  params: Promise<{ externalId: string }>
}) {
  await requireAdminPage()
  const { externalId } = await params
  const [session, rooms, t] = await Promise.all([
    getSession(externalId),
    listRoomOptions(),
    getTranslations('sessions'),
  ])
  if (!session) notFound()
  const start = toZonedParts(session.startsAt)
  const end = toZonedParts(session.endsAt)
  return (
    <>
      <PageHeader
        title={t('editTitle', { id: externalId })}
        eyebrow={
          <BackLink
            fallback={{ href: `/courses/${session.courseCode}`, label: session.courseName }}
          />
        }
        description={`${session.courseCode} · ${session.courseName}`}
      />
      <SessionForm
        action={saveSession.bind(null, externalId)}
        cancelHref={`/courses/${session.courseCode}`}
        rooms={rooms}
        defaults={{
          date: start.date,
          startTime: start.time,
          endTime: end.time,
          roomId: session.room.id,
          capacity: session.capacity,
          unnamedBookings: session.unnamedBookings,
          assignedCount: session.assigned.length,
          pricePerPerson: session.pricePerPerson,
          status: session.status,
        }}
      />
      <SectionHeading>{t('attendees.named', { count: session.assigned.length })}</SectionHeading>
      {session.assigned.length === 0 ? (
        <EmptyState variant="inline" title={t('attendees.noneNamed')} />
      ) : (
        <ItemList className="max-w-2xl">
          {session.assigned.map(a => (
            <ItemListRow key={a.externalId}>
              <TextLink asChild>
                <Link href={`/employees/${a.externalId}`}>{a.name}</Link>
              </TextLink>
              <RemoveBookingButton
                sessionExternalId={externalId}
                employeeExternalId={a.externalId}
                label={t('attendees.remove', { name: a.name })}
              />
            </ItemListRow>
          ))}
        </ItemList>
      )}
    </>
  )
}
