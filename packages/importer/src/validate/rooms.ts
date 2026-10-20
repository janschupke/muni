import type { RoomInput } from '@muni/domain/schemas'
import { fold } from '@muni/utils/text'

import type { ParsedRow, ReferenceSnapshot } from '../types'
import { Canonicalizer } from './canonical'
import {
  type Archived,
  archivedIssue,
  duplicateId,
  type Extra,
  finalize,
  firstRowByKey,
  normalized,
  usable,
} from './shared'

/**
 * Rooms: one row per name (spelling variants are the same room), spelled as the register
 * spells a room it already has ("Ucebna 1" updates "Učebna 1").
 */
export function validateRooms(
  rows: ParsedRow<RoomInput>[],
  { archived, reference }: { archived: Archived; reference: ReferenceSnapshot }
): ParsedRow<RoomInput>[] {
  const first = firstRowByKey(rows, d => fold(d.name))
  const spelling = new Canonicalizer(
    rows.filter(usable).map(r => r.base.data.name),
    reference.rooms
  )
  return rows.map(row => {
    const extra: Extra = []
    if (!usable(row)) return finalize(row, null, extra)
    const data = row.base.data
    const owner = duplicateId(extra, 'name', row, first, fold(data.name))
    if (archived.room(data.name)) extra.push(archivedIssue('name', data.name))
    const name = spelling.canonical(data.name)
    if (!owner) normalized(extra, 'name', data.name, name)
    return finalize<RoomInput>(row, { ...data, name }, extra)
  })
}
