import { type RoomInput } from '@muni/domain/schemas'
import { cleanFreeText } from '@muni/utils/text'

import type { Tx } from '../client'
import { ACTIVE } from '../repositories/archive'
import {
  lockSessionWrites,
  newlyUnfit,
  roomFactsOf,
  roomFactsSelect,
} from '../repositories/session-fit'
import type { CommitResult } from './shared'
import { archivedOnly, CommitRefusedError, withoutArchived } from './shared'

export async function writeRooms(tx: Tx, all: RoomInput[]): Promise<CommitResult> {
  const { kept: records, skipped } = withoutArchived(all, [
    [
      await archivedOnly(
        tx,
        'room',
        'name',
        all.map(r => r.name)
      ),
      r => [r.name],
    ],
  ])
  // Room and session writes take turns (see lockSessionWrites): sessions planned meanwhile count.
  await lockSessionWrites(tx)
  let created = 0
  let updated = 0
  for (const record of records) {
    const data = {
      kind: record.kind,
      capacity: record.capacity,
      note: cleanFreeText(record.note),
    }
    const existing = await tx.room.findFirst({
      where: { name: record.name, ...ACTIVE },
      select: roomFactsSelect,
    })
    if (existing) {
      const before = roomFactsOf(existing)
      const unfit = await newlyUnfit(tx, {
        roomId: existing.id,
        room: { ...before, ...data, capabilities: record.capabilities ?? before.capabilities },
      })
      if (unfit.length > 0)
        throw new CommitRefusedError(all.indexOf(record), 'ROOM_UNFIT', record.name)
    }
    const room = existing
      ? await tx.room.update({ where: { id: existing.id }, data, select: { id: true } })
      : await tx.room.create({ data: { name: record.name, ...data }, select: { id: true } })
    if (existing) updated++
    else created++
    if (record.capabilities === null) continue
    await tx.roomCapability.deleteMany({ where: { roomId: room.id } })
    await tx.roomCapability.createMany({
      data: record.capabilities.map(capability => ({ roomId: room.id, capability })),
      skipDuplicates: true,
    })
  }
  return { created, updated, skipped }
}
