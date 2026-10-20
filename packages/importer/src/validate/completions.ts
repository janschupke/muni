import type { CompletionInput } from '@muni/domain/schemas'
import { addMonths } from '@muni/utils/dates'
import { fold } from '@muni/utils/text'

import type { ParsedRow, ReferenceSnapshot } from '../types'
import { Canonicalizer } from './canonical'
import {
  type Archived,
  archivedIssue,
  checkRef,
  creations,
  duplicateId,
  type Extra,
  finalize,
  firstRowByKey,
  hasError,
  issue,
  normalized,
  suggestedCode,
  usable,
} from './shared'

/** `"Novotny Adam"` matches `"Novotný Adam"` and `"Adam Novotný"`. */
function sameName(given: string, expected: string): boolean {
  const a = fold(given)
  const b = fold(expected)
  return a === b || a === b.split(' ').reverse().join(' ')
}

/**
 * Completions: one row per ID, of a person and a course the register or the import has
 * (a remapped duplicate person's go to the one who stays), valid for the course's validity
 * (derived when missing), delivered by a provider spelled as the register spells it.
 */
export function validateCompletions(
  rows: ParsedRow<CompletionInput>[],
  {
    archived,
    reference,
    people,
    validity,
  }: {
    archived: Archived
    reference: ReferenceSnapshot
    /** Who the rows may name, by ID: aliases of refused duplicates, IDs and names. */
    people: {
      aliases: ReadonlyMap<string, string>
      ids: ReadonlySet<string>
      names: ReadonlyMap<string, string>
      /** The day each person who left the batch's people did. */
      leftOn: ReadonlyMap<string, string>
    }
    /** Every course's validity in months, by code; null never expires. */
    validity: ReadonlyMap<string, number | null>
  }
): ParsedRow<CompletionInput>[] {
  const first = firstRowByKey(rows, d => d.externalId)
  const providers = new Canonicalizer(
    rows.filter(usable).flatMap(r => (r.base.data.provider ? [r.base.data.provider] : [])),
    reference.providers
  )
  const newProvider = creations(reference.providers, v => providers.keyOf(v))
  /** The same training of the same person on the same day at the same price: one record. */
  const records = new Map<string, ParsedRow<CompletionInput>>()
  return rows.map(row => {
    const extra: Extra = []
    if (!usable(row)) return finalize(row, null, extra)
    let data = row.base.data

    duplicateId(extra, 'externalId', row, first, data.externalId)
    if (archived.completion(data.externalId))
      extra.push(archivedIssue('externalId', data.externalId))

    const survivor = people.aliases.get(data.employeeExternalId)
    if (survivor) {
      extra.push(
        issue('employeeExternalId', 'EMPLOYEE_REMAPPED', 'warning', {
          raw: data.employeeExternalId,
          value: survivor,
        })
      )
      data = { ...data, employeeExternalId: survivor }
    }
    const person = checkRef(extra, 'employeeExternalId', data.employeeExternalId, {
      archived: archived.employee(data.employeeExternalId),
      known: people.ids.has(data.employeeExternalId),
      unknown: ['EMPLOYEE_NOT_FOUND', 'error'],
    })
    if (person) {
      const left = people.leftOn.get(data.employeeExternalId)
      if (left !== undefined && data.completedOn > left)
        extra.push(
          issue('completedOn', 'COMPLETED_AFTER_LEAVING', 'warning', {
            value: data.completedOn,
            leftOn: left,
          })
        )
      const expected = people.names.get(data.employeeExternalId)
      const given = row.raw['employeeName']?.trim() ?? ''
      if (expected && given !== '' && !sameName(given, expected))
        extra.push(
          issue('employeeName', 'NAME_MISMATCH', 'warning', { raw: given, value: expected })
        )
    }

    const course = checkRef(extra, 'courseCode', data.courseCode, {
      archived: archived.course(data.courseCode),
      known: validity.has(data.courseCode),
      unknown: ['COURSE_NOT_FOUND', 'error'],
      hint: () => suggestedCode(data.courseCode, validity.keys()),
    })
    const months = course ? (validity.get(data.courseCode) ?? null) : null
    if (months !== null) {
      const derived = addMonths(data.completedOn, months)
      if (data.validUntil === null) {
        extra.push(issue('validUntil', 'VALIDITY_DERIVED', 'warning', { value: derived }))
        data = { ...data, validUntil: derived }
      } else if (data.validUntil !== derived) {
        extra.push(
          issue('validUntil', 'VALIDITY_MISMATCH', 'warning', {
            raw: data.validUntil,
            value: derived,
          })
        )
      }
    }

    // The same record again under another ID (a re-export): refused like a repeated ID.
    if (!hasError(row, extra)) {
      const key = [
        data.employeeExternalId,
        data.courseCode,
        data.completedOn,
        data.price ?? '',
      ].join('|')
      const owner = records.get(key)
      if (owner?.base.data)
        extra.push(
          issue('row', 'DUPLICATE_RECORD', 'error', {
            otherId: owner.base.data.externalId,
            firstRow: owner.rowNumber,
          })
        )
      else records.set(key, row)
    }

    if (archived.provider(data.provider)) {
      extra.push(archivedIssue('provider', data.provider ?? ''))
    } else if (data.provider) {
      const provider = providers.canonical(data.provider)
      normalized(extra, 'provider', data.provider, provider)
      data = { ...data, provider }
      if (!hasError(row, extra)) extra.push(...newProvider('provider', provider))
    }
    return finalize<CompletionInput>(row, data, extra)
  })
}
