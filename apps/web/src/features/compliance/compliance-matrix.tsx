'use client'

import type { ComplianceMatrix } from '@muni/db/repositories'
import { bandRanges } from '@muni/domain/compliance'
import { HeatLegend } from '@muni/ui/charts/heat-cell'
import { cn } from '@muni/ui/cn'
import { Table, TableContainer, TBody, Th, THead } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { Tooltip } from '@muni/ui/tooltip'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Fragment, useId, useRef, useState } from 'react'

import { formatRate } from '@/lib/format/format-rate'
import { useToggleSet } from '@/lib/use-toggle-set'

import { CellDialog } from './cell-dialog'
import { DepartmentRow } from './department-row'
import { HEAD, STICKY } from './matrix-styles'
import { DepartmentPeople, PersonLegend } from './person-rows'

/** Which cell's dialog is open: a department and a course. */
type Selected = { department: string; code: string } | null

/** What each colour band covers, as whole percents. */
function BandLegend() {
  const t = useTranslations('compliance')
  const locale = useLocale()
  const pct = (rate: number) => formatRate(rate, locale)
  return (
    <HeatLegend
      label={t('bands.label')}
      items={bandRanges().map(({ band, from, to }) => ({
        band,
        label:
          to === null
            ? t('bands.full', { value: pct(from ?? 1) })
            : from === null
              ? t('bands.below', { value: pct(to) })
              : t('bands.range', { from: pct(from), to: pct(to) }),
      }))}
    />
  )
}

/** The columns say codes: the names, readable without a pointer to hover with. */
function CourseKey({ courses }: { courses: ComplianceMatrix['courses'] }) {
  const t = useTranslations('compliance')
  return (
    <dl
      aria-label={t('courseKey')}
      className="mt-3 grid gap-x-6 gap-y-1 text-xs text-fg-muted sm:grid-cols-2 lg:grid-cols-3"
    >
      {courses.map(c => (
        <div key={c.code} className="flex gap-2">
          <dt className="font-medium text-fg">{c.code}</dt>
          <dd>{c.name}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Department × mandatory course. Each department opens into one row per person, aligned
 * under the course columns; each department cell opens a dialog listing its people, where an
 * admin books the ones who need the training.
 */
export function ComplianceMatrixTable({
  matrix,
  canBook,
}: {
  matrix: ComplianceMatrix
  canBook: boolean
}) {
  const t = useTranslations('compliance')
  const baseId = useId()
  const [expanded, toggle] = useToggleSet<string>()
  const [selected, setSelected] = useState<Selected>(null)
  // The cell that opened the dialog, which gets the focus back when it closes.
  const opener = useRef<HTMLElement | null>(null)
  const openCell = (department: string) => (code: string, cell: HTMLElement) => {
    opener.current = cell
    setSelected({ department, code })
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <BandLegend />
        {expanded.size > 0 && <PersonLegend />}
      </div>
      <TableContainer paging="a grid of every department by every required course" className="mt-3">
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
                    <TextLink asChild>
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
              const open = expanded.has(row.department)
              const personRowId = (externalId: string) => `${baseId}-${rowIndex}-${externalId}`
              return (
                <Fragment key={row.department}>
                  <DepartmentRow
                    row={row}
                    courses={matrix.courses}
                    open={open}
                    controls={
                      open ? row.people.map(p => personRowId(p.externalId)).join(' ') : undefined
                    }
                    onToggle={() => {
                      toggle(row.department)
                    }}
                    onOpenCell={openCell(row.department)}
                  />
                  {open && (
                    <DepartmentPeople
                      row={row}
                      courses={matrix.courses}
                      rowId={personRowId}
                      onOpen={openCell(row.department)}
                    />
                  )}
                </Fragment>
              )
            })}
          </TBody>
        </Table>
      </TableContainer>
      <CourseKey courses={matrix.courses} />
      <CellDialog
        matrix={matrix}
        selected={selected}
        onClose={() => {
          setSelected(null)
        }}
        returnFocusTo={() => opener.current}
        canBook={canBook}
      />
    </>
  )
}
