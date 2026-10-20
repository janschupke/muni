import * as z from 'zod'

import { ROOM_KINDS } from '../enums'
import { capabilities, optionalText, trimmed } from './fields'

export const roomSchema = z
  .object({
    name: trimmed(200),
    kind: z.enum(ROOM_KINDS),
    /** Seats; null = no fixed limit, which only an online room may have. */
    capacity: z.int().min(1).max(10_000).nullable(),
    /** null = leave the equipment as it is (a rooms file without that column); none for a new room. */
    capabilities: capabilities.nullable(),
    note: optionalText(2000),
  })
  .refine(r => r.kind === 'ONLINE' || r.capacity !== null, {
    path: ['capacity'],
    error: 'required',
  })
  // An online room has no seat limit: whatever was entered is dropped.
  .transform(r => (r.kind === 'ONLINE' ? { ...r, capacity: null } : r))
export type RoomInput = z.infer<typeof roomSchema>

/** The room form edits every field the import sets. */
export type RoomEdit = RoomInput
