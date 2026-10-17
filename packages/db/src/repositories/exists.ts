import type { Archivable } from '@muni/domain/archive'

import { ACTIVE } from './archive'
import { dbOf, type RepoOptions } from './context'

/**
 * Whether a page's record is there, before the page sends its data on to the browser: a
 * missing one answers 404. Active records are found by the key their address carries (an
 * external ID, a course code, an id); archived ones by id.
 */
export async function recordExists(
  kind: Archivable,
  key: string,
  { archived = false, ...options }: RepoOptions & { archived?: boolean } = {}
): Promise<boolean> {
  const db = dbOf(options)
  if (archived) {
    const where = { id: key, archivedAt: { not: null } }
    const found = await (
      {
        employee: () => db.employee.count({ where }),
        course: () => db.course.count({ where }),
        session: () => db.courseSession.count({ where }),
        completion: () => db.courseCompletion.count({ where }),
        department: () => db.department.count({ where }),
        position: () => db.position.count({ where }),
        room: () => db.room.count({ where }),
        provider: () => db.provider.count({ where }),
        user: () => db.user.count({ where }),
      } satisfies Record<Archivable, () => Promise<number>>
    )[kind]()
    return found > 0
  }
  const found = await (
    {
      employee: () => db.employee.count({ where: { externalId: key, ...ACTIVE } }),
      course: () => db.course.count({ where: { code: key, ...ACTIVE } }),
      session: () => db.courseSession.count({ where: { externalId: key, ...ACTIVE } }),
      completion: () => db.courseCompletion.count({ where: { id: key, ...ACTIVE } }),
      department: () => db.department.count({ where: { id: key, ...ACTIVE } }),
      position: () => db.position.count({ where: { id: key, ...ACTIVE } }),
      room: () => db.room.count({ where: { id: key, ...ACTIVE } }),
      provider: () => db.provider.count({ where: { id: key, ...ACTIVE } }),
      user: () => db.user.count({ where: { id: key, ...ACTIVE } }),
    } satisfies Record<Archivable, () => Promise<number>>
  )[kind]()
  return found > 0
}
