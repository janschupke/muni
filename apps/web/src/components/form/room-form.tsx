'use client'

import { CAPABILITIES, type Capability, ROOM_KINDS, type RoomKind } from '@muni/domain/enums'
import { FieldRow } from '@muni/ui/field'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { roomSpec } from '@/lib/form-inputs'

import type { FormProps } from './form-props'
import { CheckboxGroupField, FormShell, SelectField, TextAreaField, TextField } from './form-shell'

/**
 * A room: its name, kind, seats and equipment. An online room has no seat limit, so it has no
 * seats to set; every other room needs them, and sessions must fit in them.
 */
export function RoomForm({
  defaults,
  ...shell
}: FormProps & {
  defaults: {
    name: string
    kind: RoomKind
    capacity: number | null
    capabilities: readonly Capability[]
    note: string | null
  }
}) {
  const tsave = useTranslations('forms.save')
  const t = useTranslations('forms.room')
  const tp = useTranslations('forms.placeholders')
  const tk = useTranslations('status.roomKind')
  const tc = useTranslations('status.capability')
  const [kind, setKind] = useState<string>(defaults.kind)
  return (
    <FormShell
      writes="room"
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
        {kind !== 'ONLINE' && (
          <TextField
            name="capacity"
            label={t('capacity')}
            help={t('capacityHelp')}
            required
            inputMode="numeric"
            defaultValue={defaults.capacity ?? ''}
            placeholder={tp('capacity')}
          />
        )}
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
