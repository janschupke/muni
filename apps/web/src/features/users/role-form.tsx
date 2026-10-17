'use client'

import { type Role, ROLES } from '@muni/domain/enums'
import { Button } from '@muni/ui/button'
import { Field } from '@muni/ui/field'
import { Select } from '@muni/ui/select'
import { Save } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { type FormState, IDLE } from '@/lib/form'
import { useAfterWrite } from '@/lib/query/use-after-write'

/**
 * A user's role, changed by an admin (not their own: `disabled`). The change is confirmed
 * first, saying what the new role can do, and what is lost when an admin stops being one.
 */
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
  const afterWrite = useAfterWrite()
  const trigger = useRef<HTMLButtonElement>(null)
  const [chosen, setChosen] = useState<Role>(role)
  const [open, setOpen] = useState(false)
  const roleName = t(`status.role.${chosen}`)
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field
        label={t('users.detail.role')}
        required
        help={disabled ? t('forms.errors.own_role') : undefined}
        className="min-w-48 flex-1"
      >
        {control => (
          <Select
            {...control}
            value={chosen}
            onValueChange={value => {
              setChosen(value as Role)
            }}
            disabled={disabled}
            options={ROLES.map(r => ({ value: r, label: t(`status.role.${r}`) }))}
          />
        )}
      </Field>
      <Button
        ref={trigger}
        variant="primary"
        disabled={disabled || chosen === role}
        onClick={() => {
          setOpen(true)
        }}
      >
        <Save aria-hidden />
        {t('users.detail.saveRole')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('users.detail.roleTitle', { role: roleName })}
        confirmLabel={t('users.detail.saveRole')}
        tone={role === 'ADMIN' ? 'danger' : 'primary'}
        returnFocusTo={() => trigger.current}
        onConfirm={async () => {
          const form = new FormData()
          form.set('role', chosen)
          const state = await action(IDLE, form)
          if (state.status === 'error') {
            const key = state.formError ?? state.fieldErrors['role']
            return {
              kind: 'refused',
              message: key ? t(`forms.errors.${key}`) : t('common.failed'),
            }
          }
          afterWrite()
          return {
            kind: 'done',
            toast: { title: t('users.detail.roleChanged', { role: roleName }) },
          }
        }}
      >
        <div className="flex flex-col gap-2 text-sm">
          <p>{t(`users.detail.roleGrants.${chosen}`)}</p>
          {role === 'ADMIN' && <p className="text-danger-fg">{t('users.detail.roleLosesAdmin')}</p>}
          <p className="text-fg-muted">{t('users.detail.roleApplies')}</p>
        </div>
      </ConfirmDialog>
    </div>
  )
}
