// @vitest-environment jsdom
import {
  getAdvisorInput,
  getCompletionForEdit,
  getEmployee,
  getEmployeeForEdit,
  getPersonName,
  listCourseOptions,
  listDepartments,
  listEmployeeOptions,
  listEmployees,
  listGroupOptions,
  listPositions,
  listProviderOptions,
} from '@muni/db/repositories'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requireAdminPage } from '@/server/auth'
import { signInAs } from '@/test/auth'
import { advisorInput, counts, employeeDetail, employeePage, employeeRow } from '@/test/fixtures'
import { NotFoundError, router } from '@/test/next'
import { at, params, renderServer } from '@/test/render'

import EditCompletionPage, {
  generateMetadata as editCompletionMetadata,
} from './[externalId]/completions/[id]/edit/page'
import NewCompletionPage, {
  generateMetadata as newCompletionMetadata,
} from './[externalId]/completions/new/page'
import EditEmployeePage, {
  generateMetadata as editEmployeeMetadata,
} from './[externalId]/edit/page'
import EmployeePage, { generateMetadata as employeeMetadata } from './[externalId]/page'
import NewEmployeePage, { generateMetadata as newMetadata } from './new/page'
import EmployeesPage, { generateMetadata as listMetadata } from './page'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getAdvisorInput: vi.fn(),
  getCompletionForEdit: vi.fn(),
  getEmployee: vi.fn(),
  getEmployeeForEdit: vi.fn(),
  listEmployeeOptions: vi.fn(),
  listGroupOptions: vi.fn(),
  getPersonName: vi.fn(),
  listCourseOptions: vi.fn(),
  listDepartments: vi.fn(),
  listEmployees: vi.fn(),
  listPositions: vi.fn(),
  listProviderOptions: vi.fn(),
  listDepartmentPositions: vi.fn(() => Promise.resolve({ dep_lab: ['pos_lab'] })),
  listDepartmentHeads: vi.fn(() => Promise.resolve({})),
  recordExists: vi.fn(() => Promise.resolve(true)),
}))
vi.mock('@/server/auth')
vi.mock('@/server/actions/edit', () => ({
  saveEmployee: vi.fn(),
  saveCompletion: vi.fn(),
}))
const { applyAssignmentsAction } = vi.hoisted(() => ({
  applyAssignmentsAction: vi.fn(() => Promise.resolve({ ok: true, applied: 1, failed: [] })),
}))
vi.mock('@/server/actions/assignments', () => ({
  applyAssignmentsAction,
  removeAssignmentAction: vi.fn(),
}))
vi.mock('@/server/actions/archive', () => ({ archiveAction: vi.fn(), previewArchive: vi.fn() }))

beforeEach(() => {
  signInAs('VIEWER')
  vi.mocked(listEmployees).mockResolvedValue(employeePage())
  vi.mocked(listDepartments).mockResolvedValue(['Knihovna', 'Laboratoře'])
  vi.mocked(listPositions).mockResolvedValue(['Laborantka', 'Referent'])
  vi.mocked(listProviderOptions).mockResolvedValue([
    { id: 'prov_1', name: 'Bezpečná firma s.r.o.' },
  ])
  const needs = { sessionMinutes: null, seats: null, onlineAllowed: false, capabilities: [] }
  vi.mocked(listCourseOptions).mockResolvedValue([
    {
      id: 'course_bozp',
      code: 'BOZP-Z',
      name: 'BOZP – základní školení',
      validityMonths: 24,
      needs,
      offerings: [],
    },
    {
      id: 'course_lead',
      code: 'LEAD',
      name: 'Základy vedení lidí',
      validityMonths: null,
      needs,
      offerings: [],
    },
  ])
  vi.mocked(getEmployee).mockResolvedValue(employeeDetail())
  vi.mocked(listGroupOptions).mockImplementation(kind =>
    Promise.resolve(
      kind === 'department'
        ? [{ id: 'dep_lab', name: 'Laboratoře' }]
        : [{ id: 'pos_lab', name: 'Laborantka' }]
    )
  )
  vi.mocked(listEmployeeOptions).mockResolvedValue([
    { id: 'emp_E0001', externalId: 'E0001', name: 'Urbanová Tereza', departmentId: null },
    { id: 'emp_E0153', externalId: 'E0153', name: 'Černá Marie', departmentId: 'dep_lab' },
  ])
  vi.mocked(getAdvisorInput).mockResolvedValue(advisorInput())
  vi.mocked(getEmployeeForEdit).mockResolvedValue({
    id: 'emp_E0153',
    externalId: 'E0153',
    firstName: 'Marie',
    lastName: 'Černá',
    email: 'marie.cerna@vzorova.example',
    nationalId: null,
    departmentId: 'dep_lab',
    positionId: 'pos_lab',
    managerId: 'emp_E0001',
    manager: { id: 'emp_E0001', name: 'Urbanová Tereza' },
    leadsDepartment: false,
    hiredOn: '2019-03-01',
    leftOn: null,
    status: 'ACTIVE',
    note: null,
  })
})

describe('employee list', () => {
  it('paints with its data: the server read it, and the browser asks nothing', async () => {
    const fetches = vi.spyOn(globalThis, 'fetch')
    // Filters, a sort and a page from the address: the server's read is the view's.
    await renderServer(
      EmployeesPage({
        searchParams: at('/employees', {
          department: 'Laboratoře',
          sort: 'name',
          dir: 'desc',
          page: '2',
        }),
      })
    )
    const person = { params: params({ externalId: 'E0153' }), searchParams: at('/employees/E0153') }
    await renderServer(EmployeePage(person))
    signInAs('ADMIN')
    await renderServer(EditEmployeePage(person))
    expect(fetches).not.toHaveBeenCalled()
  })

  const search = (query: Record<string, string>) => ({ searchParams: at('/employees', query) })

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
    await user.click(screen.getByRole('button', { name: 'Search' }))
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
          status: 'LEFT',
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
    expect(screen.getByRole('link', { name: /04.11.2026/ }).getAttribute('href')).toBe(
      '/sessions/T016'
    )
    expect(screen.getByText('2 of 3')).toBeTruthy()
    // Two of three held is in the orange band (50–74 %).
    const bar = within(screen.getByRole('row', { name: /Černá Marie/ })).getByRole('meter')
    expect(bar.firstElementChild?.className).toContain('bg-serious-fill')
  })
})

describe('employee detail', () => {
  const props = { params: params({ externalId: 'E0153' }), searchParams: params({}) }

  it('is titled by the person once their data is there; an unknown ID is not found', async () => {
    expect(await employeeMetadata(props)).toEqual({ title: 'Marie Černá' })
    await renderServer(EmployeePage(props))
    expect(document.title).toBe('Marie Černá · Training register')
    vi.mocked(getEmployee).mockResolvedValueOnce(null)
    await expect(
      renderServer(
        EmployeePage({ params: params({ externalId: 'E9999' }), searchParams: params({}) })
      )
    ).rejects.toThrow(NotFoundError)
    expect(getEmployee).toHaveBeenLastCalledWith('E9999', 'VIEWER')
  })

  it('shows the profile, requirements with their bookings, and history to viewers, read-only', async () => {
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
    const held = screen.getByRole('meter', { name: 'Held' })
    expect([held.getAttribute('aria-valuenow'), held.getAttribute('aria-valuemax')]).toEqual([
      '1',
      '2',
    ])
    expect(held.firstElementChild?.className).toContain('bg-serious-fill')
    expect(screen.getByText('1 of 2')).toBeTruthy()
    // Each booking on its requirement: when, linking to the session, and where.
    expect(screen.getByRole('link', { name: /04.11.2026/ }).getAttribute('href')).toBe(
      '/sessions/T016'
    )
    expect(screen.getByRole('link', { name: 'Aula A' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Upcoming sessions' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Cancel the booking/ })).toBeNull()
    expect(getEmployee).toHaveBeenCalledWith('E0153', 'VIEWER')
  })

  it('shows the full role the whole record, read-only', async () => {
    signInAs('FULL')
    vi.mocked(getEmployee).mockResolvedValue(
      employeeDetail({ nationalId: '665917/0359', note: 'interní poznámka' })
    )
    await renderServer(EmployeePage(props))
    expect(getEmployee).toHaveBeenCalledWith('E0153', 'FULL')
    expect(screen.getByText('665917/0359')).toBeTruthy()
    expect(screen.getByText('interní poznámka')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Record completion' })).toBeNull()
  })

  it('gives admins the edit, record and cancel actions and the sensitive fields', async () => {
    signInAs('ADMIN')
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
      screen.getByRole('button', {
        name: 'Cancel the booking of BOZP – základní školení for Marie Černá',
      })
    ).toBeTruthy()
    expect(screen.getByText('•••••••0359')).toBeTruthy()
    expect(screen.getByText('interní poznámka')).toBeTruthy()
    expect(screen.getByText('Left')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy()
    // Each completion can be corrected or archived.
    expect(
      screen
        .getByRole('link', { name: 'Edit Z000101 · Ochrana osobních údajů' })
        .getAttribute('href')
    ).toBe('/employees/E0153/completions/cmp_Z000101/edit')
  })

  it('books only what the person needs, from its row, on the session the dialog proposes', async () => {
    const user = userEvent.setup()
    signInAs('ADMIN')
    const detail = employeeDetail()
    const [bozp, gdpr] = detail.requirements
    if (!bozp || !gdpr) throw new Error('fixture')
    vi.mocked(getEmployee).mockResolvedValue(
      employeeDetail({ requirements: [{ ...bozp, booked: null }, gdpr] })
    )
    await renderServer(EmployeePage(props))
    // No list of every session there is: only the expired training, and nothing for the valid.
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getAllByRole('button', { name: /^Book / })).toHaveLength(1)
    await user.click(
      screen.getByRole('button', { name: 'Book BOZP – základní školení for Marie Černá…' })
    )
    const dialog = await screen.findByRole('dialog', { name: 'Book trainings' })
    expect(
      await within(dialog).findByRole('combobox', { name: 'Session for Černá Marie' })
    ).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: /^Book 1 training · 450,00\sKč$/ }))
    expect(applyAssignmentsAction).toHaveBeenCalledWith([
      { sessionExternalId: 'T018', employeeExternalId: 'E0153', source: 'MANUAL' },
    ])
  })

  it('says when nothing is required or recorded', async () => {
    // A viewer policy that omits the email drops the key altogether.
    const { email: _omitted, ...withoutEmail } = employeeDetail({
      requirements: [],
      completions: [],
    })
    vi.mocked(getEmployee).mockResolvedValue(withoutEmail)
    await renderServer(EmployeePage(props))
    expect(screen.getByText('No training is required for this person.')).toBeTruthy()
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
    await renderServer(
      EmployeePage({ params: params({ externalId: 'E0001' }), searchParams: params({}) })
    )
    expect(screen.getByRole('heading', { name: 'Team' })).toBeTruthy()
    expect(screen.getByText('2 direct reports who have not left')).toBeTruthy()
    // One bar, the breakdown, with the share and the count over it.
    expect(screen.getByText(/^66\s?%\s·\s2 of 3$/)).toBeTruthy()
    expect(screen.getAllByRole('img', { name: /^Team/ })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Adámek Petr' }).getAttribute('href')).toBe(
      '/employees/E0002'
    )
    expect(screen.getByText('Nothing required')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'All direct reports in the list' }).getAttribute('href')
    ).toBe('/employees?manager=E0153')
    // The person's own position and department link to their pages: under the name, and in
    // the profile.
    const header = screen.getByRole('heading', { level: 1 }).parentElement as HTMLElement
    expect(within(header).getByRole('link', { name: 'Laborantka' }).getAttribute('href')).toBe(
      '/positions/pos_lab'
    )
    expect(
      screen.getAllByRole('link', { name: 'Laboratoře' }).map(l => l.getAttribute('href'))
    ).toEqual(['/departments/dep_lab', '/departments/dep_lab'])
  })

  it('see no team card without reports', async () => {
    await renderServer(
      EmployeePage({ params: params({ externalId: 'E0153' }), searchParams: params({}) })
    )
    expect(screen.queryByRole('heading', { name: 'Team' })).toBeNull()
  })

  it('show what is required of someone who has left as nothing, since the day they left', async () => {
    vi.mocked(getEmployee).mockResolvedValueOnce(
      employeeDetail({ status: 'LEFT', leftOn: '2026-06-30', requirements: [] })
    )
    await renderServer(
      EmployeePage({ params: params({ externalId: 'E0153' }), searchParams: params({}) })
    )
    expect(screen.getByText('Left on 30.06.2026; nothing is required any more.')).toBeTruthy()
  })

  it('narrow the list to their reports, with a way back to everyone', async () => {
    vi.mocked(getPersonName).mockResolvedValue('Urbanová Tereza')
    await renderServer(EmployeesPage({ searchParams: at('/employees', { manager: 'E0001' }) }))
    expect(listEmployees).toHaveBeenCalledWith(expect.objectContaining({ manager: 'E0001' }))
    expect(getPersonName).toHaveBeenCalledWith('E0001')
    // A filter like the others, in the toolbar, that its own button removes.
    expect(
      within(screen.getByRole('search')).getByText(/Direct reports of Urbanová Tereza/)
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Remove this filter' }).getAttribute('href')).toBe(
      '/employees'
    )
    cleanup()
    // Nobody by that ID: the ID stands in.
    vi.mocked(getPersonName).mockResolvedValue(null)
    await renderServer(EmployeesPage({ searchParams: at('/employees', { manager: 'E9999' }) }))
    expect(screen.getByText(/Direct reports of E9999/)).toBeTruthy()
  })
})

describe('employee forms', () => {
  const props = { params: params({ externalId: 'E0153' }), searchParams: params({}) }
  beforeEach(() => {
    signInAs('ADMIN')
  })

  it('require an admin and an existing person', async () => {
    vi.mocked(getEmployeeForEdit).mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    await expect(renderServer(EditEmployeePage(props))).rejects.toThrow(NotFoundError)
    await expect(renderServer(NewCompletionPage(props))).rejects.toThrow(NotFoundError)
    vi.mocked(getCompletionForEdit).mockResolvedValueOnce(null)
    await expect(
      renderServer(EditCompletionPage({ params: params({ externalId: 'E0153', id: 'cmp_1' }) }))
    ).rejects.toThrow(NotFoundError)
    expect(requireAdminPage).toHaveBeenCalledTimes(3)
  })

  it('keep offering a manager who has left to the people they managed', async () => {
    vi.mocked(listEmployeeOptions).mockResolvedValue([])
    await renderServer(EditEmployeePage(props))
    expect(await editEmployeeMetadata(props)).toEqual({ title: 'Edit Marie Černá' })
    await userEvent.setup().click(screen.getByRole('combobox', { name: 'Manager' }))
    expect(screen.getByRole('option', { name: 'Urbanová Tereza' })).toBeTruthy()
  })

  it('edit the person with their current values; they cannot manage themselves', async () => {
    await renderServer(EditEmployeePage(props))
    expect(screen.getByRole('heading', { level: 1, name: 'Edit Marie Černá' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'First name' })).toHaveProperty('value', 'Marie')
    expect(screen.getByRole('combobox', { name: 'Department' }).textContent).toContain('Laboratoře')
    expect(screen.getByRole('link', { name: 'Back to Marie Černá' }).getAttribute('href')).toBe(
      '/employees/E0153'
    )
    await userEvent.setup().click(screen.getByRole('combobox', { name: 'Manager' }))
    expect(screen.queryByRole('option', { name: 'Černá Marie' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Urbanová Tereza' })).toBeTruthy()
  })

  it('add a person with an empty form, hired today', async () => {
    expect(await newMetadata()).toEqual({ title: 'New employee' })
    await renderServer(NewEmployeePage())
    expect(screen.getByRole('heading', { level: 1, name: 'New employee' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /First name/ })).toHaveProperty('value', '')
    expect(screen.getByText(/ID starting with N/)).toBeTruthy()
  })

  it('correct a completion of this person only', async () => {
    const completion = {
      id: 'cmp_1',
      externalId: 'Z000101',
      imported: true,
      employeeId: 'emp_E0153',
      courseId: 'course_old',
      // An archived course and provider stay the record's own, offered to it alone.
      course: {
        id: 'course_old',
        code: 'OLD-1',
        name: 'Starý kurz',
        validityMonths: 12,
        archived: true,
      },
      completedOn: '2025-11-05',
      validUntil: null,
      providerId: 'prov_old',
      provider: { id: 'prov_old', name: 'Zaniklá firma', archived: true },
      price: 450,
      note: null,
      // Someone who has left is not among the pickers' people, but keeps their records.
      employee: { id: 'emp_left', externalId: 'E0153', name: 'Černá Marie' },
    }
    vi.mocked(getCompletionForEdit).mockResolvedValue(completion)
    await renderServer(EditCompletionPage({ params: params({ externalId: 'E0153', id: 'cmp_1' }) }))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Edit completion Z000101 of Černá Marie' })
    ).toBeTruthy()
    expect(
      await editCompletionMetadata({ params: params({ externalId: 'E0153', id: 'cmp_1' }) })
    ).toEqual({ title: 'Edit completion Z000101 of Černá Marie' })
    expect(screen.getByText(/came from an import/)).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Price (Kč)' })).toHaveProperty('value', '450,00')
    expect(screen.getByRole('combobox', { name: /Course/ }).textContent).toContain('Starý kurz')
    expect(screen.getByRole('combobox', { name: /Provider/ }).textContent).toBe('Zaniklá firma')
    expect(screen.getByRole('combobox', { name: /Employee/ }).textContent).toBe('Černá Marie')
    expect(screen.getByText(/12 months from completion/)).toBeTruthy()
    // Under another person's address, the completion is not found.
    cleanup()
    await expect(
      renderServer(EditCompletionPage({ params: params({ externalId: 'E0001', id: 'cmp_1' }) }))
    ).rejects.toThrow(NotFoundError)
  })

  it('record a completion against the course list', async () => {
    await renderServer(NewCompletionPage(props))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Record completion for Marie Černá' })
    ).toBeTruthy()
    expect(await newCompletionMetadata(props)).toEqual({
      title: 'Record completion for Marie Černá',
    })
    expect(screen.getByRole('combobox', { name: /Course/ })).toBeTruthy()
  })
})

describe('employee filters on a phone', () => {
  it('fold the four selects behind one button that counts what is applied', async () => {
    await renderServer(
      EmployeesPage({ searchParams: params({ department: 'Laboratoře', status: 'ACTIVE' }) })
    )
    const toggle = screen.getByRole('button', { name: 'Filters (2)' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    expect(panel?.className).toContain('hidden')
    // From `sm` up the button hides and the selects sit in the row.
    expect(toggle.className).toContain('sm:hidden')
    expect(panel?.className).toContain('sm:contents')
    await userEvent.setup().click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    // Its chevron turns to say it is open.
    expect(toggle.querySelector('svg.lucide-chevron-down')?.getAttribute('class')).toContain(
      'rotate-180'
    )
    expect(panel?.className).not.toContain('hidden')
    expect(within(panel as HTMLElement).getAllByRole('combobox')).toHaveLength(4)
  })
})
