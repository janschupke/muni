import type { CourseCompliance } from '@muni/db/repositories'
import { BarRow } from '@muni/ui/bar-row'
import { Table, TableContainer, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { ComplianceBar, useHeldText } from '@/features/compliance/compliance-breakdown'
import { RequirementList } from '@/features/courses/requirement-list'

/** A group's mandatory courses: why it must hold each, and how much of it it holds. */
export function CourseComplianceTable({
  courses,
  label,
}: {
  courses: CourseCompliance[]
  /** The table's accessible name: the section's heading. */
  label: string
}) {
  const t = useTranslations('org.courseColumns')
  const heldText = useHeldText()
  return (
    <TableContainer paging="one row per course the group must hold: bounded by the catalogue">
      <Table aria-label={label}>
        <THead>
          <tr>
            <Th>{t('course')}</Th>
            <Th>{t('requiredBy')}</Th>
            <Th className="w-80">{t('compliance')}</Th>
          </tr>
        </THead>
        <TBody>
          {courses.map(c => (
            <Tr key={c.code}>
              <Td>
                <TextLink asChild emphasis>
                  <Link href={`/courses/${c.code}`}>{c.name}</Link>
                </TextLink>
              </Td>
              <Td>
                <RequirementList requirements={c.requiredBy} />
              </Td>
              <Td>
                <BarRow
                  layout="inline"
                  bar={<ComplianceBar counts={c.counts} label={c.name} />}
                  value={heldText(c.counts)}
                />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableContainer>
  )
}
