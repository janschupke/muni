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
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getViewer, requirePageUser } from '@/server/auth'
import { counts, courseDetail, courseRow, matrix } from '@/test/fixtures'
import { NotFoundError } from '@/test/next'
import { params, renderServer } from '@/test/render'

import CompliancePage, { generateMetadata as complianceMetadata } from '../compliance/page'
import ImportPage, { generateMetadata as importMetadata } from '../import/page'
import EditCoursePage from './[code]/edit/page'
import CoursePage, { generateMetadata as courseMetadata } from './[code]/page'
import CoursesPage, { generateMetadata as listMetadata } from './page'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getComplianceMatrix: vi.fn(),
  getCourse: vi.fn(),
  getCourseForEdit: vi.fn(),
  listCourses: vi.fn(),
}))
vi.mock('@muni/db/client', () => ({ getDb: vi.fn(() => 'db') }))
vi.mock('@muni/db/reference', () => ({ loadReferenceSnapshot: vi.fn() }))
vi.mock('@/server/auth')
vi.mock('@/server/actions/edit', () => ({ saveCourse: vi.fn(), saveSession: vi.fn() }))
vi.mock('@/features/import/actions', () => ({ commitImportChunk: vi.fn() }))

beforeEach(() => {
  vi.mocked(getViewer).mockResolvedValue('anonymous')
  vi.mocked(requirePageUser).mockResolvedValue('user_1')
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
  vi.mocked(getCourseForEdit).mockResolvedValue({
    code: 'BOZP-Z',
    name: 'BOZP – základní školení',
    validityMonths: 24,
  })
  vi.mocked(getComplianceMatrix).mockResolvedValue(matrix())
  vi.mocked(loadReferenceSnapshot).mockResolvedValue(EMPTY_REFERENCE)
})

describe('course list', () => {
  it('lists courses with validity, audience and compliance, sortable in the browser', async () => {
    const user = userEvent.setup()
    expect(await listMetadata()).toEqual({ title: 'Courses' })
    await renderServer(CoursesPage())
    const bozp = screen.getByRole('row', { name: /BOZP – základní školení/ })
    expect(within(bozp).getByText('24 months')).toBeTruthy()
    expect(within(bozp).getByText('Everyone')).toBeTruthy()
    expect(within(bozp).getByText('70%')).toBeTruthy()
    const angl = screen.getByRole('row', { name: /Anglický jazyk/ })
    expect(within(angl).getByText('No expiry')).toBeTruthy()
    expect(within(angl).getByText('Optional')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Valid for/ }))
    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map(r => r.textContent)
    // Never-expiring courses sort after every finite validity.
    expect(names[1]).toContain('Anglický jazyk')
  })

  it('points to the import when the catalogue is empty', async () => {
    vi.mocked(listCourses).mockResolvedValue([])
    await renderServer(CoursesPage())
    expect(screen.getByText('No courses yet. Import the course catalogue to start.')).toBeTruthy()
  })
})

describe('course detail', () => {
  const props = { params: params({ code: 'BOZP-Z' }) }

  it('is titled by the course, or the code when unknown', async () => {
    expect(await courseMetadata(props)).toEqual({ title: 'BOZP – základní školení' })
    vi.mocked(getCourse).mockResolvedValue(null)
    expect(await courseMetadata({ params: params({ code: 'NOPE' }) })).toEqual({ title: 'NOPE' })
    await expect(CoursePage({ params: params({ code: 'NOPE' }) })).rejects.toThrow(NotFoundError)
  })

  it('shows who must hold it, how many do, its sessions and recent completions', async () => {
    await renderServer(CoursePage(props))
    expect(screen.getByRole('heading', { level: 1, name: 'BOZP – základní školení' })).toBeTruthy()
    expect(screen.getByText('BOZP-Z · 24 months')).toBeTruthy()
    expect(screen.getByText('Department: Laboratoře')).toBeTruthy()
    expect(screen.getByText('Position: Vedoucí oddělení')).toBeTruthy()
    expect(screen.getByText('70%')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Černá Marie' }).getAttribute('href')).toBe(
      '/employees/E0153'
    )
    // Signed out: no edit links, for the course or its sessions.
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Edit session/ })).toBeNull()
  })

  it('lets signed-in users edit the course and its sessions', async () => {
    vi.mocked(getViewer).mockResolvedValue('authenticated')
    await renderServer(CoursePage(props))
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
      '/courses/BOZP-Z/edit'
    )
    expect(screen.getByRole('link', { name: 'Edit session T016' }).getAttribute('href')).toBe(
      '/sessions/T016/edit'
    )
  })

  it('says when nobody is required, nothing is scheduled and nobody has completed it', async () => {
    vi.mocked(getCourse).mockResolvedValue(
      courseDetail({
        validityMonths: null,
        counts: counts({ VALID: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0 }),
        sessions: [],
        recentCompletions: [],
      })
    )
    await renderServer(CoursePage(props))
    expect(screen.getByText('BOZP-Z · No expiry')).toBeTruthy()
    expect(screen.getByText('No sessions for this course.')).toBeTruthy()
    expect(screen.getByText('No completions yet.')).toBeTruthy()
  })

  it('edits the name and validity, for signed-in users only', async () => {
    await renderServer(EditCoursePage(props))
    expect(requirePageUser).toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: 'Edit course BOZP-Z' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveProperty(
      'value',
      'BOZP – základní školení'
    )
    vi.mocked(getCourseForEdit).mockResolvedValue(null)
    await expect(EditCoursePage(props)).rejects.toThrow(NotFoundError)
  })
})

describe('compliance matrix', () => {
  it('prints every percentage, and says where a course does not apply', async () => {
    expect(await complianceMetadata()).toEqual({ title: 'Compliance matrix' })
    await renderServer(CompliancePage())
    const lab = screen.getByRole('row', { name: /Laboratoře/ })
    expect(within(lab).getByText('70%')).toBeTruthy()
    expect(
      within(lab).getByTitle('Laboratoře, Bezpečná práce v laboratoři: 0 of 4 held')
    ).toBeTruthy()
    const library = screen.getByRole('row', { name: /Knihovna/ })
    expect(within(library).getByText('Not required')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'LAB-BEZ' }).getAttribute('href')).toBe(
      '/courses/LAB-BEZ'
    )
  })

  it('says when no course is mandatory', async () => {
    vi.mocked(getComplianceMatrix).mockResolvedValue(matrix({ courses: [], rows: [] }))
    await renderServer(CompliancePage())
    expect(screen.getByText('No mandatory courses are defined yet.')).toBeTruthy()
  })
})

describe('import page', () => {
  it('requires a signed-in user and starts the wizard against what exists', async () => {
    expect(await importMetadata()).toEqual({ title: 'Import' })
    await renderServer(ImportPage())
    expect(requirePageUser).toHaveBeenCalled()
    expect(loadReferenceSnapshot).toHaveBeenCalledWith(getDb())
    expect(screen.getByRole('heading', { level: 1, name: 'Import' })).toBeTruthy()
  })
})
