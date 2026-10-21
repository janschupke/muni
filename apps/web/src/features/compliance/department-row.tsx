'use client'

import type { ComplianceMatrix, ComplianceMatrixRow } from '@muni/db/repositories'
import { complianceBand, complianceOf } from '@muni/domain/compliance'
import { HeatCell } from '@muni/ui/charts/heat-cell'
import { cn } from '@muni/ui/cn'
import { ExpandButton } from '@muni/ui/expand-button'
import { Td, Th, Tr } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatInteger } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'

import { Link } from '@/components/navigation/link'
import { formatRate } from '@/lib/format/format-rate'

import { STICKY } from './matrix-styles'

/** A department's row: its name (and the toggle for its people), headcount, and one cell per course. */
export function DepartmentRow({
  row,
  courses,
  open,
  controls,
  onToggle,
  onOpenCell,
}: {
  row: ComplianceMatrixRow
  courses: ComplianceMatrix['courses']
  open: boolean
  /** The people rows the toggle shows, by id. */
  controls: string | undefined
  onToggle: () => void
  onOpenCell: (code: string, cell: HTMLElement) => void
}) {
  const t = useTranslations('compliance')
  const locale = useLocale()
  const pct = (rate: number) => formatRate(rate, locale)
  return (
    <Tr>
      <Th scope="row" nowrap className={cn('border-b-0 px-1 py-1 text-sm text-fg', STICKY)}>
        <span className="flex items-center gap-1">
          <ExpandButton
            open={open}
            aria-controls={controls}
            aria-label={t('toggle', { department: row.department })}
            onClick={onToggle}
          />
          <TextLink asChild>
            <Link href={`/departments/${row.departmentId}`}>{row.department}</Link>
          </TextLink>
        </span>
      </Th>
      <Td align="right" className="px-2 py-0 text-fg-muted">
        {formatInteger(row.headcount, locale)}
      </Td>
      {courses.map(course => {
        const cell = row.cells[course.code]
        return (
          <Td key={course.code} className="p-0">
            {cell ? (
              <HeatCell
                band={complianceBand(cell.rate)}
                tooltip={t('cellTitle', {
                  department: row.department,
                  course: course.name,
                  held: complianceOf(cell.counts).held,
                  total: cell.counts.total,
                })}
                aria-label={t('detail.open', {
                  department: row.department,
                  course: course.name,
                  rate: pct(cell.rate),
                })}
                aria-haspopup="dialog"
                onClick={event => {
                  onOpenCell(course.code, event.currentTarget)
                }}
              >
                {pct(cell.rate)}
              </HeatCell>
            ) : (
              <HeatCell
                band={null}
                tooltip={`${row.department}, ${course.name}: ${t('notApplicable')}`}
              >
                <span className="sr-only">{t('notApplicable')}</span>
              </HeatCell>
            )}
          </Td>
        )
      })}
    </Tr>
  )
}
