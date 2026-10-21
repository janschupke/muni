import type { Archivable } from '@muni/domain/archive'
import { Button } from '@muni/ui/button'
import { IconButton } from '@muni/ui/icon-button'
import { Pencil } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Link } from '@/components/navigation/link'
import { ConfirmArchiveButton } from '@/features/archive/confirm-archive-button'

/** The record an action acts on, and its edit form when it has one. */
export interface Target {
  kind: Archivable
  id: string
  /** What the record is called in labels and the confirm dialog. */
  name: string
  editHref?: string | undefined
  /** False for a record that is not archived now (an upcoming session is cancelled instead). */
  archivable?: boolean | undefined
  /** What the record offers in archiving's place or beside it (cancel or reinstate a session). */
  lead?: ReactNode
}

/**
 * A record page's header actions for admins, left to right: the record's own acts (`lead`),
 * Archive (when it can be archived now), Edit (when the record has a form), then the page's
 * own primary action (`children`) last; with none, Edit is the primary. Archiving leaves for
 * `then`, the list the record was in.
 */
export function RecordActions({
  kind,
  id,
  name,
  editHref,
  archivable = true,
  lead,
  then,
  children,
}: Target & { then: string; children?: ReactNode }) {
  const t = useTranslations('common')
  return (
    <>
      {lead}
      {archivable && <ConfirmArchiveButton kind={kind} id={id} name={name} then={then} />}
      {editHref && (
        <Button asChild variant={children ? 'secondary' : 'primary'}>
          <Link href={editHref}>
            <Pencil aria-hidden />
            {t('edit')}
          </Link>
        </Button>
      )}
      {children}
    </>
  )
}

/**
 * A table row's actions for admins: a pencil to edit (when the record has an edit form), the
 * record's own act (`lead`), and archive when it can be archived now (the row then leaves
 * the list).
 */
export function RowActions({ kind, id, name, editHref, archivable = true, lead }: Target) {
  const t = useTranslations('common')
  return (
    <div className="flex justify-end gap-1">
      {editHref && (
        <IconButton asChild tone="accent" label={t('editLabel', { name })}>
          <Link href={editHref}>
            <Pencil aria-hidden />
          </Link>
        </IconButton>
      )}
      {lead}
      {archivable && <ConfirmArchiveButton kind={kind} id={id} name={name} compact />}
    </div>
  )
}
