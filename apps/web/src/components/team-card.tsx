import type { EmployeeDetail } from '@muni/db/repositories'
import { BarRow } from '@muni/ui/bar-row'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { ItemList, ItemListRow } from '@muni/ui/item-list'
import { Meter } from '@muni/ui/meter'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatPercent } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { ComplianceBar } from './compliance-breakdown'
import { ComplianceBadge, rateTone } from './status-badges'

/** A manager's direct reports and how their mandatory training stands together. */
export function TeamCard({
  employee,
}: {
  employee: Pick<EmployeeDetail, 'externalId' | 'reports' | 'teamCounts'>
}) {
  const t = useTranslations('employees.detail.team')
  const locale = useLocale()
  const { teamCounts: counts } = employee
  const held = counts.VALID + counts.EXPIRING
  const rate = counts.total === 0 ? 1 : held / counts.total
  return (
    <Card>
      <CardHeader
        title={t('title')}
        description={t('description', { count: employee.reports.length })}
      />
      <CardBody className="flex flex-col gap-4">
        {counts.total > 0 && (
          <div className="flex flex-col gap-2">
            <BarRow
              label={t('heldOf', { held, total: counts.total })}
              value={formatPercent(rate, locale)}
              bar={
                <Meter
                  value={held}
                  max={counts.total}
                  label={t('title')}
                  tone={rateTone(rate)}
                  size="md"
                />
              }
            />
            <ComplianceBar counts={counts} label={t('title')} />
          </div>
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
