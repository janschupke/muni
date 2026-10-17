'use client'

import type { ArchivedField } from '@muni/db/repositories'
import type { Archivable } from '@muni/domain/archive'
import { Button } from '@muni/ui/button'
import { Card, CardBody } from '@muni/ui/card'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { formatDateTime, PLACEHOLDER } from '@muni/utils/format'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Archive } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { ArchivedBadge, UserName } from '@/components/archived'
import { BackLink } from '@/components/back-link'
import { ReadView } from '@/components/read-view'
import { ArchivedRecordSkeleton, TableSkeleton } from '@/components/skeletons'
import { UnarchiveButton } from '@/components/unarchive-button'
import type en from '@/i18n/messages/en.json'
import { ARCHIVED_SORT } from '@/lib/list-keys'
import { readQuery } from '@/lib/query/queries'
import { useDocumentTitle } from '@/lib/query/use-document-title'
import { useListUrl } from '@/lib/use-list-url'
import type { ReadOutput } from '@/server/reads/registry'

import { ArchivedTable } from './archived-table'
import { ArchivedValue } from './archived-value'
import { archivedListPath, LIST_PATH } from './paths'

/** Labels of the fields an archived record's page lists (archive.fields). */
type ArchivedFieldKey = keyof (typeof en)['archive']['fields']

// The archived records of every kind, for admins only: a list per kind, and a page per record
// with its real details (the one place an archived person's name shows).

/** The archived records of one kind, newest first. */
export function ArchivedListView({ kind }: { kind: Archivable }) {
  const t = useTranslations('archive')
  const tk = useTranslations('archive.kinds')
  const list = useListUrl(ARCHIVED_SORT, { id: 'archivedAt', desc: true })
  const read = useQuery({
    ...readQuery('archived-list', { kind, ...list.input }),
    placeholderData: keepPreviousData,
  })
  return (
    <>
      <PageHeader
        eyebrow={<BackLink fallback={{ href: LIST_PATH[kind], label: tk(`${kind}.list`) }} />}
        title={tk(`${kind}.title`)}
        description={t('list.description')}
        actions={
          // Completions belong to people; theirs are reached from the archived people.
          kind === 'employee' && (
            <Button asChild>
              <Link href={archivedListPath('completion')}>
                <Archive aria-hidden />
                {tk('completion.title')}
              </Link>
            </Button>
          )
        }
      />
      <ReadView titled query={read} skeleton={<TableSkeleton columns={4} />}>
        {items =>
          items.total === 0 ? (
            <EmptyState title={t('list.empty')} />
          ) : (
            <ArchivedTable kind={kind} items={items.items} paging={list.paging(items)} />
          )
        }
      </ReadView>
    </>
  )
}

/** Field values that are codes, translated: an employee's or a session's status, a room's kind, a role. */
const ENUM_FIELDS: Partial<Record<Archivable, Record<string, string>>> = {
  employee: { status: 'status.employment' },
  session: { status: 'status.session' },
  room: { kind: 'status.roomKind' },
  user: { role: 'status.role' },
}

/** One archived record with its real details, and the way to bring it back. */
export function ArchivedRecordView({ kind, id }: { kind: Archivable; id: string }) {
  const read = useQuery(readQuery('archived-record', { kind, id }))
  useDocumentTitle(read.data?.title)
  return (
    <ReadView query={read} skeleton={<ArchivedRecordSkeleton />}>
      {record => <ArchivedRecordDetail kind={kind} record={record} />}
    </ReadView>
  )
}

function ArchivedRecordDetail({
  kind,
  record,
}: {
  kind: Archivable
  record: ReadOutput<'archived-record'>
}) {
  const t = useTranslations('archive')
  const tAll = useTranslations()
  const value = (field: ArchivedField) => {
    const family = ENUM_FIELDS[kind]?.[field.key]
    if (family && typeof field.value === 'string')
      return tAll(`${family}.${field.value}` as Parameters<typeof tAll>[0])
    return <ArchivedValue field={field} />
  }
  return (
    <>
      <PageHeader
        eyebrow={
          <BackLink fallback={{ href: archivedListPath(kind), label: t(`kinds.${kind}.title`) }} />
        }
        title={record.title}
        description={<ArchivedBadge />}
        actions={
          <UnarchiveButton kind={kind} id={record.id} name={record.title} then={LIST_PATH[kind]} />
        }
      />
      <Card className="max-w-3xl">
        <CardBody className="flex flex-col gap-4">
          <p className="text-sm text-fg-muted">{t('record.adminOnly')}</p>
          <DescriptionList>
            {record.fields.map(field => (
              <DescriptionItem key={field.key} label={t(`fields.${field.key as ArchivedFieldKey}`)}>
                {value(field)}
              </DescriptionItem>
            ))}
            <DescriptionItem label={t('record.archivedAt')}>
              {formatDateTime(record.archivedAt)}
            </DescriptionItem>
            <DescriptionItem label={t('record.archivedBy')}>
              {record.archivedBy ? <UserName user={record.archivedBy} /> : PLACEHOLDER}
            </DescriptionItem>
          </DescriptionList>
        </CardBody>
      </Card>
    </>
  )
}
