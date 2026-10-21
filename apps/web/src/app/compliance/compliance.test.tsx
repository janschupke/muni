import { loadReferenceSnapshot } from '@muni/db/reference'
import {
  getComplianceMatrix,
  getCourse,
  getCourseForEdit,
  listCourses,
} from '@muni/db/repositories'
import { EMPTY_REFERENCE } from '@muni/importer'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { signInAs } from '@/test/auth'
import { expectLogged } from '@/test/console'
import { counts, courseDetail, courseForEdit, courseRow, matrix } from '@/test/fixtures'
import { renderServer } from '@/test/render'

import CompliancePage, { generateMetadata as complianceMetadata } from './page'

// @vitest-environment jsdom

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

describe('compliance matrix', () => {
  it('prints every percentage, and says where a course does not apply', async () => {
    const user = userEvent.setup()
    expect(await complianceMetadata()).toEqual({ title: 'Compliance matrix' })
    await renderServer(CompliancePage())
    expect(screen.getByText(/Share of required trainings held.*16.10.2026/)).toBeTruthy()
    const lab = screen.getByRole('row', { name: /^Laboratoře/ })
    expect(within(lab).getByText('66%')).toBeTruthy()
    // A cell says what it counts on hover.
    await user.hover(within(lab).getByText('0%'))
    expect((await screen.findByRole('tooltip')).textContent).toBe(
      'Laboratoře, Bezpečná práce v laboratoři: 0 of 2 held'
    )
    const library = screen.getByRole('row', { name: /^Knihovna/ })
    expect(within(library).getByText('Not required')).toBeTruthy()
    expect(screen.getByRole('link', { name: /^LAB-BEZ / }).getAttribute('href')).toBe(
      '/courses/LAB-BEZ'
    )
  })

  it('leaves the date out of the description while the matrix cannot be read', async () => {
    expectLogged('error')
    vi.mocked(getComplianceMatrix).mockRejectedValue(new Error('database down'))
    await renderServer(CompliancePage())
    expect(
      screen.getByText(
        'Share of required trainings held, per department and course. Active employees only.'
      )
    ).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('says when no course is mandatory', async () => {
    vi.mocked(getComplianceMatrix).mockResolvedValue(matrix({ courses: [], rows: [] }))
    await renderServer(CompliancePage())
    expect(screen.getByText('No mandatory courses are defined yet.')).toBeTruthy()
  })
})
