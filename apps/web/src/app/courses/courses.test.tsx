// @vitest-environment jsdom
import { getDb } from '@muni/db/client'
import { loadReferenceSnapshot } from '@muni/db/reference'
import {
  getComplianceMatrix,
  getCourse,
  getCourseForEdit,
  listCourseOptions,
  listCourses,
  recordExists,
} from '@muni/db/repositories'
import { EMPTY_REFERENCE } from '@muni/importer'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requireAdminPage } from '@/server/auth'
import { signInAs } from '@/test/auth'
import { expectNoAxeViolations } from '@/test/axe'
import { counts, courseDetail, courseForEdit, courseRow, matrix } from '@/test/fixtures'
import { NotFoundError } from '@/test/next'
import { params, renderServer } from '@/test/render'

import CompliancePage, { generateMetadata as complianceMetadata } from '../compliance/page'
import ImportPage, { generateMetadata as importMetadata } from '../import/page'
import EditCoursePage from './[code]/edit/page'
import CoursePage, { generateMetadata as courseMetadata } from './[code]/page'
import NewSessionPage from './[code]/sessions/new/page'
import NewCoursePage, { generateMetadata as newCourseMetadata } from './new/page'
import CoursesPage, { generateMetadata as listMetadata } from './page'

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
vi.mock('@/features/import/actions', () => ({ commitImportChunk: vi.fn() }))

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

  it('opens a course to its sessions, what a session needs, and each department', async () => {
    const user = userEvent.setup()
    vi.mocked(listCourses).mockResolvedValue([
      courseRow(),
      courseRow({
        code: 'ANGL',
        name: 'Anglický jazyk – kurz',
        upcoming: [],
        byDepartment: [],
        sessionNeeds: { minutes: null, groupSize: null, onlineAllowed: true, capabilities: [] },
      }),
    ])
    await renderServer(CoursesPage())
    await user.click(screen.getByRole('button', { name: 'Details for BOZP – základní školení' }))
    const sessions = screen.getByRole('group', { name: 'Planned sessions' })
    expect(within(sessions).getByRole('link', { name: 'Online' }).getAttribute('href')).toBe(
      '/rooms/room_online'
    )
    expect(within(sessions).getByText('Full')).toBeTruthy()
    const needs = screen.getByRole('group', { name: 'A session needs' })
    expect(within(needs).getByText('180 min · Groups of 30')).toBeTruthy()
    expect(within(needs).getByText('Projector')).toBeTruthy()
    const departments = screen.getByRole('group', { name: 'Compliance by department' })
    expect(within(departments).getByRole('link', { name: 'Laboratoře' }).getAttribute('href')).toBe(
      '/departments/dep_lab'
    )
    expect(within(departments).getByText('70%').className).toContain('bg-heat-low')
    expect(within(departments).getByText('100%').className).toContain('bg-heat-full')

    await user.click(screen.getByRole('button', { name: 'Details for Anglický jazyk – kurz' }))
    expect(screen.getByText('Nothing is planned.')).toBeTruthy()
    expect(screen.getByText('Length not set · No group size set · Can be held online')).toBeTruthy()
    expect(screen.getByText('Nobody active must hold it.')).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('points to the import when the catalogue is empty', async () => {
    vi.mocked(listCourses).mockResolvedValue([])
    await renderServer(CoursesPage())
    expect(screen.getByText('No courses yet. Import the course catalogue to start.')).toBeTruthy()
  })
})

describe('course detail', () => {
  const props = { params: params({ code: 'BOZP-Z' }) }

  it('is titled by the course once its data is there; an unknown code is not found', async () => {
    expect(await courseMetadata()).toEqual({ title: 'Courses' })
    await renderServer(CoursePage(props))
    expect(document.title).toBe('BOZP – základní školení · Training register')
    vi.mocked(recordExists).mockResolvedValueOnce(false)
    await expect(CoursePage({ params: params({ code: 'NOPE' }) })).rejects.toThrow(NotFoundError)
  })

  it('shows who must hold it, how many do, its sessions and recent completions', async () => {
    await renderServer(CoursePage(props))
    expect(screen.getByRole('heading', { level: 1, name: 'BOZP – základní školení' })).toBeTruthy()
    expect(screen.getByText('BOZP-Z · 24 months')).toBeTruthy()
    // Who must hold it, each department and position linking to its page.
    expect(screen.getByRole('link', { name: 'Laboratoře' }).getAttribute('href')).toBe(
      '/departments/dep_lab'
    )
    expect(screen.getByRole('link', { name: 'Vedoucí oddělení' }).getAttribute('href')).toBe(
      '/positions/pos_head'
    )
    expect(
      screen.getByText(
        (_, el) => el?.tagName === 'LI' && el.textContent === 'Department: Laboratoře'
      )
    ).toBeTruthy()
    expect(screen.getByText('70%')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Černá Marie' }).getAttribute('href')).toBe(
      '/employees/E0153'
    )
    // Signed out: no edit links, for the course or its sessions.
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Edit T016/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
  })

  it('lets admins edit and archive the course and its sessions', async () => {
    signInAs('ADMIN')
    await renderServer(CoursePage(props))
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
      '/courses/BOZP-Z/edit'
    )
    expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Edit T016' }).getAttribute('href')).toBe(
      '/sessions/T016/edit'
    )
    expect(screen.getByRole('button', { name: 'Archive T016' })).toBeTruthy()
    await expectNoAxeViolations()
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

  it('edits the name, validity and who must hold it, for admins only', async () => {
    signInAs('ADMIN')
    vi.mocked(getCourseForEdit).mockResolvedValue(courseForEdit({ departmentIds: ['dep_lab'] }))
    await renderServer(EditCoursePage(props))
    expect(requireAdminPage).toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: 'Edit course BOZP-Z' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveProperty(
      'value',
      'BOZP – základní školení'
    )
    expect(screen.getByRole('checkbox', { name: 'Everyone' }).getAttribute('aria-checked')).toBe(
      'true'
    )
    expect(screen.getByRole('checkbox', { name: 'Laboratoře' }).getAttribute('aria-checked')).toBe(
      'true'
    )
    await expectNoAxeViolations()
    vi.mocked(recordExists).mockResolvedValueOnce(false)
    await expect(EditCoursePage(props)).rejects.toThrow(NotFoundError)
  })

  it('adds a course: admins open an empty form from the list', async () => {
    signInAs('ADMIN')
    vi.mocked(listCourses).mockResolvedValue([courseRow()])
    await renderServer(CoursesPage())
    expect(screen.getByRole('link', { name: 'New course' }).getAttribute('href')).toBe(
      '/courses/new'
    )
    expect(screen.getByRole('link', { name: 'Archived' }).getAttribute('href')).toBe(
      '/courses/archived'
    )
    expect(screen.getByRole('link', { name: 'Edit BOZP – základní školení' })).toBeTruthy()
    expect(await newCourseMetadata()).toEqual({ title: 'New course' })
    await renderServer(NewCoursePage())
    expect(screen.getByRole('heading', { level: 1, name: 'New course' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /Code/ })).toHaveProperty('value', '')
  })
})

describe('new session', () => {
  const props = { params: params({ code: 'BOZP-Z' }) }

  const bozp = {
    id: 'course_bozp',
    code: 'BOZP-Z',
    name: 'BOZP – základní školení',
    validityMonths: 24,
    needs: { sessionMinutes: 180, groupSize: 30, onlineAllowed: false, capabilities: [] },
  }
  beforeEach(() => {
    vi.mocked(listCourseOptions).mockResolvedValue([bozp])
  })

  it('opens from the course for admins, set to the course’s length and group', async () => {
    signInAs('ADMIN')
    await renderServer(CoursePage(props))
    expect(screen.getByRole('link', { name: 'New session' }).getAttribute('href')).toBe(
      '/courses/BOZP-Z/sessions/new'
    )
    await renderServer(NewSessionPage(props))
    expect(requireAdminPage).toHaveBeenCalled()
    expect(
      screen.getByRole('heading', { level: 1, name: 'New session of BOZP – základní školení' })
    ).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /^Start/ })).toHaveProperty('value', '09:00')
    expect(screen.getByRole('textbox', { name: /^End/ })).toHaveProperty('value', '12:00')
    expect(screen.getByRole('textbox', { name: /Capacity/ })).toHaveProperty('value', '30')
    expect(screen.queryByRole('textbox', { name: /Other bookings/ })).toBeNull()
    // The course is chosen already, and can be changed.
    expect(screen.getByRole('combobox', { name: /Course/ }).textContent).toContain('BOZP-Z')
    await expectNoAxeViolations()
  })

  it('falls back to three hours and an empty group, and 404s for an unknown course', async () => {
    signInAs('ADMIN')
    vi.mocked(listCourseOptions).mockResolvedValue([
      { ...bozp, needs: { ...bozp.needs, sessionMinutes: null, groupSize: null } },
    ])
    await renderServer(NewSessionPage(props))
    expect(screen.getByRole('textbox', { name: /^End/ })).toHaveProperty('value', '12:00')
    expect(screen.getByRole('textbox', { name: /Capacity/ })).toHaveProperty('value', '')
    vi.mocked(recordExists).mockResolvedValueOnce(false)
    await expect(NewSessionPage({ params: params({ code: 'NOPE' }) })).rejects.toThrow(
      NotFoundError
    )
  })
})

describe('compliance matrix', () => {
  it('prints every percentage, and says where a course does not apply', async () => {
    const user = userEvent.setup()
    expect(await complianceMetadata()).toEqual({ title: 'Compliance matrix' })
    await renderServer(CompliancePage())
    expect(screen.getByText(/Share of required trainings held.*Oct 16, 2026/)).toBeTruthy()
    const lab = screen.getByRole('row', { name: /^Laboratoře/ })
    expect(within(lab).getByText('67%')).toBeTruthy()
    // A cell says what it counts on hover.
    await user.hover(within(lab).getByText('0%'))
    expect((await screen.findByRole('tooltip')).textContent).toBe(
      'Laboratoře, Bezpečná práce v laboratoři: 0 of 2 held'
    )
    const library = screen.getByRole('row', { name: /^Knihovna/ })
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
  it('requires an admin and starts the wizard against what exists', async () => {
    signInAs('ADMIN')
    expect(await importMetadata()).toEqual({ title: 'Import' })
    await renderServer(ImportPage())
    expect(requireAdminPage).toHaveBeenCalled()
    expect(loadReferenceSnapshot).toHaveBeenCalledWith(getDb())
    expect(screen.getByRole('heading', { level: 1, name: 'Import' })).toBeTruthy()
    await expectNoAxeViolations()
  })
})
