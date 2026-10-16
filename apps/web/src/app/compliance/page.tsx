import { getComplianceMatrix } from '@muni/db/repositories'
import { HeatCell, HeatLegend } from '@muni/ui/charts/heat-cell'
import { cn } from '@muni/ui/cn'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { Table, TableContainer, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatDate, formatInteger, formatPercent } from '@muni/utils/format'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('compliance'))('title') }
}

/**
 * Colour encodes the compliance gap, not the rate: full compliance recedes toward the
 * surface and anything at or below 50 % gets the strongest step, so problems stand out.
 */
const gapIntensity = (rate: number) => Math.min(1, (1 - rate) / 0.5)

const HEAD = 'border-b-0 px-2 py-1'

export default async function CompliancePage() {
  const [matrix, t, locale] = await Promise.all([
    getComplianceMatrix(),
    getTranslations('compliance'),
    getLocale(),
  ])
  return (
    <>
      <PageHeader
        title={t('title')}
        description={`${t('description')} ${formatDate(matrix.asOf, locale)}`}
      />
      {matrix.courses.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <>
          <HeatLegend low={t('legendFull')} high={t('legendPoor')} />
          <TableContainer className="mt-3">
            {/* A real table: the colours reinforce the printed percentages, they never replace them. */}
            <Table className="border-separate border-spacing-0.5 p-2">
              <THead className="bg-transparent">
                <tr>
                  <Th className={HEAD}>{t('department')}</Th>
                  <Th align="right" className={HEAD}>
                    {t('headcount')}
                  </Th>
                  {matrix.courses.map(c => (
                    <Th key={c.code} className={cn(HEAD, 'px-1 text-center')}>
                      <TextLink asChild className="text-fg-muted">
                        <Link href={`/courses/${c.code}`} title={c.name}>
                          {c.code}
                        </Link>
                      </TextLink>
                    </Th>
                  ))}
                </tr>
              </THead>
              <TBody className="divide-y-0">
                {matrix.rows.map(row => (
                  <Tr key={row.department}>
                    <Th scope="row" nowrap className="border-b-0 px-2 py-1 text-sm text-fg">
                      <TextLink asChild>
                        <Link href={`/employees?department=${encodeURIComponent(row.department)}`}>
                          {row.department}
                        </Link>
                      </TextLink>
                    </Th>
                    <Td align="right" className="px-2 py-0 text-fg-muted">
                      {formatInteger(row.headcount, locale)}
                    </Td>
                    {matrix.courses.map(course => {
                      const cell = row.cells[course.code]
                      const title = cell
                        ? t('cellTitle', {
                            department: row.department,
                            course: course.name,
                            held: cell.counts.VALID + cell.counts.EXPIRING,
                            total: cell.counts.total,
                          })
                        : `${row.department}, ${course.name}: ${t('notApplicable')}`
                      return (
                        <Td key={course.code} className="p-0">
                          <HeatCell intensity={cell ? gapIntensity(cell.rate) : null} title={title}>
                            {cell ? (
                              formatPercent(cell.rate, locale)
                            ) : (
                              <span className="sr-only">{t('notApplicable')}</span>
                            )}
                          </HeatCell>
                        </Td>
                      )
                    })}
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        </>
      )}
    </>
  )
}
