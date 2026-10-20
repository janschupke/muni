'use client'

import type { ComplianceMatrix, ComplianceMatrixRow } from '@muni/db/repositories'
import { countBookable } from '@muni/domain/advisor'
import { compareUrgency, complianceOf } from '@muni/domain/compliance'
import { Dialog } from '@muni/ui/dialog'
import { TextLink } from '@muni/ui/text-link'
import { BookOpen, Users } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { BookNeedButton } from '@/features/bookings/book-button'
import { formatRate } from '@/lib/format/format-rate'

import { ComplianceBar, ComplianceLegend } from './compliance-breakdown'
import { RequirementRows } from './requirement-panel'

const employeesHref = (department: string) =>
  `/employees?department=${encodeURIComponent(department)}`

/**
 * A department × course cell, opened: how many hold it, and its people most urgent first,
 * where an admin books who needs it (one at a time, or all at once).
 */
export function CellDialog({
  matrix,
  selected,
  onClose,
  returnFocusTo,
  canBook,
}: {
  matrix: ComplianceMatrix
  selected: { department: string; code: string } | null
  onClose: () => void
  returnFocusTo: () => HTMLElement | null
  canBook: boolean
}) {
  const t = useTranslations('compliance.detail')
  const tc = useTranslations('common')
  const tb = useTranslations('bookings')
  const locale = useLocale()
  const row = selected ? matrix.rows.find(r => r.department === selected.department) : undefined
  const course = selected ? matrix.courses.find(c => c.code === selected.code) : undefined
  const cell = row && course ? row.cells[course.code] : null
  return (
    <Dialog
      open={Boolean(row && course && cell)}
      onOpenChange={open => {
        if (!open) onClose()
      }}
      title={row && course ? t('title', { department: row.department, course: course.name }) : ''}
      description={
        cell
          ? t('summary', {
              held: complianceOf(cell.counts).held,
              total: cell.counts.total,
              rate: formatRate(cell.rate, locale),
            })
          : undefined
      }
      closeLabel={tc('close')}
      returnFocusTo={returnFocusTo}
      // Wide enough for the people's table with its dates and the booking column.
      className="max-w-4xl"
      footer={
        canBook &&
        row &&
        course &&
        toBook(row, course.code) > 1 && (
          <BookNeedButton
            query={{ department: row.departmentId, course: course.code }}
            label={tb('bookAllIn', { department: row.department, course: course.name })}
          >
            {tb('bookAll', { count: toBook(row, course.code) })}
          </BookNeedButton>
        )
      }
    >
      {row && course && cell && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <ComplianceBar
              counts={cell.counts}
              label={t('title', { department: row.department, course: course.name })}
            />
            <ComplianceLegend />
          </div>
          <CellPeople row={row} course={course} canBook={canBook} />
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <TextLink asChild>
              <Link href={`/courses/${course.code}`} className="inline-flex items-center gap-1.5">
                <BookOpen aria-hidden className="size-4" />
                {t('course')}
              </Link>
            </TextLink>
            <TextLink asChild arrow className="gap-1.5">
              <Link href={employeesHref(row.department)}>
                <Users aria-hidden className="size-4" />
                {t('employees', { department: row.department })}
              </Link>
            </TextLink>
          </div>
        </div>
      )}
    </Dialog>
  )
}

/** The people of a department whose training of a course can be booked now. */
const toBook = (row: ComplianceMatrixRow, code: string) =>
  countBookable(
    row.people.flatMap(p => p.cells[code] ?? []),
    'ACTIVE'
  )

/** The people a department cell counts, most urgent first; an admin books who needs it. */
function CellPeople({
  row,
  course,
  canBook,
}: {
  row: ComplianceMatrixRow
  course: { code: string; name: string }
  canBook: boolean
}) {
  const t = useTranslations('compliance.detail')
  const people = row.people
    .flatMap(person => {
      const requirement = person.cells[course.code]
      return requirement ? [{ person, requirement }] : []
    })
    .sort(
      (a, b) =>
        compareUrgency(a.requirement.status, b.requirement.status) ||
        (a.requirement.daysLeft ?? Infinity) - (b.requirement.daysLeft ?? Infinity)
    )
  return (
    <RequirementRows
      caption={t('table')}
      lead={t('name')}
      paging="the people one department cell counts"
      canBook={canBook}
      rows={people.map(({ person, requirement }) => ({
        key: person.externalId,
        lead: (
          <TextLink asChild hitArea className="whitespace-nowrap">
            <Link href={`/employees/${person.externalId}`}>{person.name}</Link>
          </TextLink>
        ),
        requirement,
        // The matrix counts the people at work only.
        person: { externalId: person.externalId, name: person.name, status: 'ACTIVE' },
        course: course.name,
      }))}
    />
  )
}
