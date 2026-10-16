import type { Archivable } from '@muni/domain/archive'
import { Button } from '@muni/ui/button'
import { Pencil } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { ConfirmArchiveButton } from './confirm-archive-button'

interface Target {
  kind: Archivable
  id: string
  /** What the record is called in labels and the confirm dialog. */
  name: string
  editHref: string
}

/**
 * A record page's header actions for admins: anything the page adds first (`children`), then
 * Edit and Archive. Archiving leaves for `then`, the list the record was in.
 */
export function RecordActions({
  kind,
  id,
  name,
  editHref,
  then,
  children,
}: Target & { then: string; children?: ReactNode }) {
  const t = useTranslations('common')
  return (
    <>
      {children}
      <Button asChild>
        <Link href={editHref}>
          <Pencil aria-hidden />
          {t('edit')}
        </Link>
      </Button>
      <ConfirmArchiveButton kind={kind} id={id} name={name} then={then} />
    </>
  )
}
