import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { TextLink } from '@muni/ui/text-link'
import { formatInteger } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { ComplianceSummary } from '@/features/compliance/compliance-breakdown'

/** The numbers every department and position page opens with. */
export function GroupFacts({
  group,
  bookingsHref,
  children,
}: {
  group: {
    name: string
    active: number
    parentalLeave: number
    upcomingBookings: number
    counts: { VALID: number; EXPIRING: number; EXPIRED: number; MISSING: number; total: number }
  }
  /** Where its upcoming bookings are listed. */
  bookingsHref: string
  children?: ReactNode | undefined
}) {
  const t = useTranslations('org.columns')
  const td = useTranslations('org.detail')
  const locale = useLocale()
  return (
    <div className="flex flex-col gap-4">
      <DescriptionList>
        {children}
        <DescriptionItem label={td('active')}>
          {formatInteger(group.active, locale)}
        </DescriptionItem>
        <DescriptionItem label={td('onLeave')}>
          {formatInteger(group.parentalLeave, locale)}
        </DescriptionItem>
        <DescriptionItem label={td('bookings')}>
          {group.upcomingBookings === 0 ? (
            formatInteger(0, locale)
          ) : (
            <TextLink asChild arrow>
              <Link href={bookingsHref}>{formatInteger(group.upcomingBookings, locale)}</Link>
            </TextLink>
          )}
        </DescriptionItem>
      </DescriptionList>
      {group.counts.total > 0 && (
        <ComplianceSummary counts={group.counts} label={t('compliance')} name={group.name} />
      )}
    </div>
  )
}
