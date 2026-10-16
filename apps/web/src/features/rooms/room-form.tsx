'use client'

import { CAPABILITIES, type Capability, ROOM_KINDS, type RoomKind } from '@muni/domain/enums'
import { FieldRow } from '@muni/ui/field'
import { useTranslations } from 'next-intl'

import {
  CheckboxGroupField,
  type FormHeading,
  FormShell,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/form/form-shell'
import type { FormState } from '@/lib/form'

export function RoomForm({
  defaults,
  ...shell
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>
  cancelHref: string
  heading: FormHeading
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
    <FormShell {...shell}>
      <TextField name="name" label={t('name')} required defaultValue={defaults.name} />
      <FieldRow>
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
        />
      </FieldRow>
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
