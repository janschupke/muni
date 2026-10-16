import type { CourseCompliance } from '@muni/db/repositories'
import { complianceBand } from '@muni/domain/compliance'
import { HeatCell } from '@muni/ui/charts/heat-cell'
import { Table, TableContainer, TBody, Td, Th, THead } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatInteger, formatPercent } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { ComplianceBar } from '@/components/compliance-breakdown'
import { RequirementList } from '@/components/requirement-list'

/** A group's mandatory courses: why it must hold each, and how much of it it holds. */
export function CourseComplianceTable({ courses }: { courses: CourseCompliance[] }) {
  const t = useTranslations('org.courseColumns')
  const locale = useLocale()
  return (
    <TableContainer>
      <Table>
        <THead>
          <tr>
            <Th>{t('course')}</Th>
            <Th>{t('requiredBy')}</Th>
            <Th className="w-56">{t('compliance')}</Th>
            <Th align="right">{t('held')}</Th>
          </tr>
        </THead>
        <TBody>
          {courses.map(c => (
            <tr key={c.code}>
              <Td>
                <TextLink asChild emphasis>
                  <Link href={`/courses/${c.code}`}>{c.name}</Link>
                </TextLink>
              </Td>
              <Td>
                <RequirementList requirements={c.requiredBy} />
              </Td>
              <Td>
                <div className="flex items-center gap-2">
                  <HeatCell
                    band={complianceBand(c.rate)}
                    tooltip={`${c.name}: ${formatPercent(c.rate, locale)}`}
                    className="h-7 w-16 min-w-16 flex-none text-xs"
                  >
                    {formatPercent(c.rate, locale)}
                  </HeatCell>
                  <div className="min-w-0 flex-1">
                    <ComplianceBar counts={c.counts} label={c.name} />
                  </div>
                </div>
              </Td>
              <Td align="right" nowrap>
                {formatInteger(c.counts.VALID + c.counts.EXPIRING, locale)} /{' '}
                {formatInteger(c.counts.total, locale)}
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </TableContainer>
  )
}
