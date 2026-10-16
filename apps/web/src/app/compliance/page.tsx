import { getComplianceMatrix } from '@muni/db/repositories'
import { HeatCell, HeatLegend } from '@muni/ui/charts/heat-cell'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { formatDate, formatPercent } from '@muni/utils/format'
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
          <div className="mt-3 overflow-x-auto rounded-lg border border-border-default bg-surface-elevated">
            {/* A real table: the colours reinforce the printed percentages, they never replace them. */}
            <table className="w-full border-separate border-spacing-0.5 p-2 text-sm">
              <thead>
                <tr>
                  <th scope="col" className="px-2 py-1 text-left text-xs font-medium text-fg-muted">
                    {t('department')}
                  </th>
                  <th
                    scope="col"
                    className="px-2 py-1 text-right text-xs font-medium text-fg-muted"
                  >
                    {t('headcount')}
                  </th>
                  {matrix.courses.map(c => (
                    <th
                      key={c.code}
                      scope="col"
                      className="px-1 py-1 text-xs font-medium text-fg-muted"
                    >
                      <Link href={`/courses/${c.code}`} title={c.name} className="hover:underline">
                        {c.code}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map(row => (
                  <tr key={row.department}>
                    <th scope="row" className="px-2 py-1 text-left font-medium whitespace-nowrap">
                      <Link
                        href={`/employees?department=${encodeURIComponent(row.department)}`}
                        className="hover:underline"
                      >
                        {row.department}
                      </Link>
                    </th>
                    <td className="px-2 text-right text-fg-muted tabular-nums">{row.headcount}</td>
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
                        <td key={course.code}>
                          <HeatCell intensity={cell ? gapIntensity(cell.rate) : null} title={title}>
                            {cell ? (
                              formatPercent(cell.rate, locale)
                            ) : (
                              <span className="sr-only">{t('notApplicable')}</span>
                            )}
                          </HeatCell>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
