'use client'

import type { ArchiveImpact } from '@muni/db/repositories'
import type { Archivable } from '@muni/domain/archive'
import { Alert } from '@muni/ui/alert'
import { Button } from '@muni/ui/button'
import { Dialog } from '@muni/ui/dialog'
import { IconButton } from '@muni/ui/icon-button'
import { Archive } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useActionState, useRef, useState, useTransition } from 'react'

import { ARCHIVE_IDLE, archiveRefused, type ArchiveState } from '@/lib/form'
import { useWhenWritten } from '@/lib/query/use-after-write'
import { archiveAction, previewArchive } from '@/server/actions/archive'

import { useRefusalText } from './use-refusal-text'

/**
 * Archiving asks first, and says what goes with it (a person's future bookings) or why it
 * cannot happen yet (sessions still ahead, people still in a department). `then` is where to
 * go once archived; without it the page stays (a list row simply leaves the list).
 * `compact` makes it an icon button, for table rows.
 */
export function ConfirmArchiveButton({
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
  const t = useTranslations()
  const refusal = useRefusalText(kind)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [impact, setImpact] = useState<ArchiveImpact | null | 'loading'>('loading')
  const [, startTransition] = useTransition()
  const [state, formAction, pending] = useActionState(async (previous: ArchiveState) => {
    // Archived from a list row, the row leaves the list: close. (With `then`, the page leaves.)
    const next = await archiveAction(kind, id, then, previous)
    if (next.status === 'done') setOpen(false)
    return next
  }, ARCHIVE_IDLE)
  useWhenWritten(state, state.status === 'done', state.status === 'done' ? state.href : undefined, {
    title: t('archive.archivedToast', { name }),
  })

  const show = () => {
    setOpen(true)
    setImpact('loading')
    startTransition(async () => {
      setImpact(await previewArchive(kind, id))
    })
  }

  const label = t('archive.actionLabel', { name })
  const refused =
    impact !== 'loading' && impact !== null && !impact.ok
      ? archiveRefused(impact.reason, impact.count)
      : null
  return (
    <>
      {compact ? (
        <IconButton ref={trigger} label={label} onClick={show}>
          <Archive aria-hidden />
        </IconButton>
      ) : (
        <Button ref={trigger} onClick={show}>
          <Archive aria-hidden />
          {t('archive.action')}
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('archive.confirmTitle', { name })}
        description={t('archive.confirmBody')}
        closeLabel={t('common.close')}
        returnFocusTo={() => trigger.current}
      >
        <form action={formAction} className="flex flex-col gap-4">
          {impact === 'loading' && (
            <p className="text-sm text-fg-muted" role="status">
              {t('archive.checking')}
            </p>
          )}
          {impact !== 'loading' && impact?.ok && impact.removesBookings > 0 && (
            <Alert tone="warning">
              {t('archive.removesBookings', { count: impact.removesBookings })}
            </Alert>
          )}
          {impact !== 'loading' && impact?.ok && impact.leaves && (
            <Alert tone="warning">{t('archive.leaves', { department: impact.leaves })}</Alert>
          )}
          {refused?.status === 'refused' && <Alert tone="danger">{refusal(refused)}</Alert>}
          {state.status === 'refused' && <Alert tone="danger">{refusal(state)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false)
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={pending || impact === 'loading' || refused !== null}
            >
              <Archive aria-hidden />
              {t('archive.confirm')}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
