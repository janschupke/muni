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
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requireAdminPage } from '@/server/auth'
import { signInAs } from '@/test/auth'
import {
  counts,
  courseDetail,
  courseForEdit,
  courseRow,
  EXTERNAL,
  INTERNAL,
  matrix,
} from '@/test/fixtures'
import { NotFoundError } from '@/test/next'
import { params, renderServer } from '@/test/render'

import CoursesPage, { generateMetadata as listMetadata } from './(index)/page'
import CoursePage, { generateMetadata as courseMetadata } from './[code]/(index)/page'
import EditCoursePage, { generateMetadata as editCourseMetadata } from './[code]/edit/page'
import NewSessionPage, {
  generateMetadata as newCourseSessionMetadata,
} from './[code]/sessions/new/page'
import NewCoursePage, { generateMetadata as newCourseMetadata } from './new/page'

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

describe('course list', () => {
  it('lists courses with validity, audience and compliance, sortable in the browser', async () => {
    const user = userEvent.setup()
    expect(await listMetadata()).toEqual({ title: 'Courses' })
    await renderServer(CoursesPage({ searchParams: params({}) }))
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
        sessionNeeds: { minutes: null, seats: null, onlineAllowed: true, capabilities: [] },
      }),
    ])
    await renderServer(CoursesPage({ searchParams: params({}) }))
    await user.click(screen.getByRole('button', { name: 'Details for BOZP – základní školení' }))
    // Each part of the opened row is a panel with its own heading (the latest row opened).
    const panel = (name: RegExp) => {
      const heading = screen.getAllByRole('heading', { level: 2, name }).at(-1)
      const section = heading?.closest('section')
      if (!section) throw new Error(`no panel ${String(name)}`)
      return section
    }
    const sessions = panel(/^Planned sessions/)
    expect(within(sessions).getByRole('link', { name: 'Online' }).getAttribute('href')).toBe(
      '/rooms/room_online'
    )
    expect(within(sessions).getByText('Full')).toBeTruthy()
    const needs = panel(/^Its sessions/)
    expect(within(needs).getByText('180 min')).toBeTruthy()
    expect(within(needs).getByText('30 seats')).toBeTruthy()
    // Who offers it, at what price, the default marked.
    expect(within(needs).getByRole('link', { name: 'Interní školitel' }).getAttribute('href')).toBe(
      '/providers/prv_internal'
    )
    expect(within(needs).getByText('default')).toBeTruthy()
    expect(within(needs).getByText('On site only')).toBeTruthy()
    expect(within(needs).getByText('Projector')).toBeTruthy()
    const departments = panel(/^Compliance by department/)
    expect(within(departments).getByRole('link', { name: 'Laboratoře' }).getAttribute('href')).toBe(
      '/departments/dep_lab'
    )
    expect(within(departments).getByText('70%').className).toContain('bg-heat-low')
    expect(within(departments).getByText('100%').className).toContain('bg-heat-full')

    await user.click(screen.getByRole('button', { name: 'Details for Anglický jazyk – kurz' }))
    expect(screen.getByText('Nothing is planned.')).toBeTruthy()
    const angl = panel(/^Its sessions/)
    expect(within(angl).getByText('Length not set')).toBeTruthy()
    expect(within(angl).getByText('Seats not set')).toBeTruthy()
    expect(within(angl).getByText('Can be held online')).toBeTruthy()
    expect(within(angl).getByText('Nothing special')).toBeTruthy()
    expect(screen.getByText('Nobody active must hold it.')).toBeTruthy()
  })

  it('points to the import when the catalogue is empty', async () => {
    vi.mocked(listCourses).mockResolvedValue([])
    await renderServer(CoursesPage({ searchParams: params({}) }))
    expect(screen.getByText('No courses yet. Import the course catalogue to start.')).toBeTruthy()
  })
})

describe('course detail', () => {
  const props = { params: params({ code: 'BOZP-Z' }), searchParams: params({}) }

  it('is titled by the course once its data is there; an unknown code is not found', async () => {
    // The tab names the course from the server on, from the same read the page shows.
    expect(await courseMetadata(props)).toEqual({ title: 'BOZP – základní školení' })
    await renderServer(CoursePage(props))
    expect(document.title).toBe('BOZP – základní školení · Training register')
    vi.mocked(getCourse).mockResolvedValueOnce(null)
    await expect(
      renderServer(CoursePage({ params: params({ code: 'NOPE' }), searchParams: params({}) }))
    ).rejects.toThrow(NotFoundError)
  })

  it('shows who must hold it, how many do, its sessions and recent completions', async () => {
    await renderServer(CoursePage(props))
    expect(screen.getByRole('heading', { level: 1, name: 'BOZP – základní školení' })).toBeTruthy()
    expect(screen.getByText('BOZP-Z · 24 months')).toBeTruthy()
    // Who must hold it, each department and position linking to its page; the department
    // again under compliance by department, as the course's opened row shows it.
    for (const link of screen.getAllByRole('link', { name: 'Laboratoře' }))
      expect(link.getAttribute('href')).toBe('/departments/dep_lab')
    expect(screen.getByRole('heading', { level: 2, name: 'Its sessions' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Offered by' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Vedoucí oddělení' }).getAttribute('href')).toBe(
      '/positions/pos_head'
    )
    // Each kind under its label, the records on their own line: no link inside a sentence.
    expect(
      screen.getByText((_, el) => el?.tagName === 'LI' && el.textContent === 'DepartmentLaboratoře')
    ).toBeTruthy()
    // The course's rate, and Laboratoře's in the breakdown by department.
    expect(screen.getAllByText('70%')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Černá Marie' }).getAttribute('href')).toBe(
      '/employees/E0153'
    )
    // Signed out: no edit links, for the course or its sessions.
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Edit T016/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
  })

  it('shows the latest past sessions, and the way to the rest in the sessions list', async () => {
    await renderServer(CoursePage(props))
    expect(screen.queryByRole('link', { name: /past sessions/ })).toBeNull()
    vi.mocked(getCourse).mockResolvedValueOnce(courseDetail({ pastTotal: 14 }))
    await renderServer(CoursePage(props))
    expect(screen.getByRole('link', { name: 'All 14 past sessions' }).getAttribute('href')).toBe(
      '/sessions?when=past&course=BOZP-Z'
    )
  })

  it('lets admins edit and archive the course, and edit or cancel its sessions', async () => {
    signInAs('ADMIN')
    await renderServer(CoursePage(props))
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
      '/courses/BOZP-Z/edit'
    )
    expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Edit T016 · BOZP – základní školení' }).getAttribute('href')
    ).toBe('/sessions/T016/edit')
    // A session still to start is cancelled from its row, not archived.
    expect(
      screen.getByRole('button', { name: 'Cancel T016 · BOZP – základní školení' })
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Archive T016 · BOZP – základní školení' })
    ).toBeNull()
    // Each recent completion can be corrected or archived from here too.
    expect(
      screen
        .getByRole('link', { name: 'Edit Z000101 · BOZP – základní školení' })
        .getAttribute('href')
    ).toBe('/employees/E0153/completions/cmp_Z000101/edit')
  })

  it('says when nobody is required, nothing is scheduled and nobody has completed it', async () => {
    vi.mocked(getCourse).mockResolvedValue(
      courseDetail({
        validityMonths: null,
        counts: counts({ VALID: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0 }),
        sessions: [],
        completionList: [],
      })
    )
    await renderServer(CoursePage(props))
    expect(screen.getByText('BOZP-Z · No expiry')).toBeTruthy()
    expect(screen.getByText('No upcoming sessions for this course.')).toBeTruthy()
    expect(screen.getByText('No completions yet.')).toBeTruthy()
  })

  it('edits the name, validity and who must hold it, for admins only', async () => {
    signInAs('ADMIN')
    vi.mocked(getCourseForEdit).mockResolvedValue(courseForEdit({ departmentIds: ['dep_lab'] }))
    await renderServer(EditCoursePage(props))
    expect(requireAdminPage).toHaveBeenCalled()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Edit BOZP – základní školení' })
    ).toBeTruthy()
    expect(await editCourseMetadata(props)).toEqual({ title: 'Edit BOZP – základní školení' })
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
    vi.mocked(getCourseForEdit).mockResolvedValueOnce(null)
    await expect(renderServer(EditCoursePage(props))).rejects.toThrow(NotFoundError)
  })

  it('adds a course: admins open an empty form from the list', async () => {
    signInAs('ADMIN')
    vi.mocked(listCourses).mockResolvedValue([courseRow()])
    await renderServer(CoursesPage({ searchParams: params({}) }))
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
  const props = { params: params({ code: 'BOZP-Z' }), searchParams: params({}) }

  const bozp = {
    id: 'course_bozp',
    code: 'BOZP-Z',
    name: 'BOZP – základní školení',
    validityMonths: 24,
    needs: { sessionMinutes: 180, seats: 30, onlineAllowed: false, capabilities: [] },
    offerings: [INTERNAL, EXTERNAL],
  }
  beforeEach(() => {
    vi.mocked(listCourseOptions).mockResolvedValue([bozp])
  })

  it('opens from the course for admins, set to the course’s length and group', async () => {
    signInAs('ADMIN')
    await renderServer(CoursePage(props))
    expect(screen.getByRole('link', { name: 'Schedule session' }).getAttribute('href')).toBe(
      '/courses/BOZP-Z/sessions/new'
    )
    cleanup()
    await renderServer(NewSessionPage(props))
    expect(requireAdminPage).toHaveBeenCalled()
    expect(await newCourseSessionMetadata(props)).toEqual({
      title: 'New session of BOZP – základní školení',
    })
    expect(
      screen.getByRole('heading', { level: 1, name: 'New session of BOZP – základní školení' })
    ).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /^Start/ })).toHaveProperty('value', '09:00')
    expect(screen.getByRole('status', { name: /^End/ }).textContent).toBe('12:00')
    expect(screen.getByRole('textbox', { name: /^Seats/ })).toHaveProperty('value', '30')
    expect(screen.queryByRole('textbox', { name: /Other bookings/ })).toBeNull()
    // The course is chosen already, and can be changed.
    expect(screen.getByRole('combobox', { name: /Course/ }).textContent).toContain('BOZP-Z')
  })

  it('says a course with no length cannot end, leaves the seats to set, and 404s for an unknown course', async () => {
    signInAs('ADMIN')
    vi.mocked(listCourseOptions).mockResolvedValue([
      { ...bozp, needs: { ...bozp.needs, sessionMinutes: null, seats: null } },
    ])
    await renderServer(NewSessionPage(props))
    expect(screen.getByRole('status', { name: /^End/ }).textContent).toBe(
      'The course has no length set yet.'
    )
    expect(screen.getByRole('textbox', { name: /^Seats/ })).toHaveProperty('value', '')
    vi.mocked(recordExists).mockResolvedValueOnce(false)
    await expect(
      NewSessionPage({ params: params({ code: 'NOPE' }), searchParams: params({}) })
    ).rejects.toThrow(NotFoundError)
  })

  it('starts in the room it came from; a provider given twice is not read', async () => {
    signInAs('ADMIN')
    await renderServer(
      NewSessionPage({
        params: params({ code: 'BOZP-Z' }),
        searchParams: params({ room: 'room_aula_a', provider: ['a', 'b'] }),
      })
    )
    expect(screen.getByRole('combobox', { name: /^Room/ }).textContent).toContain('Aula A')
  })
})
