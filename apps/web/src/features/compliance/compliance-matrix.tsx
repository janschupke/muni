'use client'

import type {
  ComplianceMatrix,
  ComplianceMatrixRow,
  EmployeeListRequirement,
} from '@muni/db/repositories'
import { COMPLIANCE_BANDS, complianceBand } from '@muni/domain/compliance'
import { COMPLIANCE_STATUSES, type ComplianceStatus } from '@muni/domain/enums'
import { HeatCell, HeatLegend } from '@muni/ui/charts/heat-cell'
import { cn } from '@muni/ui/cn'
import { Dialog } from '@muni/ui/dialog'
import { ExpandButton } from '@muni/ui/expand-button'
import { Table, TableContainer, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { Tooltip } from '@muni/ui/tooltip'
import {
  formatDate,
  formatDateTime,
  formatInteger,
  formatPercent,
  formatRelativeDays,
  PLACEHOLDER,
} from '@muni/utils/format'
import { BookOpen, CalendarCheck, Users } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Fragment, useId, useRef, useState } from 'react'

import { ComplianceBar, ComplianceLegend } from '@/components/compliance-breakdown'
import { COMPLIANCE, ComplianceBadge } from '@/components/status-badges'

const HEAD = 'border-b-0 px-2 py-1'
// The department column stays put while the courses scroll sideways on narrow screens.
// layer-row paints the row's hover over the column's own fill.
const STICKY = 'sticky left-0 z-10 bg-surface-elevated layer-row'

// A person's cell: the status's own tint, icon and (for screen readers) words.
const STATUS_CELL: Record<ComplianceStatus, string> = {
  VALID: 'bg-success-soft text-success-fg',
  EXPIRING: 'bg-warning-soft text-warning-fg',
  EXPIRED: 'bg-serious-soft text-serious-fg',
  MISSING: 'bg-danger-soft text-danger-fg',
}

// Most urgent first, as in the employee list.
const URGENCY: Record<ComplianceStatus, number> = { EXPIRED: 0, MISSING: 1, EXPIRING: 2, VALID: 3 }

const held = (counts: { VALID: number; EXPIRING: number }) => counts.VALID + counts.EXPIRING
const employeesHref = (department: string) =>
  `/employees?department=${encodeURIComponent(department)}`

/**
 * Department × mandatory course. Each department opens into one row per person, aligned
 * under the course columns; each department cell opens a dialog listing its people.
 */
export function ComplianceMatrixTable({ matrix }: { matrix: ComplianceMatrix }) {
  const t = useTranslations('compliance')
  const locale = useLocale()
  const baseId = useId()
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [selected, setSelected] = useState<{ department: string; code: string } | null>(null)
  const opener = useRef<HTMLElement | null>(null)

  const toggle = (department: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (!next.delete(department)) next.add(department)
      return next
    })
  }
  const personRowId = (rowIndex: number, externalId: string) =>
    `${baseId}-${rowIndex}-${externalId}`
  const pct = (rate: number) => formatPercent(rate, locale)

  return (
    <>
      <div className="flex flex-col gap-2">
        <HeatLegend
          label={t('bands.label')}
          items={COMPLIANCE_BANDS.map(({ band, min }, i) => {
            const above = COMPLIANCE_BANDS[i - 1]
            return {
              band,
              label:
                above === undefined
                  ? t('bands.full', { value: pct(min) })
                  : min === 0
                    ? t('bands.below', { value: pct(above.min) })
                    : t('bands.range', { from: pct(min), to: pct(above.min - 0.01) }),
            }
          })}
        />
        {expanded.size > 0 && <PersonLegend />}
      </div>
      <TableContainer className="mt-3">
        {/* A real table: the colours reinforce the printed values, they never replace them. */}
        <Table className="border-separate border-spacing-0.5 p-2" aria-label={t('title')}>
          <THead className="bg-transparent">
            <tr>
              <Th className={cn(HEAD, STICKY)}>{t('department')}</Th>
              <Th align="right" className={HEAD}>
                {t('headcount')}
              </Th>
              {matrix.courses.map(c => (
                <Th key={c.code} className={cn(HEAD, 'px-1 text-center')}>
                  <Tooltip content={c.name}>
                    <TextLink asChild tone="muted">
                      {/* The column says the code; its link says the whole course. */}
                      <Link href={`/courses/${c.code}`} aria-label={`${c.code} ${c.name}`}>
                        {c.code}
                      </Link>
                    </TextLink>
                  </Tooltip>
                </Th>
              ))}
            </tr>
          </THead>
          <TBody className="divide-y-0">
            {matrix.rows.map((row, rowIndex) => {
              const isOpen = expanded.has(row.department)
              return (
                <Fragment key={row.department}>
                  <Tr>
                    <Th
                      scope="row"
                      nowrap
                      className={cn('border-b-0 px-1 py-1 text-sm text-fg', STICKY)}
                    >
                      <span className="flex items-center gap-1">
                        <ExpandButton
                          open={isOpen}
                          aria-controls={
                            isOpen
                              ? row.people.map(p => personRowId(rowIndex, p.externalId)).join(' ')
                              : undefined
                          }
                          aria-label={t('toggle', { department: row.department })}
                          onClick={() => {
                            toggle(row.department)
                          }}
                        />
                        <TextLink asChild>
                          <Link href={employeesHref(row.department)}>{row.department}</Link>
                        </TextLink>
                      </span>
                    </Th>
                    <Td align="right" className="px-2 py-0 text-fg-muted">
                      {formatInteger(row.headcount, locale)}
                    </Td>
                    {matrix.courses.map(course => {
                      const cell = row.cells[course.code]
                      if (!cell) {
                        return (
                          <Td key={course.code} className="p-0">
                            <HeatCell
                              band={null}
                              tooltip={`${row.department}, ${course.name}: ${t('notApplicable')}`}
                            >
                              <span className="sr-only">{t('notApplicable')}</span>
                            </HeatCell>
                          </Td>
                        )
                      }
                      return (
                        <Td key={course.code} className="p-0">
                          <HeatCell
                            band={complianceBand(cell.rate)}
                            tooltip={t('cellTitle', {
                              department: row.department,
                              course: course.name,
                              held: held(cell.counts),
                              total: cell.counts.total,
                            })}
                            aria-label={t('detail.open', {
                              department: row.department,
                              course: course.name,
                              rate: pct(cell.rate),
                            })}
                            aria-haspopup="dialog"
                            onClick={event => {
                              opener.current = event.currentTarget
                              setSelected({ department: row.department, code: course.code })
                            }}
                          >
                            {pct(cell.rate)}
                          </HeatCell>
                        </Td>
                      )
                    })}
                  </Tr>
                  {isOpen &&
                    row.people.map(person => (
                      <Tr
                        key={person.externalId}
                        id={personRowId(rowIndex, person.externalId)}
                        className="motion-safe:animate-fade-in"
                      >
                        <Th
                          scope="row"
                          nowrap
                          className={cn('border-b-0 py-0.5 pr-2 pl-9 font-normal', STICKY)}
                        >
                          <span className="flex flex-col leading-tight">
                            <TextLink asChild>
                              <Link href={`/employees/${person.externalId}`}>{person.name}</Link>
                            </TextLink>
                            {person.position && (
                              <span className="text-xs text-fg-subtle">{person.position}</span>
                            )}
                          </span>
                        </Th>
                        <Td className="p-0" />
                        {matrix.courses.map(course => (
                          <Td key={course.code} className="p-0">
                            <PersonCell
                              requirement={person.cells[course.code] ?? null}
                              courseName={course.name}
                            />
                          </Td>
                        ))}
                      </Tr>
                    ))}
                </Fragment>
              )
            })}
          </TBody>
        </Table>
      </TableContainer>
      {/* The columns say codes: the names, readable without a pointer to hover with. */}
      <dl
        aria-label={t('courseKey')}
        className="mt-3 grid gap-x-6 gap-y-1 text-xs text-fg-muted sm:grid-cols-2 lg:grid-cols-3"
      >
        {matrix.courses.map(c => (
          <div key={c.code} className="flex gap-2">
            <dt className="font-medium text-fg">{c.code}</dt>
            <dd>{c.name}</dd>
          </div>
        ))}
      </dl>
      <CellDialog
        matrix={matrix}
        selected={selected}
        onClose={() => {
          setSelected(null)
        }}
        returnFocusTo={() => opener.current}
      />
    </>
  )
}

function useRequirementText() {
  const t = useTranslations('compliance.person')
  const ts = useTranslations('status.compliance')
  const locale = useLocale()
  return (requirement: EmployeeListRequirement, courseName: string) =>
    [
      t('cell', { course: courseName, status: ts(requirement.status) }),
      requirement.validUntil &&
        t('validUntil', { date: formatDate(requirement.validUntil, locale) }),
      requirement.booked &&
        t('booked', { date: formatDateTime(requirement.booked.startsAt, locale) }),
    ]
      .filter(Boolean)
      .join(' · ')
}

/** One person × course: the status as tint and icon, with the words for screen readers. */
function PersonCell({
  requirement,
  courseName,
}: {
  requirement: EmployeeListRequirement | null
  courseName: string
}) {
  const t = useTranslations('compliance')
  const describe = useRequirementText()
  if (requirement === null) {
    return (
      <div className="flex h-8 items-center justify-center text-fg-subtle">
        <span aria-hidden>·</span>
        <span className="sr-only">{t('notApplicable')}</span>
      </div>
    )
  }
  const { Icon } = COMPLIANCE[requirement.status]
  const text = describe(requirement, courseName)
  return (
    <Tooltip content={text}>
      <div
        className={cn(
          'flex h-8 items-center justify-center gap-1 rounded-sm',
          STATUS_CELL[requirement.status]
        )}
      >
        <Icon aria-hidden className="size-4" />
        {requirement.booked && <CalendarCheck aria-hidden className="size-3.5" />}
        <span className="sr-only">{text}</span>
      </div>
    </Tooltip>
  )
}

/** Explains the people rows: one icon per state, and the booked mark. */
function PersonLegend() {
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

function CellDialog({
  matrix,
  selected,
  onClose,
  returnFocusTo,
}: {
  matrix: ComplianceMatrix
  selected: { department: string; code: string } | null
  onClose: () => void
  returnFocusTo: () => HTMLElement | null
}) {
  const t = useTranslations('compliance.detail')
  const tc = useTranslations('common')
  const row = selected ? matrix.rows.find(r => r.department === selected.department) : undefined
  const course = selected ? matrix.courses.find(c => c.code === selected.code) : undefined
  const cell = row && course ? row.cells[course.code] : null
  const locale = useLocale()
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
              held: held(cell.counts),
              total: cell.counts.total,
              rate: formatPercent(cell.rate, locale),
            })
          : undefined
      }
      closeLabel={tc('close')}
      returnFocusTo={returnFocusTo}
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
          <CellPeople row={row} code={course.code} />
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

/** The people a department cell counts, most urgent first. */
function CellPeople({ row, code }: { row: ComplianceMatrixRow; code: string }) {
  const t = useTranslations('compliance.detail')
  const tc = useTranslations('common')
  const locale = useLocale()
  const people = row.people
    .flatMap(person => {
      const requirement = person.cells[code]
      return requirement ? [{ person, requirement }] : []
    })
    .sort(
      (a, b) =>
        URGENCY[a.requirement.status] - URGENCY[b.requirement.status] ||
        (a.requirement.daysLeft ?? Infinity) - (b.requirement.daysLeft ?? Infinity)
    )
  return (
    <Table density="compact" aria-label={t('table')}>
      <THead className="bg-transparent">
        <tr>
          <Th>{t('name')}</Th>
          <Th>{t('status')}</Th>
          <Th>{t('validUntil')}</Th>
          <Th>{t('booked')}</Th>
        </tr>
      </THead>
      <TBody>
        {people.map(({ person, requirement: r }) => (
          <Tr key={person.externalId}>
            <Td nowrap>
              <TextLink asChild>
                <Link href={`/employees/${person.externalId}`}>{person.name}</Link>
              </TextLink>
            </Td>
            <Td>
              <ComplianceBadge status={r.status} />
            </Td>
            <Td nowrap>
              {r.validUntil === null ? (
                r.completedOn === null ? (
                  PLACEHOLDER
                ) : (
                  tc('noExpiry')
                )
              ) : (
                <>
                  {formatDate(r.validUntil, locale)}
                  {r.daysLeft !== null && (
                    <span className="ml-1.5 text-xs text-fg-muted">
                      ({formatRelativeDays(r.daysLeft, locale)})
                    </span>
                  )}
                </>
              )}
            </Td>
            <Td nowrap>
              {r.booked ? (
                <TextLink asChild>
                  <Link href={`/sessions/${r.booked.sessionExternalId}`}>
                    {formatDateTime(r.booked.startsAt, locale)}
                  </Link>
                </TextLink>
              ) : (
                PLACEHOLDER
              )}
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}
