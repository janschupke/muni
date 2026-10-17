'use client'

import type { Archivable } from '@muni/domain/archive'
import { Alert } from '@muni/ui/alert'
import { Button } from '@muni/ui/button'
import { IconButton } from '@muni/ui/icon-button'
import { ArchiveRestore } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useActionState } from 'react'

import { ARCHIVE_IDLE, type ArchiveState } from '@/lib/form'
import { useWhenWritten } from '@/lib/query/use-after-write'
import { unarchiveAction } from '@/server/actions/archive'

import { useRefusalText } from './use-refusal-text'

/**
 * Brings an archived record back (admins). It may not come back while an active record holds
 * its name or ID, or while something it belongs to is archived; the reason shows beside it.
 */
export function UnarchiveButton({
  kind,
  id,
  name,
  then = null,
  compact = false,
}: {
  kind: Archivable
  id: string
  name: string
  then?: string | null | undefined
  compact?: boolean | undefined
}) {
  const t = useTranslations('archive')
  const refusal = useRefusalText(kind)
  const [state, formAction, pending] = useActionState(
    async (previous: ArchiveState) => unarchiveAction(kind, id, then, previous),
    ARCHIVE_IDLE
  )
  useWhenWritten(state, state.status === 'done', state.status === 'done' ? state.href : undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {compact ? (
        <IconButton type="submit" label={t('unarchiveLabel', { name })} disabled={pending}>
          <ArchiveRestore aria-hidden />
        </IconButton>
      ) : (
        <Button type="submit" disabled={pending}>
          <ArchiveRestore aria-hidden />
          {t('unarchive')}
        </Button>
      )}
      {state.status === 'refused' && (
        <Alert tone="danger" className="w-full">
          {refusal(state)}
        </Alert>
      )}
    </form>
  )
}
