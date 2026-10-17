'use client'

import type { ArchiveImpact } from '@muni/db/repositories'
import type { Archivable } from '@muni/domain/archive'
import { Alert } from '@muni/ui/alert'
import { Button } from '@muni/ui/button'
import { IconButton } from '@muni/ui/icon-button'
import { Archive } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState, useTransition } from 'react'

import { ARCHIVE_IDLE, archiveRefused } from '@/lib/form'
import { useAfterWrite } from '@/lib/query/use-after-write'
import { archiveAction, previewArchive } from '@/server/actions/archive'

import { ConfirmDialog } from './confirm-dialog'
import { originOf } from './navigation-history'
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
  const afterWrite = useAfterWrite('archive')
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [impact, setImpact] = useState<ArchiveImpact | null | 'loading'>('loading')
  const [, startTransition] = useTransition()

  const show = () => {
    setOpen(true)
    setImpact('loading')
    startTransition(async () => {
      // Unreachable server: no preview, so nothing to confirm; the dialog says so.
      setImpact(await previewArchive(kind, id).catch(() => null))
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
        <IconButton ref={trigger} tone="serious" label={label} onClick={show}>
          <Archive aria-hidden />
        </IconButton>
      ) : (
        <Button ref={trigger} onClick={show}>
          <Archive aria-hidden />
          {t('archive.action')}
        </Button>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('archive.confirmTitle', { name })}
        description={t('archive.confirmBody')}
        confirmLabel={t('archive.confirm')}
        tone="danger"
        disabled={impact === 'loading' || impact === null || refused !== null}
        returnFocusTo={() => trigger.current}
        onConfirm={async () => {
          const next = await archiveAction(kind, id, then, ARCHIVE_IDLE)
          if (next.status === 'refused') return { kind: 'refused', message: refusal(next) }
          // Archived from its own page: back where that page was opened from, else the list.
          afterWrite(next.status === 'done' && next.href ? (originOf() ?? next.href) : undefined)
          return { kind: 'done', toast: { title: t('archive.archivedToast', { name }) } }
        }}
      >
        {impact === 'loading' && (
          <p className="text-sm text-fg-muted" role="status">
            {t('archive.checking')}
          </p>
        )}
        {impact === null && <Alert tone="danger">{t('common.failed')}</Alert>}
        {impact !== 'loading' && impact?.ok && impact.removesBookings > 0 && (
          <Alert tone="warning">
            {t('archive.removesBookings', { count: impact.removesBookings })}
          </Alert>
        )}
        {impact !== 'loading' && impact?.ok && impact.leaves && (
          <Alert tone="warning">{t('archive.leaves', { department: impact.leaves })}</Alert>
        )}
        {refused?.status === 'refused' && <Alert tone="danger">{refusal(refused)}</Alert>}
      </ConfirmDialog>
    </>
  )
}
