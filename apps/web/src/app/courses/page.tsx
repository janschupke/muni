import { listCourses } from '@muni/db/repositories'
import { PageHeader } from '@muni/ui/page-header'
import { Table, TableContainer, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { formatInteger, formatPercent } from '@muni/utils/format'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

import { ComplianceBar, ComplianceLegend } from '@/components/compliance-breakdown'
import { RequirementList } from '@/components/requirement-list'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('courses'))('title') }
}

export default async function CoursesPage() {
  const [courses, t, tc, locale] = await Promise.all([
    listCourses(),
    getTranslations('courses'),
    getTranslations('common'),
    getLocale(),
  ])
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <ComplianceLegend className="mb-3" />
      <TableContainer>
        <Table>
          <THead>
            <tr>
              <Th>{t('columns.name')}</Th>
              <Th>{t('columns.validity')}</Th>
              <Th>{t('columns.requiredFor')}</Th>
              <Th className="w-56">{t('columns.compliance')}</Th>
              <Th className="text-right">{t('columns.completions')}</Th>
              <Th className="text-right">{t('columns.upcoming')}</Th>
            </tr>
          </THead>
          <TBody>
            {courses.map(c => (
              <Tr key={c.code}>
                <Td>
                  <Link href={`/courses/${c.code}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  <div className="text-xs text-fg-subtle">{c.code}</div>
                </Td>
                <Td className="whitespace-nowrap">
                  {c.validityMonths === null
                    ? tc('noExpiry')
                    : tc('months', { count: c.validityMonths })}
                </Td>
                <Td>
                  <RequirementList requirements={c.requirements} />
                </Td>
                <Td>
                  {c.counts.total > 0 ? (
                    <div className="flex items-center gap-2">
                      <ComplianceBar counts={c.counts} label={c.name} />
                      <span className="w-10 text-right text-xs tabular-nums">
                        {formatPercent(c.rate, locale)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </Td>
                <Td className="text-right tabular-nums">
                  {formatInteger(c.completionCount, locale)}
                </Td>
                <Td className="text-right tabular-nums">{c.upcomingSessions}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableContainer>
    </>
  )
}
