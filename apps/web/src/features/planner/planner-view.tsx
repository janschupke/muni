'use client'

import type { RoomOption } from '@muni/db/repositories'
import { type OfferCourse, type PlannerGroup, type SessionOffer } from '@muni/domain/planner'
import { Alert } from '@muni/ui/alert'
import { type TablePaging } from '@muni/ui/data-table'
import { SectionHeading } from '@muni/ui/section-heading'
import { TextLink } from '@muni/ui/text-link'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { OfferTable } from './offer-table'

// Loaded when needed: the review opens when an offer is chosen.
const OfferReview = dynamic(() => import('./offer-review').then(m => m.OfferReview))

export function PlannerView({
  groups,
  paging,
  rooms,
  canCreate,
}: {
  groups: PlannerGroup[]
  /** Every course's table: sorted on the server, the courses paged below them. */
  paging: TablePaging
  rooms: readonly RoomOption[]
  canCreate: boolean
}) {
  const t = useTranslations('planner')
  const [reviewing, setReviewing] = useState<{ offer: SessionOffer; from: HTMLElement } | null>(
    null
  )
  return (
    <div className="flex flex-col gap-8">
      {!canCreate && (
        <Alert tone="info" variant="inline">
          {t('readOnly')}
        </Alert>
      )}
      {groups.map(group => (
        <section key={group.course.code} aria-labelledby={`course-${group.course.code}`}>
          <CourseHeading course={group.course} id={`course-${group.course.code}`} />
          <OfferTable
            group={group}
            paging={paging}
            canCreate={canCreate}
            onReview={(offer, from) => {
              setReviewing({ offer, from })
            }}
          />
        </section>
      ))}
      {reviewing && (
        <OfferReview
          key={reviewing.offer.id}
          open
          offer={reviewing.offer}
          rooms={rooms}
          onOpenChange={open => {
            if (!open) setReviewing(null)
          }}
          returnFocusTo={() => (reviewing.from.isConnected ? reviewing.from : null)}
        />
      )}
    </div>
  )
}

function CourseHeading({ course, id }: { course: OfferCourse; id: string }) {
  const t = useTranslations('planner')
  const tc = useTranslations('status.capability')
  const length = course.sessionMinutes
  const facts = [
    length === null
      ? t('noLength')
      : course.seats === null
        ? t('needsAny', { length })
        : t('needs', { length, size: course.seats }),
    ...(course.onlineAllowed ? [t('online')] : []),
    ...(course.capabilities.length > 0
      ? [t('capabilities', { list: course.capabilities.map(c => tc(c)).join(', ') })]
      : []),
  ]
  return (
    <SectionHeading id={id} className="mt-0" description={facts.join(' · ')}>
      <TextLink asChild>
        <Link href={`/courses/${course.code}`}>{course.name}</Link>
      </TextLink>
    </SectionHeading>
  )
}
