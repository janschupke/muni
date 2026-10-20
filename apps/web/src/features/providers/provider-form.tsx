'use client'

import { FieldRow } from '@muni/ui/field'
import { currencySymbol, formatAmount } from '@muni/utils/format'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/form/fields'
import type { FormProps } from '@/components/form/form-props'
import { FormSection, FormShell } from '@/components/form/form-shell'
import { RowsField } from '@/components/form/rows-field'
import { providerSpec } from '@/lib/form/form-inputs'

export interface ProviderDefaults {
  name: string
  companyId: string | null
  email: string | null
  phone: string | null
  website: string | null
  note: string | null
  isDefault: boolean
  offerings: readonly { courseId: string; price: number }[]
}

/** A course the provider can be given to offer. */
export interface CourseChoice {
  id: string
  code: string
  name: string
}

let nextRow = 0
const rowKey = () => `row-${String(nextRow++)}`

/**
 * A provider: its details, whether it holds imported sessions that name no provider, and the
 * courses it offers, each once, at a price per person. A course already listed is not offered
 * again in another row. A new price applies to sessions scheduled from then on.
 */
export function ProviderForm({
  defaults,
  courses,
  ...shell
}: FormProps & {
  defaults: ProviderDefaults
  courses: readonly CourseChoice[]
}) {
  const tsave = useTranslations('forms.save')
  const t = useTranslations('forms.provider')
  const tp = useTranslations('forms.placeholders')
  // A new row starts empty: its course and price are for the user to set.
  const [rows, setRows] = useState<{ key: string; courseId: string; price: number | null }[]>(() =>
    defaults.offerings.map(o => ({ key: rowKey(), courseId: o.courseId, price: o.price }))
  )
  const nameOf = (courseId: string) => {
    const course = courses.find(c => c.id === courseId)
    return course ? `${course.code} · ${course.name}` : t('newOffering')
  }
  const listed = new Set(rows.map(r => r.courseId))
  return (
    <FormShell
      writes="provider"
      {...shell}
      spec={providerSpec}
      submitLabel={shell.isNew ? tsave('provider') : tsave('changes')}
      savedMessage={shell.isNew ? tsave('providerCreated') : tsave('providerSaved')}
    >
      <TextField
        name="name"
        label={t('name')}
        help={defaults.name ? t('nameHelp') : undefined}
        required
        defaultValue={defaults.name}
        placeholder={tp('providerName')}
      />
      <FieldRow>
        <TextField
          name="companyId"
          label={t('companyId')}
          help={t('companyIdHelp')}
          inputMode="numeric"
          autoComplete="off"
          defaultValue={defaults.companyId ?? ''}
          placeholder={tp('companyId')}
        />
        <TextField
          name="phone"
          type="tel"
          label={t('phone')}
          autoComplete="off"
          defaultValue={defaults.phone ?? ''}
          placeholder={tp('phone')}
        />
      </FieldRow>
      <FieldRow>
        <TextField
          name="email"
          type="email"
          label={t('email')}
          autoComplete="off"
          defaultValue={defaults.email ?? ''}
          placeholder={tp('email')}
        />
        <TextField
          name="website"
          inputMode="url"
          label={t('website')}
          help={t('websiteHelp')}
          autoComplete="off"
          defaultValue={defaults.website ?? ''}
          placeholder={tp('website')}
        />
      </FieldRow>
      <TextAreaField
        name="note"
        label={t('note')}
        defaultValue={defaults.note ?? undefined}
        placeholder={tp('note')}
      />
      <FormSection title={t('offerings')} description={t('offeringsHelp')}>
        <RowsField
          name="offerings"
          legend={t('offeredCourses')}
          columns={[t('course'), t('price', { currency: currencySymbol() })]}
          addLabel={t('addOffering')}
          empty={t('noOfferings')}
          canAdd={listed.size < courses.length}
          onAdd={() => {
            setRows(current => [...current, { key: rowKey(), courseId: '', price: null }])
          }}
          onRemove={key => {
            setRows(current => current.filter(r => r.key !== key))
          }}
          items={rows.map((row, i) => ({
            key: row.key,
            removeLabel: t('removeOffering', { course: nameOf(row.courseId) }),
            cells: (
              <>
                <SelectField
                  name={`offerings.${String(i)}.courseId`}
                  label={t('courseOf', { row: i + 1 })}
                  hideLabel
                  required
                  value={row.courseId}
                  onValueChange={courseId => {
                    setRows(current =>
                      current.map(r => (r.key === row.key ? { ...r, courseId } : r))
                    )
                  }}
                  // A course another row lists is not offered twice.
                  options={courses
                    .filter(c => c.id === row.courseId || !listed.has(c.id))
                    .map(c => ({ value: c.id, label: `${c.code} · ${c.name}` }))}
                />
                <TextField
                  name={`offerings.${String(i)}.price`}
                  label={t('priceOf', { course: nameOf(row.courseId) })}
                  hideLabel
                  required
                  inputMode="decimal"
                  defaultValue={formatAmount(row.price)}
                  placeholder={tp('price')}
                />
              </>
            ),
          }))}
        />
        <CheckboxField
          name="isDefault"
          label={t('isDefault')}
          help={t('isDefaultHelp')}
          defaultChecked={defaults.isDefault}
        />
      </FormSection>
    </FormShell>
  )
}
