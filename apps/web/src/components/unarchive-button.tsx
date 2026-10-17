'use client'

import type { Archivable } from '@muni/domain/archive'
import { Button } from '@muni/ui/button'
import { IconButton } from '@muni/ui/icon-button'
import { ArchiveRestore } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { ARCHIVE_IDLE } from '@/lib/form'
import { useAfterWrite } from '@/lib/query/use-after-write'
import { unarchiveAction } from '@/server/actions/archive'

import { ConfirmDialog } from './confirm-dialog'
import { originOf } from './navigation-history'
import { useRefusalText } from './use-refusal-text'

/**
 * Brings an archived record back (admins), after saying what that means. It may not come
 * back while an active record holds its name or ID, or while something it belongs to is
 * archived; the dialog then says why.
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
  const afterWrite = useAfterWrite('archive')
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const show = () => {
    setOpen(true)
  }
  return (
    <>
      {compact ? (
        <IconButton
          ref={trigger}
          tone="success"
          label={t('unarchiveLabel', { name })}
          onClick={show}
        >
          <ArchiveRestore aria-hidden />
        </IconButton>
      ) : (
        <Button ref={trigger} onClick={show}>
          <ArchiveRestore aria-hidden />
          {t('unarchive')}
        </Button>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('unarchiveTitle', { name })}
        confirmLabel={t('unarchive')}
        returnFocusTo={() => trigger.current}
        onConfirm={async () => {
          const state = await unarchiveAction(kind, id, then, ARCHIVE_IDLE)
          if (state.status === 'refused') return { kind: 'refused', message: refusal(state) }
          // Archived from its own page: back where that page was opened from, else the list.
          afterWrite(state.status === 'done' && state.href ? (originOf() ?? state.href) : undefined)
          return { kind: 'done', toast: { title: t('unarchivedToast', { name }) } }
        }}
      >
        <p className="text-sm text-fg-muted">{t('unarchiveBody')}</p>
      </ConfirmDialog>
    </>
  )
}
