import { type ArchivedField, getArchivedRecord, listArchived } from '@muni/db/repositories'
import type { Archivable } from '@muni/domain/archive'
import { Button } from '@muni/ui/button'
import { Card, CardBody } from '@muni/ui/card'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { formatDateTime, PLACEHOLDER } from '@muni/utils/format'
import { Archive } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'

import { ArchivedBadge, UserName } from '@/components/archived'
import { BackLink } from '@/components/back-link'
import { UnarchiveButton } from '@/components/unarchive-button'
import type en from '@/i18n/messages/en.json'
import { requireAdminPage } from '@/server/auth'

import { ArchivedTable } from './archived-table'
import { ArchivedValue } from './archived-value'
import { archivedListPath, LIST_PATH } from './paths'

/** Labels of the fields an archived record's page lists (archive.fields). */
type ArchivedFieldKey = keyof (typeof en)['archive']['fields']

// The archived records of every kind, for admins only: a list per kind, and a page per record
// with its real details (the one place an archived person's name shows).

/** The list header's way to the archived records of its kind (admins only). */
export function ArchivedListLink({ kind }: { kind: Archivable }) {
  const t = useTranslations('archive.list')
  return (
    <Button asChild variant="ghost">
      <Link href={archivedListPath(kind)}>
        <Archive aria-hidden />
        {t('show')}
      </Link>
    </Button>
  )
}

export async function archivedListMetadata(kind: Archivable) {
  return { title: (await getTranslations('archive.kinds'))(`${kind}.title`) }
}

export async function ArchivedListPage({ kind }: { kind: Archivable }) {
  const user = await requireAdminPage()
  const [items, t, tk] = await Promise.all([
    listArchived(kind, user.role),
    getTranslations('archive'),
    getTranslations('archive.kinds'),
  ])
  return (
    <>
      <PageHeader
        eyebrow={<BackLink fallback={{ href: LIST_PATH[kind], label: tk(`${kind}.list`) }} />}
        title={tk(`${kind}.title`)}
        description={t('list.description')}
        actions={
          // Completions belong to people; theirs are reached from the archived people.
          kind === 'employee' && (
            <Button asChild variant="ghost">
              <Link href={archivedListPath('completion')}>
                <Archive aria-hidden />
                {tk('completion.title')}
              </Link>
            </Button>
          )
        }
      />
      {items.length === 0 ? (
        <EmptyState title={t('list.empty')} />
      ) : (
        <ArchivedTable kind={kind} items={items} />
      )}
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

export async function ArchivedRecordPage({ kind, id }: { kind: Archivable; id: string }) {
  const user = await requireAdminPage()
  const [record, t, tAll, locale] = await Promise.all([
    getArchivedRecord(kind, id, user.role),
    getTranslations('archive'),
    getTranslations(),
    getLocale(),
  ])
  if (!record) notFound()
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
              {formatDateTime(record.archivedAt, locale)}
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
