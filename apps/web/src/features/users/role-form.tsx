'use client'

import { type Role, ROLES } from '@muni/domain/enums'
import { Alert } from '@muni/ui/alert'
import { Button } from '@muni/ui/button'
import { Field } from '@muni/ui/field'
import { Select } from '@muni/ui/select'
import { Save } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useActionState } from 'react'

import { type FormState, IDLE } from '@/lib/form'
import { useWhenWritten } from '@/lib/query/use-after-write'

/** A user's role, changed by an admin (not their own: `disabled`). */
export function RoleForm({
  action,
  role,
  disabled,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>
  role: Role
  disabled: boolean
}) {
  const t = useTranslations()
  const [state, formAction, pending] = useActionState(action, IDLE)
  useWhenWritten(state, state.status === 'saved', state.status === 'saved' ? state.href : undefined)
  const error = state.status === 'error' ? state.fieldErrors['role'] : undefined
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.status === 'error' && state.formError && (
        <Alert tone="danger">{t(`forms.errors.${state.formError}`)}</Alert>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Field
          label={t('users.detail.role')}
          required
          help={disabled ? t('forms.errors.own_role') : undefined}
          error={error ? t(`forms.errors.${error}`) : undefined}
          className="min-w-48 flex-1"
        >
          {control => (
            <Select
              {...control}
              name="role"
              defaultValue={role}
              disabled={disabled}
              options={ROLES.map(r => ({ value: r, label: t(`status.role.${r}`) }))}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" disabled={disabled || pending}>
          <Save aria-hidden />
          {t('users.detail.saveRole')}
        </Button>
      </div>
    </form>
  )
}
