import { getEmployee } from '@muni/db/repositories'
import { buttonClass } from '@muni/ui/button'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { Table, TableContainer, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { formatCzk, formatDate, formatPercent } from '@muni/utils/format'
import { Pencil, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { ComplianceBadge, EmploymentBadge } from '@/components/status-badges'
import { getViewer } from '@/server/auth'

type Props = { params: Promise<{ externalId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { externalId } = await params
  return { title: externalId }
}

export default async function EmployeePage({ params }: Props) {
  const { externalId } = await params
  const viewer = await getViewer()
  const [employee, t, te, tc, tCommon, tForm, locale] = await Promise.all([
    getEmployee(externalId, viewer),
    getTranslations('employees.detail'),
    getTranslations('employees'),
    getTranslations('courses'),
    getTranslations('common'),
    getTranslations('forms.completion'),
    getLocale(),
  ])
  if (!employee) notFound()
  const canEdit = viewer === 'authenticated'
  const date = (value: string | null) => (value ? formatDate(value, locale) : '—')

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/employees" className="hover:underline">
            {te('title')}
          </Link>
        }
        title={`${employee.firstName} ${employee.lastName}`}
        description={[employee.position, employee.department].filter(Boolean).join(' · ')}
        actions={
          canEdit && (
            <>
              <Link
                href={`/employees/${employee.externalId}/completions/new`}
                className={buttonClass({ variant: 'primary' })}
              >
                <Plus aria-hidden />
                {t('recordCompletion')}
              </Link>
              <Link href={`/employees/${employee.externalId}/edit`} className={buttonClass()}>
                <Pencil aria-hidden />
                {tCommon('edit')}
              </Link>
            </>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title={t('profile')} />
          <CardBody>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <Row label="ID">{employee.externalId}</Row>
              <Row label={te('columns.status')}>
                <EmploymentBadge status={employee.status} />
              </Row>
              {'email' in employee && <Row label={t('email')}>{employee.email ?? '—'}</Row>}
              {'nationalId' in employee && (
                <Row label={t('nationalId')}>{employee.nationalId ?? '—'}</Row>
              )}
              <Row label={t('manager')}>
                {employee.manager ? (
                  <Link
                    href={`/employees/${employee.manager.externalId}`}
                    className="hover:underline"
                  >
                    {employee.manager.name}
                  </Link>
                ) : (
                  '—'
                )}
              </Row>
              <Row label={t('hiredOn')}>{date(employee.hiredOn)}</Row>
              {employee.leftOn && <Row label={t('leftOn')}>{date(employee.leftOn)}</Row>}
              {'note' in employee && employee.note && (
                <Row label={t('note')}>
                  <span className="whitespace-pre-line">{employee.note}</span>
                </Row>
              )}
            </dl>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title={t('requirements')}
            description={
              employee.requirements.length > 0
                ? t('rate', { rate: formatPercent(employee.completionRate, locale) })
                : t('requirementsDescription')
            }
          />
          <CardBody>
            {employee.requirements.length === 0 ? (
              <p className="text-sm text-fg-muted">{t('noRequirements')}</p>
            ) : (
              <ul className="divide-y divide-border-muted">
                {employee.requirements.map(r => (
                  <li
                    key={r.courseCode}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <Link href={`/courses/${r.courseCode}`} className="font-medium hover:underline">
                      {r.courseName}
                    </Link>
                    <span className="flex items-center gap-3 text-fg-muted">
                      {r.validUntil && (
                        <span>
                          {tc('detail.validUntil')} {date(r.validUntil)}
                        </span>
                      )}
                      <ComplianceBadge status={r.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <h2 className="mt-8 mb-3 text-base font-semibold">{t('history')}</h2>
      {employee.completions.length === 0 ? (
        <EmptyState title={t('noHistory')} />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <Th>{tc('columns.name')}</Th>
                <Th>{tc('detail.completedOn')}</Th>
                <Th>{tc('detail.validUntil')}</Th>
                <Th>{tForm('provider')}</Th>
                <Th className="text-right">{tForm('price')}</Th>
                {canEdit && <Th>{t('note')}</Th>}
              </tr>
            </THead>
            <TBody>
              {employee.completions.map(c => (
                <Tr key={c.externalId}>
                  <Td>
                    <Link href={`/courses/${c.courseCode}`} className="hover:underline">
                      {c.courseName}
                    </Link>
                    <div className="text-xs text-fg-subtle">{c.externalId}</div>
                  </Td>
                  <Td className="whitespace-nowrap">{date(c.completedOn)}</Td>
                  <Td className="whitespace-nowrap">
                    {c.validUntil ? date(c.validUntil) : tCommon('noExpiry')}
                  </Td>
                  <Td>{c.provider ?? '—'}</Td>
                  <Td className="text-right tabular-nums">
                    {c.price == null ? '—' : formatCzk(c.price, locale)}
                  </Td>
                  {canEdit && (
                    <Td className="max-w-xs whitespace-pre-line text-fg-muted">{c.note ?? ''}</Td>
                  )}
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}
    </>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </>
  )
}
