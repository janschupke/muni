'use client'

import { Button } from '@muni/ui/button'
import { IconButton } from '@muni/ui/icon-button'
import { CalendarCheck, CalendarX } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { useAfterWrite } from '@/lib/query/use-after-write'
import {
  cancelSessionAction,
  reinstateSessionAction,
  type StatusOutcome,
} from '@/server/actions/sessions'

type Refusal = Extract<StatusOutcome, { ok: false }>['reason']

/**
 * Cancels a session still to start, or plans a cancelled one again, after asking (admins only;
 * the server checks again). Cancelling says what happens to the people booked on it, who stay
 * listed; reinstating checks the room and the people are still free then. `compact` makes the
 * cancel an icon button, for table rows.
 */
export function SessionStatusButton({
  act,
  externalId,
  name,
  named,
  compact = false,
}: {
  act: 'cancel' | 'reinstate'
  externalId: string
  /** What the session is called in labels and the question: "BOZP · 04.11.2026". */
  name: string
  /** People booked by name, whom cancelling leaves without the training. */
  named: number
  compact?: boolean | undefined
}) {
  const t = useTranslations(act === 'cancel' ? 'sessions.cancel' : 'sessions.reinstate')
  const refusal = useStatusRefusal(act)
  const afterWrite = useAfterWrite('session')
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const show = () => {
    setOpen(true)
  }
  const Icon = act === 'cancel' ? CalendarX : CalendarCheck
  return (
    <>
      {compact ? (
        <IconButton ref={trigger} tone="danger" label={t('actionLabel', { name })} onClick={show}>
          <Icon aria-hidden />
        </IconButton>
      ) : (
        <Button
          ref={trigger}
          variant={act === 'cancel' ? 'destructive' : 'secondary'}
          onClick={show}
        >
          <Icon aria-hidden />
          {t('action')}
        </Button>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('title', { name })}
        confirmLabel={t('confirm')}
        cancelLabel={t('keep')}
        tone={act === 'cancel' ? 'danger' : 'primary'}
        returnFocusTo={() => trigger.current}
        onConfirm={async () => {
          const outcome = await (act === 'cancel' ? cancelSessionAction : reinstateSessionAction)(
            externalId
          )
          if (!outcome.ok) return { kind: 'refused', message: refusal(outcome.reason) }
          afterWrite()
          return { kind: 'done', toast: { title: t('done', { name }) } }
        }}
      >
        {act === 'cancel' ? (
          <CancelBody named={named} />
        ) : (
          <p className="text-sm text-fg-muted">{t('body')}</p>
        )}
      </ConfirmDialog>
    </>
  )
}

function CancelBody({ named }: { named: number }) {
  const t = useTranslations('sessions.cancel')
  return (
    <>
      <p className="text-sm text-fg-muted">{t('body', { count: named })}</p>
      <p className="text-sm text-fg-muted">{t('after')}</p>
    </>
  )
}

/** Why the session's status did not change, as a sentence. */
function useStatusRefusal(act: 'cancel' | 'reinstate') {
  const t = useTranslations(act === 'cancel' ? 'sessions.cancel' : 'sessions.reinstate')
  const errors = useTranslations('forms.errors')
  const reasons = useTranslations('advisor.outcome.reasons')
  return (reason: Refusal): string => {
    switch (reason) {
      case 'UNCHANGED':
      case 'STARTED':
        return t(`refused.${reason}`)
      case 'NOT_FOUND':
        return reasons('SESSION_NOT_FOUND')
      case 'unauthorized':
      case 'rate_limited':
      case 'invalid':
      case 'failed':
        return reasons(reason)
      default:
        // What keeps it from being planned there now: the room, its seats, its people.
        return errors(reason.toLowerCase() as Lowercase<typeof reason>)
    }
  }
}
