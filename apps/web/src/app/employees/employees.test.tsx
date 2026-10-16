// @vitest-environment jsdom
import {
  getEmployee,
  getEmployeeForEdit,
  getPersonName,
  listCourseOptions,
  listDepartments,
  listEmployeeBookings,
  listEmployees,
  listPositions,
  listProviderNames,
} from '@muni/db/repositories'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getViewer, requirePageUser } from '@/server/auth'
import { expectNoAxeViolations } from '@/test/axe'
import { booking, counts, employeeDetail, employeePage, employeeRow } from '@/test/fixtures'
import { NotFoundError, router } from '@/test/next'
import { params, renderServer } from '@/test/render'

import NewCompletionPage from './[externalId]/completions/new/page'
import EditEmployeePage from './[externalId]/edit/page'
import EmployeePage, { generateMetadata as employeeMetadata } from './[externalId]/page'
import EmployeesPage, { generateMetadata as listMetadata } from './page'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getEmployee: vi.fn(),
  getEmployeeForEdit: vi.fn(),
  getPersonName: vi.fn(),
  listCourseOptions: vi.fn(),
  listDepartments: vi.fn(),
  listEmployeeBookings: vi.fn(),
  listEmployees: vi.fn(),
  listPositions: vi.fn(),
  listProviderNames: vi.fn(),
}))
vi.mock('@/server/auth')
vi.mock('@/server/actions/edit', () => ({
  saveEmployee: vi.fn(),
  recordCompletion: vi.fn(),
}))
vi.mock('@/server/actions/assignments', () => ({ removeAssignmentAction: vi.fn() }))

beforeEach(() => {
  vi.mocked(getViewer).mockResolvedValue('anonymous')
  vi.mocked(requirePageUser).mockResolvedValue('user_1')
  vi.mocked(listEmployees).mockResolvedValue(employeePage())
  vi.mocked(listDepartments).mockResolvedValue(['Knihovna', 'Laboratoře'])
  vi.mocked(listPositions).mockResolvedValue(['Laborantka', 'Referent'])
  vi.mocked(listProviderNames).mockResolvedValue(['Bezpečná firma s.r.o.'])
  vi.mocked(listCourseOptions).mockResolvedValue([
    { code: 'BOZP-Z', name: 'BOZP – základní školení', validityMonths: 24 },
    { code: 'LEAD', name: 'Základy vedení lidí', validityMonths: null },
  ])
  vi.mocked(getEmployee).mockResolvedValue(employeeDetail())
  vi.mocked(getEmployeeForEdit).mockResolvedValue({
    externalId: 'E0153',
    firstName: 'Marie',
    lastName: 'Černá',
    email: 'marie.cerna@vzorova.example',
    department: 'Laboratoře',
    position: 'Laborantka',
    hiredOn: '2019-03-01',
    leftOn: null,
    status: 'ACTIVE',
    note: null,
  })
  vi.mocked(listEmployeeBookings).mockResolvedValue([booking()])
})

describe('employee list', () => {
  const search = (query: Record<string, string>) => ({ searchParams: params(query) })

  it('reads filters, sort and page from the URL', async () => {
    expect(await listMetadata()).toEqual({ title: 'Employees' })
    await renderServer(
      EmployeesPage(
        search({
          q: 'černá',
          department: 'Laboratoře',
          position: 'Laborantka',
          status: 'ACTIVE',
          compliance: 'BOGUS',
          sort: 'department',
          dir: 'desc',
          page: '2',
        })
      )
    )
    expect(listEmployees).toHaveBeenCalledWith({
      q: 'černá',
      department: 'Laboratoře',
      position: 'Laborantka',
      status: 'ACTIVE',
      compliance: undefined,
      sort: { by: 'department', desc: true },
      page: 2,
    })
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveProperty('value', 'černá')
    expect(screen.getByText('1 employee')).toBeTruthy()
  })

  it('pages with links that keep the filters', async () => {
    vi.mocked(listEmployees).mockResolvedValue(
      employeePage([employeeRow()], { page: 2, pageCount: 3, total: 60 })
    )
    await renderServer(EmployeesPage(search({ department: 'Knihovna', page: 'x' })))
    expect(listEmployees).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }))
    expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe(
      '/employees?department=Knihovna&page=3'
    )
  })

  it('says so when nobody matches', async () => {
    vi.mocked(listEmployees).mockResolvedValue(employeePage([]))
    await renderServer(EmployeesPage(search({})))
    expect(screen.getByText('No employees match these filters.')).toBeTruthy()
  })

  it('sorts on the server by rewriting the URL, from the first page', async () => {
    const user = userEvent.setup()
    await renderServer(EmployeesPage(search({ department: 'Knihovna', page: '2' })))
    await user.click(screen.getByRole('button', { name: /Department/ }))
    expect(router.push).toHaveBeenCalledWith('/employees?department=Knihovna&sort=department', {
      scroll: false,
    })
  })

  it('searches on submit and filters as soon as a select changes', async () => {
    const user = userEvent.setup()
    await renderServer(EmployeesPage(search({ sort: 'name', page: '3' })))
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), '  Novák  ')
    await user.click(screen.getByRole('button', { name: 'Filter' }))
    expect(router.replace).toHaveBeenLastCalledWith('/employees?q=Nov%C3%A1k&sort=name', {
      scroll: false,
    })
    await user.click(screen.getByRole('combobox', { name: 'Employment' }))
    await user.click(await screen.findByRole('option', { name: 'Parental leave' }))
    expect(router.replace).toHaveBeenLastCalledWith('/employees?status=PARENTAL_LEAVE&sort=name', {
      scroll: false,
    })
    await user.click(screen.getByRole('combobox', { name: 'Department' }))
    await user.click(await screen.findByRole('option', { name: 'Laboratoře' }))
    await user.click(screen.getByRole('combobox', { name: 'Position' }))
    await user.click(await screen.findByRole('option', { name: 'Referent' }))
    expect(router.replace).toHaveBeenLastCalledWith('/employees?position=Referent&sort=name', {
      scroll: false,
    })
    await user.click(screen.getByRole('combobox', { name: 'Has training' }))
    await user.click(await screen.findByRole('option', { name: 'Expired' }))
    expect(router.replace).toHaveBeenLastCalledWith('/employees?compliance=EXPIRED&sort=name', {
      scroll: false,
    })
    expect(screen.getByRole('link', { name: 'Reset' }).getAttribute('href')).toBe('/employees')
  })

  it('opens a row to the person’s trainings, expiry and bookings', async () => {
    const user = userEvent.setup()
    vi.mocked(listEmployees).mockResolvedValue(
      employeePage([
        employeeRow(),
        employeeRow({
          externalId: 'E0024',
          firstName: 'Adam',
          lastName: 'Blažek',
          department: null,
          position: null,
          status: 'TERMINATED',
          counts: { VALID: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0, total: 0 },
          requirements: [],
        }),
      ])
    )
    await renderServer(EmployeesPage(search({})))
    // Nothing required: no bar and nothing to open.
    const left = screen.getByRole('row', { name: /Blažek Adam/ })
    expect(within(left).getByText('Left')).toBeTruthy()
    expect(within(left).queryByRole('button')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Details for Černá Marie' }))
    expect(screen.getByRole('link', { name: 'BOZP – základní školení' }).getAttribute('href')).toBe(
      '/courses/BOZP-Z'
    )
    expect(screen.getByText('(45 days ago)')).toBeTruthy()
    expect(screen.getByText('No expiry')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Nov 4, 2026/ }).getAttribute('href')).toBe(
      '/sessions/T016'
    )
    expect(screen.getByText('2 of 3')).toBeTruthy()
    // Two of three held is in the orange band (50–74 %).
    const bar = within(screen.getByRole('row', { name: /Černá Marie/ })).getByRole('meter')
    expect(bar.firstElementChild?.className).toContain('bg-serious-fill')
  })
})

describe('employee detail', () => {
  const props = { params: params({ externalId: 'E0153' }) }

  it('is titled by the person, or by the ID when unknown', async () => {
    expect(await employeeMetadata(props)).toEqual({ title: 'Marie Černá' })
    vi.mocked(getEmployee).mockResolvedValue(null)
    expect(await employeeMetadata({ params: params({ externalId: 'E9999' }) })).toEqual({
      title: 'E9999',
    })
    await expect(EmployeePage({ params: params({ externalId: 'E9999' }) })).rejects.toThrow(
      NotFoundError
    )
  })

  it('shows the profile, requirements, bookings and history to visitors, read-only', async () => {
    await renderServer(EmployeePage(props))
    expect(screen.getByRole('heading', { level: 1, name: 'Marie Černá' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Employees' }).getAttribute('href')).toBe(
      '/employees'
    )
    expect(screen.getByRole('link', { name: 'Urbanová Tereza' }).getAttribute('href')).toBe(
      '/employees/E0001'
    )
    expect(screen.getByText('m••••••••••@vzorova.example')).toBeTruthy()
    expect(screen.queryByText('Birth number')).toBeNull()
    expect(screen.getByText('50% of required trainings held')).toBeTruthy()
    const held = screen.getByRole('meter', { name: 'Valid trainings' })
    expect([held.getAttribute('aria-valuenow'), held.getAttribute('aria-valuemax')]).toEqual([
      '1',
      '2',
    ])
    expect(held.firstElementChild?.className).toContain('bg-serious-fill')
    expect(screen.getByText('1 of 2')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Feb 3, 2027/ }).getAttribute('href')).toBe(
      '/sessions/T018'
    )
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Cancel booking/ })).toBeNull()
  })

  it('gives signed-in users the edit, record and cancel actions and the sensitive fields', async () => {
    vi.mocked(getViewer).mockResolvedValue('authenticated')
    vi.mocked(getEmployee).mockResolvedValue(
      employeeDetail({
        nationalId: '•••••••0359',
        note: 'interní poznámka',
        leftOn: '2026-12-31',
        manager: null,
      })
    )
    await renderServer(EmployeePage(props))
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
      '/employees/E0153/edit'
    )
    expect(screen.getByRole('link', { name: 'Record completion' }).getAttribute('href')).toBe(
      '/employees/E0153/completions/new'
    )
    expect(
      screen.getByRole('button', { name: 'Cancel booking for BOZP – základní školení' })
    ).toBeTruthy()
    expect(screen.getByText('•••••••0359')).toBeTruthy()
    expect(screen.getByText('interní poznámka')).toBeTruthy()
    expect(screen.getByText('Left')).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('says when nothing is required, booked or recorded', async () => {
    // A visitor policy that omits the email drops the key altogether.
    const { email: _omitted, ...withoutEmail } = employeeDetail({
      requirements: [],
      completions: [],
    })
    vi.mocked(getEmployee).mockResolvedValue(withoutEmail)
    vi.mocked(listEmployeeBookings).mockResolvedValue([])
    await renderServer(EmployeePage(props))
    expect(screen.getByText('No training is required for this person.')).toBeTruthy()
    expect(screen.getByText('No upcoming bookings.')).toBeTruthy()
    expect(screen.getByText('No completed trainings on record.')).toBeTruthy()
    expect(screen.queryByText('Email')).toBeNull()
  })
})

describe('managers', () => {
  it('see their team: each report, the team’s compliance, and the reports in the list', async () => {
    vi.mocked(getEmployee).mockResolvedValue(
      employeeDetail({
        reports: [
          {
            externalId: 'E0002',
            name: 'Adámek Petr',
            position: 'Laborant',
            status: 'ACTIVE',
            compliance: 'MISSING',
            counts: counts({ VALID: 2, EXPIRING: 0, EXPIRED: 0, MISSING: 1 }),
          },
          {
            externalId: 'E0003',
            name: 'Bílá Jana',
            position: null,
            status: 'PARENTAL_LEAVE',
            compliance: null,
            counts: counts({ VALID: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0 }),
          },
        ],
        teamCounts: counts({ VALID: 2, EXPIRING: 0, EXPIRED: 0, MISSING: 1 }),
      })
    )
    await renderServer(EmployeePage({ params: params({ externalId: 'E0001' }) }))
    expect(screen.getByRole('heading', { name: 'Team' })).toBeTruthy()
    expect(screen.getByText('2 direct reports who have not left')).toBeTruthy()
    expect(screen.getByText('2 of 3 held')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Adámek Petr' }).getAttribute('href')).toBe(
      '/employees/E0002'
    )
    expect(screen.getByText('Nothing required')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'All direct reports in the list' }).getAttribute('href')
    ).toBe('/employees?manager=E0153')
    // The person's own department and position link to their pages.
    expect(screen.getByRole('link', { name: 'Laboratoře' }).getAttribute('href')).toBe(
      '/departments/dep_lab'
    )
  })

  it('see no team card without reports', async () => {
    await renderServer(EmployeePage({ params: params({ externalId: 'E0153' }) }))
    expect(screen.queryByRole('heading', { name: 'Team' })).toBeNull()
  })

  it('narrow the list to their reports, with a way back to everyone', async () => {
    vi.mocked(getPersonName).mockResolvedValue('Urbanová Tereza')
    await renderServer(EmployeesPage({ searchParams: params({ manager: 'E0001' }) }))
    expect(listEmployees).toHaveBeenCalledWith(expect.objectContaining({ manager: 'E0001' }))
    expect(getPersonName).toHaveBeenCalledWith('E0001')
    expect(screen.getByText(/Direct reports of Urbanová Tereza/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Show everyone' }).getAttribute('href')).toBe(
      '/employees'
    )
    cleanup()
    // Nobody by that ID: the ID stands in.
    vi.mocked(getPersonName).mockResolvedValue(null)
    await renderServer(EmployeesPage({ searchParams: params({ manager: 'E9999' }) }))
    expect(screen.getByText(/Direct reports of E9999/)).toBeTruthy()
  })
})

describe('employee forms', () => {
  const props = { params: params({ externalId: 'E0153' }) }

  it('require a signed-in user and an existing person', async () => {
    vi.mocked(getEmployeeForEdit).mockResolvedValue(null)
    await expect(EditEmployeePage(props)).rejects.toThrow(NotFoundError)
    await expect(NewCompletionPage(props)).rejects.toThrow(NotFoundError)
    expect(requirePageUser).toHaveBeenCalledTimes(2)
  })

  it('edit the person with their current values', async () => {
    await renderServer(EditEmployeePage(props))
    expect(screen.getByRole('heading', { level: 1, name: 'Edit Marie Černá' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'First name' })).toHaveProperty('value', 'Marie')
    expect(screen.getByRole('link', { name: 'Back to Marie Černá' }).getAttribute('href')).toBe(
      '/employees/E0153'
    )
    await expectNoAxeViolations()
  })

  it('record a completion against the course list', async () => {
    await renderServer(NewCompletionPage(props))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Record completion for Marie Černá' })
    ).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /Course/ })).toBeTruthy()
    await expectNoAxeViolations()
  })
})
