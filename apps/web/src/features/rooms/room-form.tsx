'use client'

import { CAPABILITIES, type Capability, ROOM_KINDS, type RoomKind } from '@muni/domain/enums'
import { FieldRow } from '@muni/ui/field'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  CheckboxGroupField,
  type FormHeading,
  FormShell,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/form/form-shell'
import type { FormState } from '@/lib/form'
import { roomSpec } from '@/lib/form-inputs'

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
  isNew?: boolean | undefined
}) {
  const tsave = useTranslations('forms.save')
  const t = useTranslations('rooms.form')
  const tp = useTranslations('forms.placeholders')
  const tk = useTranslations('status.roomKind')
  const tc = useTranslations('status.capability')
  // Seats are required unless the room is online (no seat limit).
  const [kind, setKind] = useState<string>(defaults.kind)
  return (
    <FormShell
      {...shell}
      spec={roomSpec}
      submitLabel={shell.isNew ? tsave('room') : tsave('changes')}
      savedMessage={shell.isNew ? tsave('roomCreated') : tsave('roomSaved')}
    >
      <TextField
        name="name"
        label={t('name')}
        required
        defaultValue={defaults.name}
        placeholder={tp('roomName')}
      />
      <FieldRow>
        <SelectField
          name="kind"
          label={t('kind')}
          required
          value={kind}
          onValueChange={setKind}
          options={ROOM_KINDS.map(k => ({ value: k, label: tk(k) }))}
        />
        <TextField
          name="capacity"
          label={t('capacity')}
          help={t('capacityHelp')}
          required={kind !== 'ONLINE'}
          inputMode="numeric"
          defaultValue={defaults.capacity ?? ''}
          placeholder={tp('capacity')}
        />
      </FieldRow>
      <CheckboxGroupField
        name="capabilities"
        label={t('capabilities')}
        options={CAPABILITIES.map(c => ({ value: c, label: tc(c) }))}
        defaultValue={defaults.capabilities}
      />
      <TextAreaField
        name="note"
        label={t('note')}
        defaultValue={defaults.note ?? undefined}
        placeholder={tp('note')}
      />
    </FormShell>
  )
}
