import type { Archivable } from '@muni/domain/archive'

/**
 * Where each kind's list lives; its archived records are under `<list>/archived`. Completions
 * have no list of their own (each person's page lists theirs); theirs is /completions/archived.
 */
export const LIST_PATH: Record<Archivable, string> = {
  employee: '/employees',
  course: '/courses',
  session: '/sessions',
  completion: '/employees',
  department: '/departments',
  position: '/positions',
  room: '/rooms',
  provider: '/providers',
  user: '/users',
}

export const archivedListPath = (kind: Archivable) =>
  kind === 'completion' ? '/completions/archived' : `${LIST_PATH[kind]}/archived`

export const archivedRecordPath = (kind: Archivable, id: string) =>
  `${archivedListPath(kind)}/${encodeURIComponent(id)}`
