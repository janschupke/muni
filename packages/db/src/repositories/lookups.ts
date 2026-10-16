import { dbOf, type RepoOptions } from './context'

export async function listDepartments(options?: RepoOptions): Promise<string[]> {
  const rows = await dbOf(options).department.findMany({
    select: { name: true },
    orderBy: { name: 'asc' },
  })
  return rows.map(r => r.name)
}

export async function listPositions(options?: RepoOptions): Promise<string[]> {
  const rows = await dbOf(options).position.findMany({
    select: { name: true },
    orderBy: { name: 'asc' },
  })
  return rows.map(r => r.name)
}

export async function listProviders(options?: RepoOptions): Promise<string[]> {
  const rows = await dbOf(options).provider.findMany({
    select: { name: true },
    orderBy: { name: 'asc' },
  })
  return rows.map(r => r.name)
}
