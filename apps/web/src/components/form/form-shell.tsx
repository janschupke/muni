'use client'

import { Alert } from '@muni/ui/alert'
import { Button, CancelButton } from '@muni/ui/button'
import { Card, CardBody } from '@muni/ui/card'
import { PageHeader } from '@muni/ui/page-header'
import { Save, X } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  type ReactNode,
  startTransition,
  type SubmitEvent,
  useActionState,
  useId,
  useRef,
  useState,
} from 'react'

import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { useOrigin } from '@/components/navigation/navigation-history'
import { type FormState, IDLE } from '@/lib/form/form'
import type { FormSpec } from '@/lib/form/form-inputs'
import type { WriteKind } from '@/lib/query/invalidation'
import { useWhenWritten } from '@/lib/query/use-after-write'

import { type ClientError, FormContext } from './form-context'
import { useFormTracking } from './use-form-tracking'

/**
 * A save that does more than its form shows (cancelling a session with people on it): the
 * form asks before sending. `body` says exactly what will happen; `confirmLabel` names it.
 */
export interface SaveConfirmation {
  title: string
  body: ReactNode
  confirmLabel: string
  tone?: 'primary' | 'danger' | undefined
}

/** What every form page's heading row says: the title, and where the back link goes. */
export interface FormHeading {
  title: string
  eyebrow?: ReactNode | undefined
  description?: ReactNode | undefined
}

/**
 * A form page bound to a server action. The page's heading row is part of the form: Cancel
 * and Save sit on its right, the fields below in one full-width card.
 *
 * The form checks itself as the user types, with the same reader and schema the action runs
 * on save (`spec`). A field shows its error once it was left (touched), at once when a
 * required field is emptied, and every error after a save was tried; once shown, an error
 * follows each keystroke. A form with errors is not sent: the first wrong field gets the
 * focus. `clientErrors` are checks the form makes itself (a room too small), shown at once.
 * A server error stays on its field until the field changes. An edit form cannot be saved
 * before something changed. The first field has the focus when the page opens.
 */
export function FormShell({
  action,
  spec,
  isNew = false,
  cancelHref,
  heading,
  clientErrors: live,
  submitLabel,
  savedMessage,
  writes,
  confirm,
  children,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>
  spec: FormSpec
  /** A new record: savable as it is. An edit needs a change first. */
  isNew?: boolean | undefined
  cancelHref: string
  heading: FormHeading
  clientErrors?: Partial<Record<string, ClientError>> | undefined
  /** What the button does: "Schedule session", "Record completion", "Save changes". */
  submitLabel: string
  /** The toast once it is saved: "Course created". */
  savedMessage: string
  /** What saving it changes, so the pages that show it read afresh. */
  writes: WriteKind
  /** Asks before a save that does more than it shows; null when this one needs no asking. */
  confirm?: ((form: FormData) => SaveConfirmation | null) | undefined
  children: ReactNode
}) {
  const t = useTranslations()
  const formRef = useRef<HTMLFormElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const [state, formAction, pending] = useActionState(action, IDLE)
  // Saved or cancelled, the form goes back where it was opened from; opened directly, a
  // save goes to the record and a cancel to its parent page.
  const origin = useOrigin()
  useWhenWritten(
    writes,
    state,
    state.status === 'saved',
    state.status === 'saved' ? (origin ?? state.href) : undefined,
    { title: savedMessage }
  )
  const [asking, setAsking] = useState<{ data: FormData; question: SaveConfirmation } | null>(null)
  // Saved: the next page is on its way; nothing more to send from here.
  const busy = pending || state.status === 'saved'

  const form = useFormTracking(formRef, spec, live, state)

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    // Sent by hand, so React does not reset the fields after the action: a refused save
    // keeps everything the user typed.
    event.preventDefault()
    const element = event.currentTarget
    const data = new FormData(element)
    if (!form.tried(element, data)) return
    const question = confirm?.(data) ?? null
    if (question) {
      setAsking({ data, question })
      return
    }
    send(element, data)
  }

  const send = (element: HTMLFormElement, data: FormData) => {
    form.sending(element)
    startTransition(() => {
      formAction(data)
    })
  }

  const hasErrors =
    state.status === 'error' && (!!state.formError || Object.keys(state.fieldErrors).length > 0)
  return (
    <form
      ref={formRef}
      onSubmit={submit}
      onChange={form.changed}
      onBlur={form.blurred}
      className="flex flex-col gap-4"
      noValidate
    >
      <PageHeader
        title={heading.title}
        eyebrow={heading.eyebrow}
        description={heading.description}
        actions={
          <>
            <CancelButton asChild>
              <Link href={origin ?? cancelHref}>
                <X aria-hidden />
                {t('common.cancel')}
              </Link>
            </CancelButton>
            <Button
              ref={submitRef}
              type="submit"
              variant="primary"
              disabled={busy || (!isNew && form.clean)}
            >
              <Save aria-hidden />
              {busy ? t('common.saving') : submitLabel}
            </Button>
          </>
        }
      />
      {hasErrors && (
        <Alert tone="danger">
          {t(state.formError ? `forms.errors.${state.formError}` : 'forms.fixBelow')}
        </Alert>
      )}
      <Card>
        <CardBody className="flex flex-col gap-6">
          <FormContext value={form.context}>{children}</FormContext>
        </CardBody>
      </Card>
      {asking && (
        <ConfirmDialog
          open
          onOpenChange={open => {
            if (!open) setAsking(null)
          }}
          title={asking.question.title}
          confirmLabel={asking.question.confirmLabel}
          cancelLabel={t('common.keepEditing')}
          tone={asking.question.tone}
          returnFocusTo={() => submitRef.current}
          onConfirm={() => {
            const element = formRef.current
            if (element) send(element, asking.data)
            return Promise.resolve({ kind: 'go' })
          }}
        >
          <div className="flex flex-col gap-3 text-sm">{asking.question.body}</div>
        </ConfirmDialog>
      )}
    </form>
  )
}

/** A titled group of fields inside a form's card, set off from the one above. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string | undefined
  children: ReactNode
}) {
  const id = useId()
  // A group named by its heading: a real h2, so heading navigation runs through a long form.
  return (
    <div
      role="group"
      aria-labelledby={id}
      className="flex flex-col gap-4 border-t border-border-muted pt-5 first:border-t-0 first:pt-0"
    >
      <div>
        <h2 id={id} className="text-sm font-semibold text-fg">
          {title}
        </h2>
        {description && <p className="text-xs text-fg-muted">{description}</p>}
      </div>
      {children}
    </div>
  )
}
