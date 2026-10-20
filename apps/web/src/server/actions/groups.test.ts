import { saveDepartment, savePosition } from '@muni/db/repositories'
import { describe, expect, it, vi } from 'vitest'

import { form, idle, redirectOf, serverSession } from '@/test/server'

import { saveDepartmentAction, savePositionAction } from './groups'

vi.mock('@clerk/nextjs/server', () => ({
  auth: Object.assign(vi.fn(), { protect: vi.fn() }),
  clerkClient: vi.fn(),
  clerkMiddleware: vi.fn((handler: unknown) => handler),
}))

vi.mock('@muni/db/repositories', async () =>
  (await import('@/test/repositories-mock')).repositoriesMock()
)

vi.mock('@muni/db/client', () => ({ getDb: () => 'db' }))

vi.mock('@muni/db/reference', () => ({ findArchivedKeys: vi.fn() }))

vi.mock('@muni/db/writer', async importOriginal => ({
  ...(await importOriginal<object>()),
  commitChunk: vi.fn(),
}))

serverSession()

describe('department and position actions', () => {
  it('save a department with its head and show it, saying why not', async () => {
    vi.mocked(saveDepartment).mockResolvedValueOnce({ ok: true, id: 'dep_new' })
    expect(await redirectOf(saveDepartmentAction(null, idle, form({ name: 'Nový' })))).toBe(
      '/departments/dep_new'
    )
    expect(saveDepartment).toHaveBeenLastCalledWith(null, { name: 'Nový', headId: null })
    vi.mocked(saveDepartment).mockResolvedValueOnce({ ok: true, id: 'dep_lab' })
    await redirectOf(
      saveDepartmentAction('dep_lab', idle, form({ name: 'Laboratoře', headId: 'emp_1' }))
    )
    expect(saveDepartment).toHaveBeenLastCalledWith('dep_lab', {
      name: 'Laboratoře',
      headId: 'emp_1',
    })
    for (const [problem, key] of [
      [{ field: 'name', reason: 'taken' }, 'taken'],
      [{ field: 'headId', reason: 'not_a_member' }, 'not_a_member'],
    ] as const) {
      vi.mocked(saveDepartment).mockResolvedValueOnce({ ok: false, ...problem })
      expect(await saveDepartmentAction('dep_lab', idle, form({ name: 'X' }))).toEqual({
        status: 'error',
        fieldErrors: { [problem.field]: key },
      })
    }
    expect(await saveDepartmentAction('dep_lab', idle, form({ name: '' }))).toMatchObject({
      fieldErrors: { name: 'required' },
    })
    vi.mocked(saveDepartment).mockRejectedValueOnce({ code: 'P2025' })
    expect(await saveDepartmentAction('gone', idle, form({ name: 'X' }))).toMatchObject({
      formError: 'not_found',
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(saveDepartment).mockRejectedValueOnce(new Error('down'))
    expect(await saveDepartmentAction(null, idle, form({ name: 'X' }))).toMatchObject({
      formError: 'generic',
    })
  })

  it('save a position with its departments, saying how many people hold it elsewhere', async () => {
    vi.mocked(savePosition).mockResolvedValueOnce({ ok: true, id: 'pos_1' })
    const data = form({ name: 'Referent' })
    data.append('departmentIds', 'dep_lab')
    data.append('departmentIds', 'dep_lib')
    expect(await redirectOf(savePositionAction('pos_1', idle, data))).toBe('/positions/pos_1')
    expect(savePosition).toHaveBeenLastCalledWith('pos_1', {
      name: 'Referent',
      departmentIds: ['dep_lab', 'dep_lib'],
    })
    vi.mocked(savePosition).mockResolvedValueOnce({
      ok: false,
      field: 'departmentIds',
      reason: 'in_use',
      count: 3,
    })
    expect(await savePositionAction('pos_1', idle, form({ name: 'Referent' }))).toEqual({
      status: 'error',
      fieldErrors: { departmentIds: 'in_use' },
      values: { departmentIds: { count: 3 } },
    })
    vi.mocked(savePosition).mockResolvedValueOnce({
      ok: false,
      field: 'departmentIds',
      reason: 'not_found',
    })
    expect(await savePositionAction('pos_1', idle, form({ name: 'Referent' }))).toEqual({
      status: 'error',
      fieldErrors: { departmentIds: 'unavailable' },
    })
  })
})
