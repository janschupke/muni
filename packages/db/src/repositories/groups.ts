import { type GroupInput, groupSchema } from '@muni/domain/schemas'

import { ACTIVE } from './archive'
import { dbOf, type RepoOptions } from './context'

// Departments and positions as records: created and renamed here (imports and the employee
// form only ever point to existing ones). Archiving is in archiving.ts.

export type GroupKind = 'department' | 'position'

type GroupWrite = { ok: true; id: string } | { ok: false; taken: 'name' }

interface Delegate {
  create(args: object): Promise<{ id: string }>
  update(args: object): Promise<{ id: string }>
  findFirst(args: object): Promise<{ id: string; name: string } | null>
  findMany(args: object): Promise<{ id: string; name: string }[]>
}
const groups = (options: RepoOptions | undefined, kind: GroupKind) => {
  const db = dbOf(options)
  return (kind === 'department' ? db.department : db.position) as unknown as Delegate
}

async function writeGroup(
  kind: GroupKind,
  id: string | null,
  input: GroupInput,
  options: RepoOptions | undefined
): Promise<GroupWrite> {
  const { name } = groupSchema.parse(input)
  try {
    const saved = id
      ? await groups(options, kind).update({
          where: { id, ...ACTIVE },
          data: { name },
          select: { id: true },
        })
      : await groups(options, kind).create({ data: { name }, select: { id: true } })
    return { ok: true, id: saved.id }
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 'P2002') return { ok: false, taken: 'name' }
    throw error
  }
}

/** A new department or position; its name must not be taken by an active one. */
export const createGroup = (kind: GroupKind, input: GroupInput, options?: RepoOptions) =>
  writeGroup(kind, null, input, options)

/** Renames a department or position everywhere it shows. An unknown or archived id throws P2025. */
export const renameGroup = (
  kind: GroupKind,
  id: string,
  input: GroupInput,
  options?: RepoOptions
) => writeGroup(kind, id, input, options)

export function getGroupForEdit(kind: GroupKind, id: string, options?: RepoOptions) {
  return groups(options, kind).findFirst({
    where: { id, ...ACTIVE },
    select: { id: true, name: true },
  })
}

/** Every active department or position, for pickers. */
export function listGroupOptions(kind: GroupKind, options?: RepoOptions) {
  return groups(options, kind).findMany({
    where: ACTIVE,
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}
