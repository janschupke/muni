'use client'

import type { EmployeeListRequirement } from '@muni/db/repositories'
import { formatDate, formatDateTime } from '@muni/utils/format'
import { useTranslations } from 'next-intl'

/** One person's training of a course, in words: its state, until when, and its booking. */
export function useRequirementText() {
  const t = useTranslations('compliance.person')
  const ts = useTranslations('status.compliance')
  return (requirement: EmployeeListRequirement, courseName: string) =>
    [
      t('cell', { course: courseName, status: ts(requirement.status) }),
      requirement.validUntil && t('validUntil', { date: formatDate(requirement.validUntil) }),
      requirement.booked && t('booked', { date: formatDateTime(requirement.booked.startsAt) }),
    ]
      .filter(Boolean)
      .join(' · ')
}
