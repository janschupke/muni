// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as z from 'zod'

import { fieldErrors, type FormState } from '@/lib/form'
import { checkSessionSlotAction } from '@/server/actions/sessions'
import { expectNoAxeViolations } from '@/test/axe'
import { ONLINE, session } from '@/test/fixtures'
import { route, router } from '@/test/next'
import { renderClient } from '@/test/render'

import { BackLink } from './back-link'
import { CompletionHistoryTable } from './completion-tables'
import {
  CompletionForm,
  CourseForm,
  DepartmentForm,
  EmployeeForm,
  PositionForm,
} from './form/entity-forms'
import { SessionForm } from './form/session-form'
import { NavigationHistory, parseHistory, readHistory } from './navigation-history'
import { RequirementPanel } from './requirement-panel'
import { SessionTable } from './session-table'
import {
  ComplianceBadge,
  EmploymentBadge,
  OccupancyBadge,
  SessionStatusBadge,
} from './status-badges'

vi.mock('@/server/actions/sessions', () => ({ checkSessionSlotAction: vi.fn() }))

const HISTORY = 'muni.history'
afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('forms', () => {
  const heading = { title: 'Edit course BOZP-Z' }

  it('put Cancel and Save on the heading row, and show errors and the pending state', async () => {
    const user = userEvent.setup()
    let finish: (state: FormState) => void = () => undefined
    const action = vi.fn(
      () =>
        new Promise<FormState>(resolve => {
          finish = resolve
        })
    )
    renderClient(
      <CourseForm
        action={action}
        cancelHref="/courses/BOZP-Z"
        heading={heading}
        departments={[{ id: 'dep_lab', name: 'Laboratoře' }]}
        positions={[{ id: 'pos_head', name: 'Vedoucí' }]}
        defaults={{
          name: 'BOZP',
          validityMonths: null,
          requiredForAll: false,
          departmentIds: ['dep_lab'],
          positionIds: [],
          sessionMinutes: 180,
          groupSize: null,
          onlineAllowed: true,
          derived: { sessionMinutes: 120, groupSize: 25, onlineAllowed: false },
          capabilities: ['PROJECTOR'],
        }}
      />
    )
    // The heading is part of the form, its actions on the right.
    const title = screen.getByRole('heading', { level: 1, name: 'Edit course BOZP-Z' })
    const header = title.closest('div')?.parentElement
    expect(within(header ?? document.body).getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Valid for (months)' })).toHaveProperty('value', '')
    // Who must hold it, and what a session needs.
    expect(screen.getByRole('group', { name: 'Who must hold it' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Laboratoře' }).getAttribute('aria-checked')).toBe(
      'true'
    )
    expect(screen.getByRole('checkbox', { name: 'Everyone' }).getAttribute('aria-checked')).toBe(
      'false'
    )
    // The needs override what past sessions say, which shows beside each.
    expect(screen.getByRole('combobox', { name: 'Can be held online' }).textContent).toBe('Yes')
    expect(screen.getByRole('textbox', { name: 'Group size' })).toHaveProperty('value', '')
    expect(screen.getByText('Empty: 25, from past sessions.')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /Session length/ })).toHaveProperty('value', '180')
    expect(screen.getByRole('checkbox', { name: 'Projector' }).getAttribute('aria-checked')).toBe(
      'true'
    )
    expect(screen.queryByRole('textbox', { name: /Code/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: 'Saving…' })).toHaveProperty('disabled', true)
    act(() => {
      finish({ status: 'error', fieldErrors: { name: 'required' }, formError: 'not_found' })
    })
    expect(await screen.findByText('This field is required.')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('The record no longer exists.')
    expect(screen.getByRole('textbox', { name: 'Name' }).getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe(
      '/courses/BOZP-Z'
    )
    await expectNoAxeViolations()
  })

  it('say at the top when fields below need a change', async () => {
    const user = userEvent.setup()
    renderClient(
      <CourseForm
        isNew
        action={() => Promise.resolve({ status: 'error', fieldErrors: { code: 'taken' } })}
        cancelHref="/courses"
        heading={{ title: 'New course' }}
        departments={[]}
        positions={[]}
        defaults={{
          name: '',
          validityMonths: null,
          requiredForAll: false,
          departmentIds: [],
          positionIds: [],
          sessionMinutes: null,
          groupSize: null,
          onlineAllowed: null,
          derived: { sessionMinutes: null, groupSize: null, onlineAllowed: false },
          capabilities: [],
        }}
      />
    )
    expect(screen.getAllByText('Empty: not known from sessions yet.')).toHaveLength(2)
    expect(screen.getByRole('combobox', { name: 'Can be held online' }).textContent).toBe(
      'From sessions (no)'
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Some fields need a change; each says what below.')).toBeTruthy()
    expect(screen.getByText('Another record already uses this.')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /Code/ }).getAttribute('aria-invalid')).toBe('true')
  })

  it('fill empty optional values as blanks, and dates and times through the pickers', () => {
    const action = vi.fn()
    const { container } = renderClient(
      <>
        <EmployeeForm
          action={action}
          cancelHref="/employees/E0153"
          heading={{ title: 'Edit Marie Černá' }}
          departments={[{ id: 'dep_lab', name: 'Laboratoře' }]}
          positions={[{ id: 'pos_lab', name: 'Laborantka' }]}
          positionsByDepartment={{ dep_lab: ['pos_lab'] }}
          heads={{}}
          managers={[{ id: 'emp_E0001', name: 'Urbanová Tereza' }]}
          defaults={{
            firstName: 'Marie',
            lastName: 'Černá',
            email: null,
            nationalId: null,
            departmentId: 'dep_lab',
            positionId: null,
            managerId: 'emp_E0001',
            leadsDepartment: false,
            hiredOn: '2019-03-01',
            leftOn: null,
            status: 'ACTIVE',
            note: null,
          }}
        />
        <SessionForm
          action={action}
          cancelHref="/sessions/T016"
          heading={{ title: 'Edit T016' }}
          rooms={[ROOMS.aula, ROOMS.online]}
          courses={[COURSES.bozp]}
          named={1}
          defaults={{
            courseId: 'course_bozp',
            date: '2026-11-04',
            startTime: '08:00',
            endTime: '11:00',
            roomId: 'room_online',
            capacity: 30,
            unnamedBookings: 29,
            pricePerPerson: null,
            status: 'PLANNED',
          }}
        />
        <CompletionForm
          action={action}
          cancelHref="/employees/E0153"
          heading={{ title: 'Edit completion' }}
          employees={[{ id: 'emp_E0153', name: 'Černá Marie' }]}
          courses={[
            { id: 'course_gdpr', code: 'GDPR', name: 'Ochrana osobních údajů', validityMonths: 36 },
          ]}
          providers={[{ id: 'prov_1', name: 'Bezpečná firma s.r.o.' }]}
          defaults={{
            employeeId: 'emp_E0153',
            courseId: 'course_gdpr',
            completedOn: '2026-10-16',
            validUntil: null,
            providerId: null,
            price: null,
            note: null,
            imported: true,
          }}
        />
      </>
    )
    const posted = (name: string) =>
      container.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)?.value
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveProperty('value', '')
    expect(screen.getByRole('combobox', { name: 'Manager' }).textContent).toContain('Urbanová')
    expect(posted('managerId')).toBe('emp_E0001')
    expect(screen.getByRole('textbox', { name: 'Left' })).toHaveProperty('value', '')
    expect(screen.getByRole('textbox', { name: /Hired/ })).toHaveProperty('value', '3/1/2019')
    expect(posted('hiredOn')).toBe('2019-03-01')
    expect(screen.getByRole('button', { name: 'Choose Hired from a calendar' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /Room/ }).textContent).toContain('Online')
    expect(screen.getAllByRole('combobox', { name: /Course/ })).toHaveLength(2)
    expect(posted('courseId')).toBe('course_bozp')
    expect(screen.getByText(/1 person booked by name stays booked/)).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /Start/ })).toHaveProperty('value', '08:00')
    expect(screen.getByRole('button', { name: 'Choose Start from a list' })).toBeTruthy()
    expect(posted('date')).toBe('2026-11-04')
    expect(screen.getByText('Plus 1 person booked by name.')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Price per person (CZK)' })).toHaveProperty(
      'value',
      ''
    )
    expect(posted('completedOn')).toBe('2026-10-16')
    expect(posted('employeeId')).toBe('emp_E0153')
    expect(screen.getByText(/came from an import/)).toBeTruthy()
    expect(
      screen.getByText('Leave empty for 36 months from completion, as the course says.')
    ).toBeTruthy()
  })

  it('map every zod issue to one message per field', () => {
    const input = { a: 'x', b: 'y' }
    const result = z.object({ a: z.string().min(3), b: z.number() }).safeParse(input)
    if (result.success) throw new Error('expected a failure')
    const withDuplicate = new z.ZodError([
      ...result.error.issues,
      // A second issue on a field already reported, and one on the whole form.
      { code: 'custom', path: ['a'], message: 'second', input: undefined },
      { code: 'custom', path: [], message: 'mystery', input: undefined },
    ])
    expect(fieldErrors(withDuplicate, input)).toEqual({
      status: 'error',
      // A refinement without a path belongs to the form; an unknown code becomes generic.
      fieldErrors: { a: 'too_small', b: 'invalid_type', form: 'invalid_format' },
    })
  })
})

const ROOMS = {
  aula: {
    id: 'room_aula_a',
    name: 'Aula A',
    kind: 'CLASSROOM' as const,
    capacity: 30,
    capabilities: ['PROJECTOR' as const],
  },
  small: {
    id: 'room_small',
    name: 'Malá',
    kind: 'CLASSROOM' as const,
    capacity: 12,
    capabilities: ['PROJECTOR' as const],
  },
  lab: { id: 'room_lab', name: 'Lab', kind: 'LAB' as const, capacity: 40, capabilities: [] },
  online: {
    id: 'room_online',
    name: 'Online',
    kind: 'ONLINE' as const,
    capacity: null,
    capabilities: [],
  },
}
const COURSES = {
  bozp: {
    id: 'course_bozp',
    code: 'BOZP-Z',
    name: 'BOZP – základní školení',
    validityMonths: 24,
    needs: { sessionMinutes: 180, groupSize: 20, onlineAllowed: true, capabilities: [] },
  },
  fire: {
    id: 'course_poz',
    code: 'POZ-OCH',
    name: 'Požární ochrana',
    validityMonths: 24,
    needs: {
      sessionMinutes: 120,
      groupSize: null,
      onlineAllowed: false,
      capabilities: ['PROJECTOR' as const],
    },
  },
}

/** Opens a select by its label and picks an option. */
async function choose(user: ReturnType<typeof userEvent.setup>, label: RegExp, option: RegExp) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('the session form checks itself as the user types', () => {
  const renderForm = (over: Partial<Parameters<typeof SessionForm>[0]> = {}) =>
    renderClient(
      <SessionForm
        mode="create"
        action={vi.fn()}
        cancelHref="/sessions"
        heading={{ title: 'New session' }}
        rooms={[ROOMS.aula, ROOMS.small, ROOMS.lab, ROOMS.online]}
        courses={[COURSES.bozp, COURSES.fire]}
        defaults={{
          courseId: 'course_bozp',
          date: '2027-03-01',
          startTime: '09:00',
          endTime: '12:00',
          roomId: '',
          capacity: 20,
          unnamedBookings: 0,
          pricePerPerson: null,
          status: 'PLANNED',
        }}
        {...over}
      />
    )
  const capacity = () => screen.getByRole('textbox', { name: /Capacity/ })

  it('lets the seats follow the room until the user types them, then checks them', async () => {
    vi.mocked(checkSessionSlotAction).mockResolvedValue(null)
    const user = userEvent.setup()
    renderForm()
    // A room's option says what it holds; the seats follow the course's group in the room.
    await choose(user, /Room/, /Aula A · 30 seats/)
    expect(capacity()).toHaveProperty('value', '20')
    expect(screen.getByText('The room holds 30 seats.')).toBeTruthy()
    await choose(user, /Room/, /Malá · 12 seats/)
    expect(capacity()).toHaveProperty('value', '12')
    // Typed seats stay; the room that cannot hold them says so, and the option too.
    await user.clear(capacity())
    await user.type(capacity(), '25')
    expect(await screen.findByText('Malá holds 12; this session opens 25.')).toBeTruthy()
    expect(capacity().getAttribute('aria-invalid')).toBe('true')
    await choose(user, /Room/, /Aula A/)
    expect(capacity()).toHaveProperty('value', '25')
    expect(screen.queryByText(/this session opens/)).toBeNull()
    await user.click(screen.getByRole('combobox', { name: /Room/ }))
    expect(screen.getByRole('option', { name: /Malá · 12 seats · too small/ })).toBeTruthy()
    await user.keyboard('{Escape}')
    // Picked last, the room carries the error.
    await choose(user, /Room/, /Malá/)
    expect(screen.getByRole('combobox', { name: /Room/ }).getAttribute('aria-invalid')).toBe('true')
  })

  it('checks the room against the course, the end against the start, and asks if the room is free', async () => {
    vi.mocked(checkSessionSlotAction).mockResolvedValue('ROOM_BUSY')
    const user = userEvent.setup()
    renderForm({ defaults: { ...defaultsOf('room_lab'), courseId: 'course_poz' } })
    expect(screen.getByText('Lab lacks: Projector.')).toBeTruthy()
    await choose(user, /Room/, /Online/)
    expect(screen.getByText('This course is not held online.')).toBeTruthy()
    await choose(user, /Course/, /BOZP-Z/)
    expect(screen.queryByText('This course is not held online.')).toBeNull()
    // An online room is never taken; a real one is asked about, after a pause.
    expect(checkSessionSlotAction).not.toHaveBeenCalled()
    await choose(user, /Room/, /Aula A/)
    expect(
      await screen.findByText(
        'Another planned session uses this room at that time.',
        {},
        { timeout: 2000 }
      )
    ).toBeTruthy()
    expect(checkSessionSlotAction).toHaveBeenLastCalledWith(
      { roomId: 'room_aula_a', date: '2027-03-01', startTime: '09:00', endTime: '12:00' },
      null
    )
    const end = screen.getByRole('textbox', { name: /^End/ })
    await user.clear(end)
    await user.type(end, '08:00')
    await user.tab()
    expect(await screen.findByText('The end must be after the start.')).toBeTruthy()
  })

  it('keeps the seats at or above the bookings when editing', async () => {
    vi.mocked(checkSessionSlotAction).mockResolvedValue(null)
    const user = userEvent.setup()
    renderForm({
      mode: 'edit',
      self: 'T016',
      named: 3,
      defaults: { ...defaultsOf('room_aula_a'), capacity: 10, unnamedBookings: 5 },
    })
    expect(screen.getByText(/8 seats are booked\./)).toBeTruthy()
    await user.clear(capacity())
    await user.type(capacity(), '6')
    expect(
      await screen.findByText('8 seats are booked; the session cannot open fewer.')
    ).toBeTruthy()
    const unnamed = screen.getByRole('textbox', { name: /Other bookings/ })
    await user.clear(capacity())
    await user.type(capacity(), '10')
    await user.clear(unnamed)
    await user.type(unnamed, '9')
    // Changed last, the unnamed seats carry the error (12 booked, 10 seats).
    expect(unnamed.getAttribute('aria-invalid')).toBe('true')
    expect(capacity().getAttribute('aria-invalid')).not.toBe('true')
    expect(screen.getByText('12 seats are booked; the session cannot open fewer.')).toBeTruthy()
    await expectNoAxeViolations()
  })
})

function defaultsOf(roomId: string) {
  return {
    courseId: 'course_bozp',
    date: '2027-03-01',
    startTime: '09:00',
    endTime: '12:00',
    roomId,
    capacity: 10,
    unnamedBookings: 0,
    pricePerPerson: null,
    status: 'PLANNED',
  }
}

describe('the person form keeps department, position and head together', () => {
  it('offers the department’s positions and hands over its lead knowingly', async () => {
    const user = userEvent.setup()
    const { container } = renderClient(
      <EmployeeForm
        action={vi.fn()}
        cancelHref="/employees/E0153"
        heading={{ title: 'Edit Marie Černá' }}
        departments={[
          { id: 'dep_lab', name: 'Laboratoře' },
          { id: 'dep_lib', name: 'Knihovna' },
        ]}
        positions={[
          { id: 'pos_lab', name: 'Laborantka' },
          { id: 'pos_ref', name: 'Referent' },
        ]}
        positionsByDepartment={{ dep_lab: ['pos_lab', 'pos_ref'], dep_lib: ['pos_ref'] }}
        heads={{ dep_lib: 'Malá Dana' }}
        managers={[]}
        defaults={{
          firstName: 'Marie',
          lastName: 'Černá',
          email: null,
          nationalId: null,
          departmentId: 'dep_lab',
          positionId: 'pos_lab',
          managerId: null,
          leadsDepartment: true,
          hiredOn: '2019-03-01',
          leftOn: null,
          status: 'ACTIVE',
          note: null,
        }}
      />
    )
    const posted = (name: string) =>
      container.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value
    const leads = () => screen.getByRole('checkbox', { name: 'Leads the department' })
    expect(leads().getAttribute('aria-checked')).toBe('true')
    // The library has no "Laborantka": the position clears, and so does the lead.
    await choose(user, /Department/, /Knihovna/)
    expect(posted('positionId')).toBe('')
    expect(screen.getByText(/does not have the previous position/)).toBeTruthy()
    expect(leads().getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('Led by Malá Dana.')).toBeTruthy()
    await user.click(screen.getByRole('combobox', { name: /Position/ }))
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['—', 'Referent'])
    await user.keyboard('{Escape}')
    await user.click(leads())
    expect(
      screen.getByText(/Malá Dana leads it now; saving makes this person the head/)
    ).toBeTruthy()
    // No department, no lead.
    await choose(user, /Department/, /—/)
    expect(leads().hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Choose a department first.')).toBeTruthy()
  })
})

describe('the completion form names a new provider only on purpose', () => {
  it('reveals the name field for "New provider…"', async () => {
    const user = userEvent.setup()
    const { container } = renderClient(
      <CompletionForm
        action={vi.fn()}
        cancelHref="/employees/E0153"
        heading={{ title: 'Record completion' }}
        employees={[{ id: 'emp_E0153', name: 'Černá Marie' }]}
        courses={[{ id: 'course_lead', code: 'LEAD', name: 'Vedení', validityMonths: null }]}
        providers={[{ id: 'prov_1', name: 'Bezpečná firma s.r.o.' }]}
        defaults={{
          employeeId: 'emp_E0153',
          courseId: 'course_lead',
          completedOn: '2026-10-16',
          validUntil: null,
          providerId: 'prov_1',
          price: null,
          note: null,
          imported: false,
        }}
      />
    )
    expect(screen.queryByRole('textbox', { name: /New provider/ })).toBeNull()
    expect(screen.getByText('Leave empty: the course never expires.')).toBeTruthy()
    await choose(user, /Provider/, /New provider…/)
    expect(screen.getByRole('textbox', { name: /New provider's name/ })).toBeTruthy()
    expect(container.querySelector<HTMLInputElement>('input[name="providerId"]')?.value).toBe('new')
    await choose(user, /Provider/, /Bezpečná firma/)
    expect(screen.queryByRole('textbox', { name: /New provider/ })).toBeNull()
  })
})

describe('department and position forms', () => {
  it('pick a head among the members, and the departments a position exists in', () => {
    renderClient(
      <>
        <DepartmentForm
          action={vi.fn()}
          cancelHref="/departments/dep_lab"
          heading={{ title: 'Edit Laboratoře' }}
          members={[{ id: 'emp_1', name: 'Novák Jan' }]}
          defaults={{ name: 'Laboratoře', headId: 'emp_1' }}
        />
        <DepartmentForm
          action={vi.fn()}
          cancelHref="/departments"
          heading={{ title: 'New department' }}
          members={[]}
          defaults={{ name: '', headId: null }}
        />
        <PositionForm
          action={vi.fn()}
          cancelHref="/positions/pos_ref"
          heading={{ title: 'Edit Referent' }}
          departments={[
            { id: 'dep_lab', name: 'Laboratoře' },
            { id: 'dep_lib', name: 'Knihovna' },
          ]}
          defaults={{ name: 'Referent', departmentIds: ['dep_lib'] }}
        />
      </>
    )
    expect(screen.getAllByRole('combobox', { name: 'Head' })[0]?.textContent).toBe('Novák Jan')
    expect(screen.getByText('Nobody works here yet; set the head once someone does.')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Knihovna' }).getAttribute('aria-checked')).toBe(
      'true'
    )
    expect(screen.getByRole('checkbox', { name: 'Laboratoře' }).getAttribute('aria-checked')).toBe(
      'false'
    )
  })
})

describe('back links', () => {
  const store = (entries: { href: string; title: string | null }[]) => {
    sessionStorage.setItem(HISTORY, JSON.stringify(entries))
  }

  it('fall back to the parent page without history', () => {
    renderClient(<BackLink fallback={{ href: '/employees', label: 'Employees' }} />)
    expect(screen.getByRole('link', { name: 'Back to Employees' }).getAttribute('href')).toBe(
      '/employees'
    )
  })

  it('name the page the visitor came from, filters included, and go back for real', async () => {
    const user = userEvent.setup()
    route.pathname = '/employees/E0153'
    store([
      { href: '/employees?department=Laborato%C5%99e', title: 'Employees · Training register' },
      { href: '/employees/E0153', title: 'Marie Černá · Training register' },
    ])
    renderClient(<BackLink fallback={{ href: '/employees', label: 'Employees' }} />)
    const link = await screen.findByRole('link', { name: 'Back to Employees' })
    expect(link.getAttribute('href')).toBe('/employees?department=Laborato%C5%99e')
    await user.click(link)
    expect(router.back).toHaveBeenCalled()
  })

  it('skip forms, call the overview by name, and use the fallback label for untitled pages', async () => {
    route.pathname = '/employees/E0153'
    route.search = 'tab=history'
    store([
      { href: '/', title: 'Training register' },
      { href: '/employees/E0153/edit', title: 'Edit · Training register' },
      { href: '/employees/E0153?tab=history', title: null },
    ])
    renderClient(<BackLink fallback={{ href: '/employees', label: 'Employees' }} />)
    expect(
      (await screen.findByRole('link', { name: 'Back to Overview' })).getAttribute('href')
    ).toBe('/')
    act(() => {
      store([{ href: '/courses', title: null }])
      window.dispatchEvent(new Event('muni:history'))
    })
    expect(await screen.findByRole('link', { name: 'Back to Employees' })).toBeTruthy()
  })
})

describe('navigation history', () => {
  it('records each page and its title in this tab', async () => {
    route.pathname = '/courses'
    document.title = 'Courses · Training register'
    window.history.replaceState(null, '', '/courses')
    renderClient(
      <NavigationHistory>
        <p>Obsah</p>
      </NavigationHistory>
    )
    expect(screen.getByText('Obsah')).toBeTruthy()
    await waitFor(() => {
      expect(parseHistory(readHistory())).toEqual([
        { href: '/courses', title: 'Courses · Training register' },
      ])
    })
    // A title that changes later is picked up; one seen on another URL is not.
    document.title = 'Kurzy · Registr školení'
    await waitFor(() => {
      expect(parseHistory(readHistory())[0]?.title).toBe('Kurzy · Registr školení')
    })
    window.history.replaceState(null, '', '/elsewhere')
    document.title = 'Elsewhere'
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(parseHistory(readHistory())[0]?.title).toBe('Kurzy · Registr školení')
  })

  it('survives blocked storage and junk in it', () => {
    sessionStorage.setItem(HISTORY, '{not json')
    expect(parseHistory(readHistory())).toEqual([])
    sessionStorage.setItem(HISTORY, '{"an":"object"}')
    expect(parseHistory(readHistory())).toEqual([])
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readHistory()).toBeNull()
    renderClient(
      <NavigationHistory>
        <p>Pořád funguje</p>
      </NavigationHistory>
    )
    expect(screen.getByText('Pořád funguje')).toBeTruthy()
  })
})

describe('badges and small panels', () => {
  it('label every state with an icon and text', () => {
    renderClient(
      <>
        <ComplianceBadge status={null} />
        <EmploymentBadge status="PARENTAL_LEAVE" />
        <SessionStatusBadge status="CANCELLED" />
        <OccupancyBadge booked={3} capacity={10} />
        <RequirementPanel requirements={[]} />
      </>
    )
    expect(screen.getByText('Nothing required')).toBeTruthy()
    expect(screen.getByText('Parental leave')).toBeTruthy()
    expect(screen.getByText('Cancelled')).toBeTruthy()
    expect(screen.queryByText('Full')).toBeNull()
    expect(screen.queryByText('Almost full')).toBeNull()
    expect(screen.getByText('Nothing is required of this person.')).toBeTruthy()
  })

  it('show a requirement never completed, and one without a booking', () => {
    renderClient(
      <RequirementPanel
        requirements={[
          {
            courseCode: 'GDPR',
            courseName: 'Ochrana osobních údajů',
            status: 'MISSING',
            completedOn: null,
            validUntil: null,
            daysLeft: null,
            booked: null,
          },
          {
            courseCode: 'BOZP-Z',
            courseName: 'BOZP – základní školení',
            status: 'EXPIRING',
            completedOn: '2024-11-01',
            validUntil: '2026-11-01',
            daysLeft: null,
            booked: null,
          },
        ]}
      />
    )
    const missing = screen.getByRole('row', { name: /Ochrana/ })
    expect(within(missing).getAllByText('—')).toHaveLength(3)
    expect(screen.getByText('Nov 1, 2026')).toBeTruthy()
  })
})

describe('seat occupancy', () => {
  it.each([
    [24, 30, 'Almost full', 'text-warning-fg', 'bg-warning-fill'],
    [30, 30, 'Full', 'text-warning-fg', 'bg-warning-fill'],
    [31, 30, 'Overbooked', 'text-danger-fg', 'bg-danger-fill'],
  ])(
    '%i of %i is “%s” in its signal colour, badge and meter alike',
    (booked, capacity, label, ink, fill) => {
      renderClient(
        <SessionTable
          sessions={[session({ bookedCount: booked, unnamedBookings: booked - 1, capacity })]}
          canEdit={false}
        />
      )
      expect(screen.getByText(label).className).toContain(ink)
      expect(screen.getByRole('meter').firstElementChild?.className).toContain(fill)
    }
  )

  it('stays brand blue and unlabelled while there is room', () => {
    renderClient(
      <SessionTable
        sessions={[session({ bookedCount: 23, unnamedBookings: 22, capacity: 30 })]}
        canEdit={false}
      />
    )
    expect(screen.getByRole('meter').firstElementChild?.className).toContain('bg-accent')
    expect(screen.queryByText(/full|Overbooked/i)).toBeNull()
  })
})

describe('tables', () => {
  it('sort a person’s history and show notes only when asked', async () => {
    const user = userEvent.setup()
    const completions = [
      {
        id: 'cmp_Z1',
        externalId: 'Z1',
        courseCode: 'GDPR',
        courseName: 'Ochrana osobních údajů',
        courseArchived: false,
        completedOn: '2025-11-05',
        validUntil: null,
        provider: null,
        price: 600,
        note: 'online',
      },
      {
        id: 'cmp_Z2',
        externalId: 'Z2',
        courseCode: 'BOZP-Z',
        courseName: 'BOZP – základní školení',
        courseArchived: false,
        completedOn: '2024-09-01',
        validUntil: '2026-09-01',
        provider: { id: 'prov_bezpecna', name: 'Bezpečná firma s.r.o.', archived: false },
        price: null,
      },
      {
        id: 'cmp_Z3',
        externalId: 'Z3',
        courseCode: 'STARY',
        courseName: 'Zrušený kurz',
        courseArchived: true,
        completedOn: '2023-01-01',
        validUntil: null,
        provider: { id: 'prov_old', name: 'Bývalý dodavatel', archived: true },
        price: null,
      },
    ]
    renderClient(<CompletionHistoryTable completions={completions} showNotes />)
    expect(screen.getByText('online')).toBeTruthy()
    expect(screen.getAllByText('No expiry')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Bezpečná firma s.r.o.' }).getAttribute('href')).toBe(
      '/providers/prov_bezpecna'
    )
    // Archived course and provider: named, muted, not linked.
    expect(screen.getByText('Zrušený kurz').closest('a')).toBeNull()
    expect(screen.getByText('Bývalý dodavatel').closest('a')).toBeNull()
    expect(screen.getAllByText('(archived)', { exact: false })).toHaveLength(2)
    for (const header of ['Course', 'Completed', 'Valid until', 'Provider', 'Price'])
      await user.click(screen.getByRole('button', { name: header }))
    expect(screen.getAllByRole('row')).toHaveLength(4)
  })

  it('sort sessions by date and place, and show only the essentials when compact', async () => {
    const user = userEvent.setup()
    renderClient(
      <SessionTable
        sessions={[
          session(),
          session({ externalId: 'T020', room: ONLINE, capacity: 0, bookedCount: 0 }),
        ]}
        canEdit={false}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Date' }))
    await user.click(screen.getByRole('button', { name: 'Location' }))
    await user.click(screen.getByRole('button', { name: 'Booked' }))
    expect(screen.getAllByRole('row')).toHaveLength(3)

    renderClient(<SessionTable sessions={[session({ status: 'CANCELLED' })]} canEdit compact />)
    const compact = screen.getAllByRole('table').at(-1) as HTMLElement
    expect(within(compact).queryByText('Aula A')).toBeNull()
    expect(within(compact).queryByRole('link', { name: /Edit session/ })).toBeNull()
  })
})
