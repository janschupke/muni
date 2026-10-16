import type { Capability, RoomKind } from '@muni/domain/enums'
import { roomSchema, type RoomInput } from '@muni/domain/schemas'
import { fold } from '@muni/utils/text'

import type { RowBuilder } from '../fields'
import type { RowMapResult } from '../types'

/** Names that mean "no physical room" in every export seen so far. */
const ONLINE_LOCATIONS = new Set(['online', 'on-line', 'webinar', 'e-learning'])

const KIND_BY_FOLD: Record<string, RoomKind> = {
  ucebna: 'CLASSROOM',
  trida: 'CLASSROOM',
  sal: 'CLASSROOM',
  aula: 'CLASSROOM',
  classroom: 'CLASSROOM',
  laborator: 'LAB',
  lab: 'LAB',
  online: 'ONLINE',
  virtualni: 'ONLINE',
  webinar: 'ONLINE',
  externi: 'EXTERNAL',
  external: 'EXTERNAL',
  venkovni: 'OUTDOOR',
  venku: 'OUTDOOR',
  outdoor: 'OUTDOOR',
}

const CAPABILITY_BY_FOLD: Record<string, Capability> = {
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
}

/** The kind a room gets when nothing says otherwise: online by its name, else a classroom. */
export const kindOfName = (name: string): RoomKind =>
  ONLINE_LOCATIONS.has(fold(name)) ? 'ONLINE' : 'CLASSROOM'

function kind(b: RowBuilder, name: string | null): RoomKind | null {
  const raw = b.cell('kind')
  if (raw === '') return name === null ? null : kindOfName(name)
  return KIND_BY_FOLD[fold(raw)] ?? b.error('kind', 'INVALID_VALUE', { raw })
}

/** `projektor; počítače` → PROJECTOR, COMPUTERS. Codes and Czech labels both work. */
function capabilities(b: RowBuilder): Capability[] | null {
  const raw = b.cell('capabilities')
  const found = new Set<Capability>()
  for (const part of raw.split(/[;,|]/)) {
    const key = fold(part).trim()
    if (key === '') continue
    const capability = CAPABILITY_BY_FOLD[key]
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
  return b.finish(roomSchema, {
    name,
    kind: roomKind,
    capacity: roomKind === 'ONLINE' && capacity === 0 ? null : capacity,
    capabilities: capabilities(b),
    note: b.text('note'),
  })
}
