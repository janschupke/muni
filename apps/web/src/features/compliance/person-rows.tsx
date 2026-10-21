'use client'

import type {
  ComplianceMatrix,
  ComplianceMatrixRow,
  EmployeeListRequirement,
} from '@muni/db/repositories'
import { COMPLIANCE_STATUSES } from '@muni/domain/enums'
import { cn } from '@muni/ui/cn'
import { Td, Th, Tr } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { Tooltip } from '@muni/ui/tooltip'
import { CalendarCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ComponentProps } from 'react'

import { COMPLIANCE } from '@/components/badges/status-badges'
import { Link } from '@/components/navigation/link'

import { STATUS_CELL, STICKY } from './matrix-styles'
import { useRequirementText } from './use-requirement-text'
import { useRovingGrid } from './use-roving-grid'

/**
 * An opened department's people, one row each, aligned under the course columns. Their cells
 * are one stop for Tab: the arrow keys move between them, each shows its words as it gets
 * the focus, and Enter (or a click) opens the department × course dialog.
 */
export function DepartmentPeople({
  row,
  courses,
  rowId,
  onOpen,
}: {
  row: ComplianceMatrixRow
  courses: ComplianceMatrix['courses']
  rowId: (externalId: string) => string
  onOpen: (code: string, cell: HTMLElement) => void
}) {
  const cell = useRovingGrid(row.people.length, courses.length)
  return row.people.map((person, personIndex) => (
    <Tr
      key={person.externalId}
      id={rowId(person.externalId)}
      className="motion-safe:animate-fade-in"
    >
      <Th scope="row" nowrap className={cn('border-b-0 py-0.5 pr-2 pl-9 font-normal', STICKY)}>
        <span className="flex flex-col leading-tight">
          <TextLink asChild>
            <Link href={`/employees/${person.externalId}`}>{person.name}</Link>
          </TextLink>
          {person.position && <span className="text-xs text-fg-subtle">{person.position}</span>}
        </span>
      </Th>
      <Td className="p-0" />
      {courses.map((course, courseIndex) => {
        // A course nobody here must hold has no dialog: the cell is still a stop for the
        // arrows, saying so, but opens nothing.
        const opens = row.cells[course.code] != null
        return (
          <Td key={course.code} className="p-0">
            <PersonCell
              {...cell(personIndex, courseIndex)}
              requirement={person.cells[course.code] ?? null}
              courseName={course.name}
              aria-haspopup={opens ? 'dialog' : undefined}
              aria-disabled={opens ? undefined : true}
              onClick={
                opens
                  ? event => {
                      onOpen(course.code, event.currentTarget)
                    }
                  : undefined
              }
            />
          </Td>
        )
      })}
    </Tr>
  ))
}

/** One person × course: the status as tint and icon, with the words for screen readers. */
function PersonCell({
  requirement,
  courseName,
  ...props
}: {
  requirement: EmployeeListRequirement | null
  courseName: string
} & Omit<ComponentProps<'button'>, 'children' | 'className' | 'type'>) {
  const t = useTranslations('compliance')
  const describe = useRequirementText()
  if (requirement === null) {
    return (
      <button
        type="button"
        className="flex h-8 w-full cursor-pointer items-center justify-center rounded-sm text-fg-subtle"
        {...props}
      >
        <span aria-hidden>·</span>
        <span className="sr-only">{`${courseName}: ${t('notApplicable')}`}</span>
      </button>
    )
  }
  const { Icon } = COMPLIANCE[requirement.status]
  const text = describe(requirement, courseName)
  return (
    <Tooltip content={text} repeatsName>
      <button
        type="button"
        className={cn(
          'flex h-8 w-full cursor-pointer items-center justify-center gap-1 rounded-sm transition-shadow hover:shadow-[inset_0_0_0_2px_var(--p-fg)]',
          STATUS_CELL[requirement.status]
        )}
        {...props}
      >
        <Icon aria-hidden className="size-4" />
        {requirement.booked && <CalendarCheck aria-hidden className="size-3.5" />}
        <span className="sr-only">{text}</span>
      </button>
    </Tooltip>
  )
}

/** Explains the people rows: one icon per state, and the booked mark. */
export function PersonLegend() {
  const t = useTranslations('compliance.person')
  const ts = useTranslations('status.compliance')
  return (
    <ul
      aria-label={t('legend')}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted"
    >
      <li aria-hidden>{t('legend')}</li>
      {COMPLIANCE_STATUSES.map(status => {
        const { Icon } = COMPLIANCE[status]
        return (
          <li key={status} className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                'inline-flex h-5 w-6 items-center justify-center rounded-sm',
                STATUS_CELL[status]
              )}
            >
              <Icon aria-hidden className="size-3.5" />
            </span>
            {ts(status)}
          </li>
        )
      })}
      <li className="inline-flex items-center gap-1.5">
        <CalendarCheck aria-hidden className="size-3.5" />
        {t('bookedLegend')}
      </li>
    </ul>
  )
}
