import type { Capability, RoomKind } from '@muni/domain/enums'
import { ROOM_KIND_WORDS, roomKindOfName } from '@muni/domain/rooms'
import { type RoomInput, roomSchema } from '@muni/domain/schemas'
import { fold } from '@muni/utils/text'

import type { RowMapResult } from '../types'
import type { RowBuilder } from './fields'

const CAPABILITY_BY_FOLD: ReadonlyMap<string, Capability> = new Map(
  Object.entries({
    projector: 'PROJECTOR',
    projektor: 'PROJECTOR',
    dataprojektor: 'PROJECTOR',
    computers: 'COMPUTERS',
    pocitace: 'COMPUTERS',
    pc: 'COMPUTERS',
    lab_equipment: 'LAB_EQUIPMENT',
    'laboratorni vybaveni': 'LAB_EQUIPMENT',
    laborator: 'LAB_EQUIPMENT',
    vehicle: 'VEHICLE',
    vozidlo: 'VEHICLE',
    auto: 'VEHICLE',
    practical_area: 'PRACTICAL_AREA',
    'prakticka plocha': 'PRACTICAL_AREA',
    'cvicna plocha': 'PRACTICAL_AREA',
    video_conference: 'VIDEO_CONFERENCE',
    videokonference: 'VIDEO_CONFERENCE',
    wheelchair_access: 'WHEELCHAIR_ACCESS',
    bezbarierovy: 'WHEELCHAIR_ACCESS',
    'bezbarierovy pristup': 'WHEELCHAIR_ACCESS',
  } satisfies Record<string, Capability>)
)

/** The kind column; blank means the kind the name implies. */
function kind(b: RowBuilder, name: string | null): RoomKind | null {
  const raw = b.cell('kind')
  if (raw === '') return name === null ? null : roomKindOfName(name)
  return ROOM_KIND_WORDS.get(fold(raw)) ?? b.error('kind', 'INVALID_VALUE', { raw })
}

/**
 * `projektor; počítače` → PROJECTOR, COMPUTERS. Codes (with `_`, spaces or hyphens) and
 * Czech labels both work.
 */
function capabilities(b: RowBuilder): Capability[] | null {
  const raw = b.cell('capabilities')
  const found = new Set<Capability>()
  for (const part of raw.split(/[;,|]/)) {
    const key = fold(part).trim()
    if (key === '') continue
    const capability =
      CAPABILITY_BY_FOLD.get(key) ?? CAPABILITY_BY_FOLD.get(key.replace(/[\s-]+/g, '_'))
    if (!capability) return b.error('capabilities', 'INVALID_VALUE', { raw: part.trim() })
    found.add(capability)
  }
  return [...found]
}

export function mapRoom(b: RowBuilder): RowMapResult<RoomInput> {
  const name = b.text('name')
  if (name === null) b.error('name', 'REQUIRED')
  const roomKind = kind(b, name)
  const capacity = b.count('capacity', { required: false })
  // Only an online room goes without a seat count.
  if (roomKind !== null && roomKind !== 'ONLINE' && capacity === null && b.cell('capacity') === '')
    b.error('capacity', 'REQUIRED')
  return b.finish(roomSchema, {
    name,
    kind: roomKind,
    // An online room has no seat limit, whatever the file says.
    capacity: roomKind === 'ONLINE' ? null : capacity,
    // A file without the column says nothing about equipment: the rooms keep theirs.
    capabilities: b.has('capabilities') ? capabilities(b) : null,
    note: b.text('note'),
  })
}
