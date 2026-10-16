'use client'

import { CAPABILITIES, type Capability, ROOM_KINDS, type RoomKind } from '@muni/domain/enums'
import { useTranslations } from 'next-intl'

import {
  CheckboxGroupField,
  FormShell,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/form/form-shell'
import type { FormState } from '@/lib/form'

export function RoomForm({
  action,
  cancelHref,
  defaults,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>
  cancelHref: string
  defaults: {
    name: string
    kind: RoomKind
    capacity: number | null
    capabilities: readonly Capability[]
    note: string | null
  }
}) {
  const t = useTranslations('rooms.form')
  const tk = useTranslations('status.roomKind')
  const tc = useTranslations('status.capability')
  return (
    <FormShell action={action} cancelHref={cancelHref}>
      <TextField name="name" label={t('name')} required defaultValue={defaults.name} />
      <SelectField
        name="kind"
        label={t('kind')}
        required
        defaultValue={defaults.kind}
        options={ROOM_KINDS.map(k => ({ value: k, label: tk(k) }))}
      />
      <TextField
        name="capacity"
        label={t('capacity')}
        help={t('capacityHelp')}
        inputMode="numeric"
        defaultValue={defaults.capacity ?? ''}
        className="max-w-48"
      />
      <CheckboxGroupField
        name="capabilities"
        label={t('capabilities')}
        options={CAPABILITIES.map(c => ({ value: c, label: tc(c) }))}
        defaultValue={defaults.capabilities}
      />
      <TextAreaField name="note" label={t('note')} defaultValue={defaults.note ?? undefined} />
    </FormShell>
  )
}
