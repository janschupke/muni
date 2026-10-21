// @vitest-environment jsdom
import { getDb } from '@muni/db/client'
import { loadReferenceSnapshot } from '@muni/db/reference'
import {
  getComplianceMatrix,
  getCourse,
  getCourseForEdit,
  listCourses,
} from '@muni/db/repositories'
import { EMPTY_REFERENCE } from '@muni/importer'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requireAdminPage } from '@/server/auth'
import { signInAs } from '@/test/auth'
import { counts, courseDetail, courseForEdit, courseRow, matrix } from '@/test/fixtures'
import { renderServer } from '@/test/render'

import ImportPage, { generateMetadata as importMetadata } from './page'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getComplianceMatrix: vi.fn(),
  getCourse: vi.fn(),
  getCourseForEdit: vi.fn(),
  listGroupOptions: vi.fn(kind =>
    Promise.resolve(
      kind === 'department'
        ? [{ id: 'dep_lab', name: 'Laboratoře' }]
        : [{ id: 'pos_head', name: 'Vedoucí' }]
    )
  ),
  listRoomOptions: vi.fn(() =>
    Promise.resolve([
      { id: 'room_aula_a', name: 'Aula A', kind: 'CLASSROOM', capacity: 40, capabilities: [] },
    ])
  ),
  listCourseOptions: vi.fn(),
  listCourses: vi.fn(),
  recordExists: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@muni/db/client', () => ({ getDb: vi.fn(() => 'db') }))

vi.mock('@muni/db/reference', () => ({ loadReferenceSnapshot: vi.fn() }))

vi.mock('@/server/auth')

vi.mock('@/server/actions/edit', () => ({ saveCourse: vi.fn(), saveSession: vi.fn() }))

vi.mock('@/server/actions/sessions', () => ({
  saveNewSession: vi.fn(),
  checkSessionSlotAction: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@/server/actions/archive', () => ({ archiveAction: vi.fn(), previewArchive: vi.fn() }))

vi.mock('@/server/actions/import', () => ({ commitImportChunk: vi.fn() }))

beforeEach(() => {
  signInAs('VIEWER')
  vi.mocked(listCourses).mockResolvedValue([
    courseRow(),
    courseRow({
      code: 'ANGL',
      name: 'Anglický jazyk – kurz',
      validityMonths: null,
      requirements: [],
      counts: counts({ VALID: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0 }),
      rate: 1,
      completionCount: 3,
      upcomingSessions: 0,
    }),
  ])
  vi.mocked(getCourse).mockResolvedValue(courseDetail())
  vi.mocked(getCourseForEdit).mockResolvedValue(courseForEdit())
  vi.mocked(getComplianceMatrix).mockResolvedValue(matrix())
  vi.mocked(loadReferenceSnapshot).mockResolvedValue(EMPTY_REFERENCE)
})

describe('import page', () => {
  it('requires an admin and starts the wizard against what exists', async () => {
    signInAs('ADMIN')
    expect(await importMetadata()).toEqual({ title: 'Import' })
    await renderServer(ImportPage())
    expect(requireAdminPage).toHaveBeenCalled()
    expect(loadReferenceSnapshot).toHaveBeenCalledWith(getDb())
    expect(screen.getByRole('heading', { level: 1, name: 'Import' })).toBeTruthy()
  })
})
