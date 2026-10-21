import type { EmployeeDetail } from '@muni/db/repositories'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { ItemList, ItemListRow } from '@muni/ui/item-list'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { useTranslations } from 'next-intl'

import { ComplianceBadge } from '@/components/badges/status-badges'
import { Link } from '@/components/navigation/link'
import { ComplianceSummary } from '@/features/compliance/compliance-breakdown'

/** A manager's direct reports and how their mandatory training stands together. */
export function TeamCard({
  employee,
}: {
  employee: Pick<EmployeeDetail, 'externalId' | 'reports' | 'teamCounts'>
}) {
  const t = useTranslations('employees.detail.team')
  const { teamCounts: counts } = employee
  return (
    <Card>
      <CardHeader
        title={t('title')}
        description={t('description', { count: employee.reports.length })}
      />
      <CardBody className="flex flex-col gap-4">
        {counts.total > 0 && (
          <ComplianceSummary counts={counts} label={t('held')} name={t('title')} />
        )}
        <ItemList>
          {employee.reports.map(r => (
            <ItemListRow key={r.externalId}>
              <CellStack
                title={
                  <TextLink asChild>
                    <Link href={`/employees/${r.externalId}`}>{r.name}</Link>
                  </TextLink>
                }
                meta={r.position ?? undefined}
              />
              <ComplianceBadge status={r.compliance} />
            </ItemListRow>
          ))}
        </ItemList>
        <p className="text-sm">
          <TextLink asChild arrow>
            <Link href={`/employees?manager=${employee.externalId}`}>{t('inList')}</Link>
          </TextLink>
        </p>
      </CardBody>
    </Card>
  )
}
