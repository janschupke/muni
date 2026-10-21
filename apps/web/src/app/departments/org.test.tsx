// @vitest-environment jsdom
import {
  getDepartment,
  getDepartmentForEdit,
  getGroupName,
  getPosition,
  getPositionForEdit,
  listDepartmentSummaries,
  listGroupMembers,
  listGroupOptions,
  listPositionSummaries,
  listUpcomingBookings,
} from '@muni/db/repositories'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requireReader } from '@/server/auth'
import { signInAs, signOut } from '@/test/auth'
import {
  booking,
  counts,
  departmentDetail,
  departmentSummary,
  employeeRow,
  members,
  positionDetail,
  positionSummary,
} from '@/test/fixtures'
import { NotFoundError } from '@/test/next'
import { params, renderServer } from '@/test/render'

import PositionBookingsPage, {
  generateMetadata as positionBookingsMetadata,
} from '../positions/[id]/bookings/page'
import EditPositionPage, {
  generateMetadata as editPositionMetadata,
} from '../positions/[id]/edit/page'
import PositionPage from '../positions/[id]/page'
import NewPositionPage, { generateMetadata as newPositionMetadata } from '../positions/new/page'
import PositionsPage from '../positions/page'
import DepartmentBookingsPage, {
  generateMetadata as departmentBookingsMetadata,
} from './[id]/bookings/page'
import EditDepartmentPage, { generateMetadata as editDepartmentMetadata } from './[id]/edit/page'
import DepartmentPage, { generateMetadata as departmentMetadata } from './[id]/page'
import NewDepartmentPage, { generateMetadata as newDepartmentMetadata } from './new/page'
import DepartmentsPage, { generateMetadata as departmentsMetadata } from './page'

/**
 * The people list is full width: it sits outside the grid that holds the facts card and the
 * courses (the closest element containing both headings).
 */
function expectPeopleBelowTheSplit(facts: string) {
  const card = screen.getByRole('heading', { name: facts })
  const courses = screen.getByRole('heading', { name: 'Mandatory courses' })
  let split = card.parentElement
  while (split && !split.contains(courses)) split = split.parentElement
  const people = screen.getByRole('heading', { name: 'People' })
  expect(split?.contains(people)).toBe(false)
  expect(courses.compareDocumentPosition(people) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
}

/** The people list: the table after the "People" heading. */
function peopleTable(): HTMLElement {
  const tables = screen.getAllByRole('table')
  const people = screen.getByRole('heading', { name: 'People' })
  const table = tables.find(
    t => people.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING
  )
  if (!table) throw new Error('no people table')
  return table
}

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getDepartment: vi.fn(),
  getDepartmentForEdit: vi.fn(),
  getPositionForEdit: vi.fn(),
  listGroupOptions: vi.fn(),
  getPosition: vi.fn(),
  listDepartmentSummaries: vi.fn(),
  listGroupMembers: vi.fn(() => Promise.resolve(members())),
  listPositionSummaries: vi.fn(),
  getGroupName: vi.fn(),
  listUpcomingBookings: vi.fn(),
}))

vi.mock('@/server/auth')

vi.mock('@/server/actions/groups', () => ({
  saveDepartmentAction: vi.fn(),
  savePositionAction: vi.fn(),
}))

vi.mock('@/server/actions/archive', () => ({ archiveAction: vi.fn(), previewArchive: vi.fn() }))

beforeEach(() => {
  signInAs('VIEWER')
  vi.mocked(listDepartmentSummaries).mockResolvedValue([
    departmentSummary(),
    departmentSummary({
      id: 'dep_lib',
      name: 'Knihovna',
      active: 0,
      parentalLeave: 0,
      counts: counts({ VALID: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0 }),
      rate: 1,
      actionNow: 0,
      head: null,
      positions: [],
      memberCount: 0,
    }),
  ])
  vi.mocked(getDepartment).mockResolvedValue(departmentDetail())
  vi.mocked(listPositionSummaries).mockResolvedValue([
    positionSummary(),
    positionSummary({ id: 'pos_none', name: 'Stážista', departments: [] }),
  ])
  vi.mocked(getPosition).mockResolvedValue(positionDetail())
  vi.mocked(getGroupName).mockImplementation(kind =>
    Promise.resolve(kind === 'department' ? 'Laboratoře' : 'Laborant')
  )
  vi.mocked(listUpcomingBookings).mockResolvedValue([
    booking(),
    booking({
      sessionExternalId: 'T020',
      courseCode: 'GDPR',
      courseName: 'Ochrana osobních údajů',
      startsAt: '2026-11-05T13:00:00.000Z',
      endsAt: '2026-11-05T16:00:00.000Z',
      person: { externalId: 'E0154', name: 'Adámek Petr' },
    }),
  ])
})

const hrefIn = (scope: HTMLElement, name: string | RegExp) =>
  within(scope).getByRole('link', { name }).getAttribute('href')

describe('departments', () => {
  it('list who leads each, how many people, how compliant, and open to its people', async () => {
    const user = userEvent.setup()
    expect(await departmentsMetadata()).toEqual({ title: 'Departments' })
    await renderServer(DepartmentsPage({ searchParams: params({}) }))
    const lab = screen.getByRole('row', { name: /^Laboratoře/ })
    expect(within(lab).getByRole('link', { name: 'Laboratoře' }).getAttribute('href')).toBe(
      '/departments/dep_lab'
    )
    expect(within(lab).getByRole('link', { name: 'Urbanová Tereza' }).getAttribute('href')).toBe(
      '/employees/E0001'
    )
    expect(within(lab).getByText('+2 on leave')).toBeTruthy()
    expect(within(lab).getByText('88%')).toBeTruthy()
    expect(within(lab).getByText('9').className).toContain('danger')
    // Nobody works in the library: nothing to open.
    const library = screen.getByRole('row', { name: /Knihovna/ })
    expect(within(library).getAllByText('—')).toHaveLength(2)
    expect(within(library).queryByRole('button')).toBeNull()

    await user.click(within(lab).getByRole('button', { name: 'People in Laboratoře' }))
    // Read when the row opens.
    const people = await screen.findByRole('table', { name: 'People of Laboratoře' })
    const marie = within(people).getByRole('row', { name: /Černá Marie/ })
    expect(within(marie).getByRole('link', { name: 'Černá Marie' }).getAttribute('href')).toBe(
      '/employees/E0153'
    )
    expect(within(marie).getByRole('link', { name: 'Laborantka' }).getAttribute('href')).toBe(
      '/positions/pos_lab'
    )
    expect(within(marie).getByText('2 of 3')).toBeTruthy()
    // What needs attention: the expired course, and the session she is booked on.
    expect(within(marie).getByText('Expired')).toBeTruthy()
    expect(
      within(marie).getByRole('link', { name: 'BOZP – základní školení' }).getAttribute('href')
    ).toBe('/courses/BOZP-Z')
    expect(
      within(marie)
        .getByRole('link', { name: /^booked for / })
        .getAttribute('href')
    ).toBe('/sessions/T016')
    const petr = within(people).getByRole('row', { name: /Adámek Petr/ })
    expect(within(petr).getByText('Parental leave')).toBeTruthy()
    expect(within(petr).getByText('All held')).toBeTruthy()
    expect(
      within(within(people).getByRole('row', { name: /Bílá Jana/ })).getByText('Nothing required')
    ).toBeTruthy()
    for (const header of ['Department', 'Head', 'People', 'Compliance', 'Need action now'])
      await user.click(screen.getByRole('button', { name: header }))
  })

  it('say when there are none', async () => {
    vi.mocked(listDepartmentSummaries).mockResolvedValue([])
    await renderServer(DepartmentsPage({ searchParams: params({}) }))
    expect(screen.getByText('No departments yet.')).toBeTruthy()
  })

  it('show one department: its head, positions, courses and people', async () => {
    const props = { params: params({ id: 'dep_lab' }), searchParams: params({}) }
    expect(await departmentMetadata(props)).toEqual({ title: 'Laboratoře' })
    await renderServer(DepartmentPage(props))
    expect(screen.getByRole('heading', { level: 1, name: 'Laboratoře' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Urbanová Tereza' })[0]?.getAttribute('href')).toBe(
      '/employees/E0001'
    )
    // One bar for its compliance, the breakdown, with the share and the count over it.
    // 128 of 144 is 88.9 %: shown as 88 %, the band it is coloured by.
    expect(screen.getByText('88% · 128 of 144')).toBeTruthy()
    const lab = screen.getByRole('row', { name: /Bezpečná práce/ })
    expect(within(lab).getByRole('link', { name: 'Laboratoře' }).getAttribute('href')).toBe(
      '/departments/dep_lab'
    )
    expect(within(lab).getByText('42% · 12 of 28')).toBeTruthy()
    expect(within(lab).getAllByRole('img')).toHaveLength(1)
    // Its people: every member, not a first page of them.
    expect(screen.getByRole('link', { name: 'Adámek Petr' }).getAttribute('href')).toBe(
      '/employees/E0154'
    )
    expect(screen.getByRole('link', { name: 'Bílá Jana' })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Open in the employee list' }).getAttribute('href')
    ).toBe('/employees?department=Laborato%C5%99e')
    expect(screen.getByText(/people who have not left\./)).toBeTruthy()
    // Every row is in this department: the column would only repeat it.
    expect(within(peopleTable()).queryByRole('columnheader', { name: /Department/ })).toBeNull()
    expect(within(peopleTable()).getByRole('columnheader', { name: /Position/ })).toBeTruthy()
    expectPeopleBelowTheSplit('Department')
  })

  it('show a department with no head, positions or courses; and not one that does not exist', async () => {
    vi.mocked(getDepartment).mockResolvedValue(
      departmentDetail({
        head: null,
        positions: [],
        courses: [],
        members: [],
        counts: counts({ VALID: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0 }),
      })
    )
    await renderServer(
      DepartmentPage({ params: params({ id: 'dep_lab' }), searchParams: params({}) })
    )
    expect(screen.getByText('Nobody has a position here.')).toBeTruthy()
    // The people section stays, saying so, with no way to an empty list.
    expect(screen.getByRole('heading', { level: 2, name: 'People' })).toBeTruthy()
    expect(screen.getByText('Nobody works here yet.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /in the employee list/i })).toBeNull()
    expect(screen.getByText('Nothing is required of this department.')).toBeTruthy()
    vi.mocked(getDepartment).mockResolvedValueOnce(null)
    await expect(
      renderServer(DepartmentPage({ params: params({ id: 'gone' }), searchParams: params({}) }))
    ).rejects.toThrow(NotFoundError)
  })
})

describe('upcoming bookings', () => {
  it('link from the list’s count and the facts card to the bookings they count', async () => {
    await renderServer(DepartmentsPage({ searchParams: params({}) }))
    const lab = screen.getByRole('row', { name: /^Laboratoře/ })
    expect(
      within(lab)
        .getByRole('link', { name: '3 upcoming bookings of Laboratoře' })
        .getAttribute('href')
    ).toBe('/departments/dep_lab/bookings')
    await renderServer(
      DepartmentPage({ params: params({ id: 'dep_lab' }), searchParams: params({}) })
    )
    expect(screen.getByRole('link', { name: '3' }).getAttribute('href')).toBe(
      '/departments/dep_lab/bookings'
    )
  })

  it('list them a page at a time, soonest first, each linked; admins can remove one', async () => {
    const props = { params: params({ id: 'dep_lab' }), searchParams: params({}) }
    expect(await departmentBookingsMetadata(props)).toEqual({
      title: 'Upcoming bookings: Laboratoře',
    })
    signInAs('ADMIN')
    await renderServer(DepartmentBookingsPage(props))
    expect(screen.getByRole('heading', { level: 1, name: 'Upcoming bookings' })).toBeTruthy()
    const table = screen.getByRole('table', { name: 'Upcoming bookings of Laboratoře' })
    expect(table.closest('[data-paging]')?.getAttribute('data-paging')).toBe('server')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map(r => within(r).getAllByRole('link')[0]?.textContent)).toEqual([
      'Černá Marie',
      'Adámek Petr',
    ])
    const first = rows[0] as HTMLElement
    expect(hrefIn(first, 'BOZP – základní školení')).toBe('/courses/BOZP-Z')
    expect(hrefIn(first, /03.02.2027/)).toBe('/sessions/T018')
    expect(hrefIn(first, 'Aula A')).toBe('/rooms/room_aula_a')
    expect(
      within(first).getByRole('button', {
        name: 'Remove Černá Marie from BOZP – základní školení',
      })
    ).toBeTruthy()
    expect(listUpcomingBookings).toHaveBeenCalledWith({ department: 'dep_lab' })
  })

  it('say when there are none, and that a position that is not there is not found', async () => {
    vi.mocked(listUpcomingBookings).mockResolvedValue([])
    expect(
      await positionBookingsMetadata({
        params: params({ id: 'pos_lab' }),
        searchParams: params({}),
      })
    ).toEqual({ title: expect.stringMatching(/^Upcoming bookings: \S/) as unknown })
    await renderServer(
      PositionBookingsPage({ params: params({ id: 'pos_lab' }), searchParams: params({}) })
    )
    expect(screen.getByText('Nobody here is booked on a session ahead.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()
    expect(listUpcomingBookings).toHaveBeenCalledWith({ position: 'pos_lab' })
    vi.mocked(getGroupName).mockResolvedValueOnce(null)
    await expect(
      renderServer(
        PositionBookingsPage({ params: params({ id: 'gone' }), searchParams: params({}) })
      )
    ).rejects.toThrow(NotFoundError)
  })

  it('offer admins, on a department’s people, the way to book what each needs', async () => {
    signInAs('ADMIN')
    const [marie, ...others] = members()
    if (!marie) throw new Error('fixture')
    vi.mocked(getDepartment).mockResolvedValue(
      departmentDetail({
        members: [
          employeeRow({
            requirements: marie.requirements.map(r => ({ ...r, booked: null })),
          }),
          ...others,
        ],
      })
    )
    await renderServer(
      DepartmentPage({ params: params({ id: 'dep_lab' }), searchParams: params({}) })
    )
    expect(
      within(peopleTable())
        .getAllByRole('button', { name: /^Book every training/ })
        .map(b => b.getAttribute('aria-label'))
    ).toEqual(['Book every training Černá Marie needs…'])
  })
})

describe('access', () => {
  it('keeps visitors out before any data is read', async () => {
    signOut()
    const props = { params: params({ id: 'dep_lab' }), searchParams: params({}) }
    await expect(DepartmentsPage({ searchParams: params({}) })).rejects.toThrow(
      'redirect to sign-in'
    )
    await expect(DepartmentPage(props)).rejects.toThrow('redirect to sign-in')
    await expect(PositionsPage({ searchParams: params({}) })).rejects.toThrow('redirect to sign-in')
    await expect(PositionPage(props)).rejects.toThrow('redirect to sign-in')
    // The titles name the section only: they read nothing.
    expect(await departmentMetadata(props)).toEqual({ title: 'Departments' })
    expect(requireReader).toHaveBeenCalledTimes(4)
    for (const read of [
      listDepartmentSummaries,
      getDepartment,
      listPositionSummaries,
      getPosition,
      listGroupMembers,
    ])
      expect(read).not.toHaveBeenCalled()
  })
})

describe('managing departments and positions', () => {
  it('gives admins a new button, a pencil and archive per row, and record actions', async () => {
    signInAs('ADMIN')
    await renderServer(DepartmentsPage({ searchParams: params({}) }))
    expect(screen.getByRole('link', { name: 'New department' }).getAttribute('href')).toBe(
      '/departments/new'
    )
    expect(screen.getByRole('link', { name: 'Edit Laboratoře' }).getAttribute('href')).toBe(
      '/departments/dep_lab/edit'
    )
    expect(screen.getByRole('button', { name: 'Archive Laboratoře' })).toBeTruthy()
    await renderServer(
      DepartmentPage({ params: params({ id: 'dep_lab' }), searchParams: params({}) })
    )
    expect(screen.getAllByRole('link', { name: 'Edit' }).at(-1)?.getAttribute('href')).toBe(
      '/departments/dep_lab/edit'
    )
  })

  it('offers none of it to readers', async () => {
    signInAs('FULL')
    await renderServer(PositionsPage({ searchParams: params({}) }))
    expect(screen.queryByRole('link', { name: 'New position' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Archive/ })).toBeNull()
  })

  it('create and edit them: a department with its head, a position with its departments', async () => {
    signInAs('ADMIN')
    vi.mocked(listGroupOptions).mockResolvedValue([
      { id: 'dep_lab', name: 'Laboratoře' },
      { id: 'dep_lib', name: 'Knihovna' },
    ])
    expect(await newDepartmentMetadata()).toEqual({ title: 'New department' })
    expect(await newPositionMetadata()).toEqual({ title: 'New position' })
    await renderServer(NewDepartmentPage())
    expect(screen.getByRole('heading', { level: 1, name: 'New department' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveProperty('value', '')
    vi.mocked(getDepartmentForEdit).mockResolvedValue({
      id: 'dep_lab',
      name: 'Laboratoře',
      headId: 'emp_1',
      members: [{ id: 'emp_1', name: 'Novák Jan' }],
    })
    await renderServer(EditDepartmentPage({ params: params({ id: 'dep_lab' }) }))
    expect(screen.getByRole('heading', { level: 1, name: 'Edit Laboratoře' })).toBeTruthy()
    expect(await editDepartmentMetadata({ params: params({ id: 'dep_lab' }) })).toEqual({
      title: 'Edit Laboratoře',
    })
    expect(screen.getAllByRole('combobox', { name: 'Head' }).at(-1)?.textContent).toBe('Novák Jan')
    await renderServer(NewPositionPage())
    vi.mocked(getPositionForEdit).mockResolvedValue({
      id: 'pos_lab',
      name: 'Laborant',
      departmentIds: ['dep_lab'],
    })
    await renderServer(EditPositionPage({ params: params({ id: 'pos_lab' }) }))
    expect(screen.getByRole('heading', { level: 1, name: 'Edit Laborant' })).toBeTruthy()
    expect(await editPositionMetadata({ params: params({ id: 'pos_lab' }) })).toEqual({
      title: 'Edit Laborant',
    })
    expect(screen.getAllByRole('textbox', { name: /Name/ }).at(-1)).toHaveProperty(
      'value',
      'Laborant'
    )
    const departments = screen.getAllByRole('group', { name: 'Departments' }).at(-1)
    expect(
      within(departments ?? document.body)
        .getByRole('checkbox', { name: 'Laboratoře' })
        .getAttribute('aria-checked')
    ).toBe('true')
    vi.mocked(getDepartmentForEdit).mockResolvedValueOnce(null)
    await expect(
      renderServer(EditDepartmentPage({ params: params({ id: 'gone' }) }))
    ).rejects.toThrow(NotFoundError)
    vi.mocked(getPositionForEdit).mockResolvedValueOnce(null)
    await expect(
      renderServer(EditPositionPage({ params: params({ id: 'gone' }) }))
    ).rejects.toThrow(NotFoundError)
  })
})
