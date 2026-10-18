// @vitest-environment jsdom
import { EMPLOYMENT_STATES, SESSION_STATUSES } from '@muni/domain/enums'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as z from 'zod'

import { fieldErrors, type FormState } from '@/lib/form'
import { checkSessionSlotAction } from '@/server/actions/sessions'
import { expectNoAxeViolations } from '@/test/axe'
import { AULA_A, EXTERNAL, INTERNAL, ONLINE, session } from '@/test/fixtures'
import { navigate, route, router } from '@/test/next'
import { renderClient } from '@/test/render'

import { BackLink } from './back-link'
import { CompletionHistoryTable } from './completion-tables'
import { ConfirmDialog, type ConfirmOutcome } from './confirm-dialog'
import { CompletionForm } from './form/completion-form'
import { CourseForm } from './form/course-form'
import { EmployeeForm } from './form/employee-form'
import { DepartmentForm, PositionForm } from './form/group-forms'
import { type SessionDefaults, SessionForm } from './form/session-form'
import { NavigationHistory, parseHistory, readHistory } from './navigation-history'
import { RequirementPanel } from './requirement-panel'
import { SessionTable } from './session-table'
import {
  AdvisorSkeleton,
  ArchivedRecordSkeleton,
  DashboardSkeleton,
  DetailSkeleton,
  FormSkeleton,
  ImportSkeleton,
  ListSkeleton,
  LoadingRegion,
  PlannerSkeleton,
} from './skeletons'
import {
  ComplianceBadge,
  EmploymentBadge,
  OccupancyBadge,
  RoleBadge,
  SessionStatusBadge,
} from './status-badges'

/** Tables rendered on their own here sort and page their rows in the browser. */
const LOCAL = { local: 'the rows a test gives' }

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
          seats: null,
          onlineAllowed: true,
          capabilities: ['PROJECTOR'],
        }}
      />
    )
    // The heading is part of the form, its actions on the right.
    const title = screen.getByRole('heading', { level: 1, name: 'Edit course BOZP-Z' })
    const header = title.closest('div')?.parentElement
    expect(
      within(header ?? document.body).getByRole('button', { name: 'Save changes' })
    ).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Valid for (months)' })).toHaveProperty('value', '')
    // Who must hold it, and what a session needs.
    expect(screen.getByRole('group', { name: 'Who must hold it' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Laboratoře' }).getAttribute('aria-checked')).toBe(
      'true'
    )
    expect(screen.getByRole('checkbox', { name: 'Everyone' }).getAttribute('aria-checked')).toBe(
      'false'
    )
    // What its sessions are: the course's own values, one each.
    expect(
      screen.getByRole('checkbox', { name: 'May be held online' }).getAttribute('aria-checked')
    ).toBe('true')
    expect(screen.getByRole('textbox', { name: 'Seats' })).toHaveProperty('value', '')
    expect(screen.getByRole('textbox', { name: /Length/ })).toHaveProperty('value', '180')
    expect(screen.getByRole('checkbox', { name: 'Projector' }).getAttribute('aria-checked')).toBe(
      'true'
    )
    expect(screen.queryByRole('textbox', { name: /Code/ })).toBeNull()
    // Nothing changed yet: nothing to save.
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveProperty('disabled', true)
    await user.type(screen.getByRole('textbox', { name: 'Valid for (months)' }), '24')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
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
          seats: null,
          onlineAllowed: false,
          capabilities: [],
        }}
      />
    )
    expect(
      screen.getByRole('checkbox', { name: 'May be held online' }).getAttribute('aria-checked')
    ).toBe('false')
    await user.type(screen.getByRole('textbox', { name: /Code/ }), 'bozp-n')
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'BOZP')
    await user.click(screen.getByRole('button', { name: 'Create course' }))
    expect(await screen.findByText('Some fields need a change; each says what below.')).toBeTruthy()
    expect(screen.getByText('Another record already uses this.')).toBeTruthy()
    const code = screen.getByRole('textbox', { name: /Code/ })
    expect(code.getAttribute('aria-invalid')).toBe('true')
    // The refused field has the focus; changing it clears the server's word on it.
    expect(document.activeElement).toBe(code)
    await user.type(code, '2')
    expect(screen.queryByText('Another record already uses this.')).toBeNull()
    expect(code).toHaveProperty('value', 'bozp-n2')
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
            providerId: INTERNAL.providerId,
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
    expect(screen.getByRole('textbox', { name: /Hired/ })).toHaveProperty('value', '01.03.2019')
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
    // The price is the provider's, shown, never typed; the end follows the start.
    expect(screen.getByRole('status', { name: 'Price per person' }).textContent).toBe('No price')
    expect(screen.getByRole('status', { name: 'End' }).textContent).toBe('11:00')
    expect(screen.queryByRole('textbox', { name: /^(End|Price per person)$/ })).toBeNull()
    expect(posted('completedOn')).toBe('2026-10-16')
    expect(posted('employeeId')).toBe('emp_E0153')
    expect(screen.getByText(/came from an import/)).toBeTruthy()
    expect(
      screen.getByText('Leave empty for 36 months from completion, as the course says.')
    ).toBeTruthy()
  })

  const person = {
    firstName: 'Marie',
    lastName: 'Černá',
    email: null,
    nationalId: null,
    departmentId: 'dep_lab',
    positionId: null,
    managerId: null,
    leadsDepartment: false,
    hiredOn: '2020-01-01',
    leftOn: null,
    status: 'ACTIVE',
    note: null,
  }
  const employeeForm = (action = vi.fn()) => (
    <EmployeeForm
      action={action}
      cancelHref="/employees/E0153"
      heading={{ title: 'Edit Marie Černá' }}
      departments={[{ id: 'dep_lab', name: 'Laboratoře' }]}
      positions={[{ id: 'pos_lab', name: 'Laborantka' }]}
      positionsByDepartment={{ dep_lab: ['pos_lab'] }}
      heads={{}}
      managers={[]}
      defaults={person}
    />
  )

  it('check fields as the user types: a required field emptied goes red at once', async () => {
    const user = userEvent.setup()
    renderClient(employeeForm())
    const first = screen.getByRole('textbox', { name: 'First name' })
    // The first field has the focus when the form opens.
    expect(document.activeElement).toBe(first)
    await user.clear(first)
    expect(first.getAttribute('aria-invalid')).toBe('true')
    expect(first.closest('[data-field]')?.getAttribute('data-dirty')).toBe('true')
    expect(screen.getByText('This field is required.')).toBeTruthy()
    await user.type(first, 'Jana')
    expect(first.getAttribute('aria-invalid')).toBeNull()
    expect(screen.queryByText('This field is required.')).toBeNull()
  })

  it('say a format is wrong once the field is left, then follow each keystroke', async () => {
    const user = userEvent.setup()
    renderClient(employeeForm())
    const email = screen.getByRole('textbox', { name: 'Email' })
    await user.type(email, 'jana')
    // Still typing: no verdict yet.
    expect(email.getAttribute('aria-invalid')).toBeNull()
    await user.tab()
    expect(email.closest('[data-field]')?.getAttribute('data-touched')).toBe('true')
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Enter an email address, such as jana.novakova@firma.cz.')).toBeTruthy()
    await user.type(email, '@firma.cz')
    expect(email.getAttribute('aria-invalid')).toBeNull()
  })

  it('keep Save off until something changed, and again once it is changed back', async () => {
    const user = userEvent.setup()
    renderClient(employeeForm())
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toHaveProperty('disabled', true)
    const note = screen.getByRole('textbox', { name: 'Note' })
    expect(note.getAttribute('placeholder')).toBe('Optional')
    await user.type(note, 'x')
    expect(save).toHaveProperty('disabled', false)
    await user.clear(note)
    expect(save).toHaveProperty('disabled', true)
    // Ticking a box is a change too.
    await user.click(screen.getByRole('checkbox', { name: 'Leads the department' }))
    expect(save).toHaveProperty('disabled', false)
  })

  it('not send a form with errors: every error shows, the first wrong field gets the focus', async () => {
    const user = userEvent.setup()
    const action = vi.fn()
    renderClient(employeeForm(action))
    await user.type(screen.getByRole('textbox', { name: 'Birth number' }), '12')
    await user.clear(screen.getByRole('textbox', { name: 'Last name' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(action).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Last name' }))
    expect(
      screen.getByText('Enter 6 digits, a slash if you like, then 3 or 4 digits.')
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
      fieldErrors: { a: 'too_small', b: 'not_a_number', form: 'invalid_format' },
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
    needs: { sessionMinutes: 180, seats: 20, onlineAllowed: true, capabilities: [] },
    offerings: [INTERNAL, EXTERNAL],
  },
  fire: {
    id: 'course_poz',
    code: 'POZ-OCH',
    name: 'Požární ochrana',
    validityMonths: 24,
    needs: {
      sessionMinutes: 120,
      seats: null,
      onlineAllowed: false,
      capabilities: ['PROJECTOR' as const],
    },
    offerings: [INTERNAL],
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
        isNew
        action={vi.fn()}
        cancelHref="/sessions"
        heading={{ title: 'New session' }}
        rooms={[ROOMS.aula, ROOMS.small, ROOMS.lab, ROOMS.online]}
        courses={[COURSES.bozp, COURSES.fire]}
        defaults={{
          courseId: 'course_bozp',
          providerId: INTERNAL.providerId,
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
  const capacity = () => screen.getByRole('textbox', { name: /^Seats/ })

  it('never changes the seats for a room: a room too small marks both fields', async () => {
    vi.mocked(checkSessionSlotAction).mockResolvedValue(null)
    const user = userEvent.setup()
    renderForm()
    const room = () => screen.getByRole('combobox', { name: /Room/ })
    // A room's option says what it holds; the seats stay as the course set them.
    await choose(user, /Room/, /Aula A · 30 seats/)
    expect(capacity()).toHaveProperty('value', '20')
    expect(screen.getByText('The course opens 20 seats. The room holds 30 seats.')).toBeTruthy()
    await choose(user, /Room/, /Malá · 12 seats/)
    expect(capacity()).toHaveProperty('value', '20')
    // Either a bigger room or fewer seats settles it: both say so.
    expect(screen.getAllByText('Malá holds 12; this session opens 20.')).toHaveLength(2)
    expect(capacity().getAttribute('aria-invalid')).toBe('true')
    expect(room().getAttribute('aria-invalid')).toBe('true')
    await user.click(room())
    expect(screen.getByRole('option', { name: /Malá · 12 seats · too small/ })).toBeTruthy()
    await user.keyboard('{Escape}')
    await user.clear(capacity())
    await user.type(capacity(), '12')
    expect(screen.queryByText(/this session opens/)).toBeNull()
    expect(room().getAttribute('aria-invalid')).toBeNull()
    // Typed seats stay through a change of room, too.
    await choose(user, /Room/, /Aula A/)
    expect(capacity()).toHaveProperty('value', '12')
  })

  it('does not send a form with a conflict: the first field at odds gets the focus', async () => {
    vi.mocked(checkSessionSlotAction).mockResolvedValue(null)
    const action = vi.fn()
    const user = userEvent.setup()
    renderForm({ action, defaults: { ...defaultsOf('room_small'), capacity: 20 } })
    await user.click(screen.getByRole('button', { name: 'Schedule session' }))
    expect(action).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: /Room/ }))
  })

  it('checks the room against the course, the end against the start, and asks if the room is free', async () => {
    vi.mocked(checkSessionSlotAction).mockResolvedValue('ROOM_BUSY')
    const user = userEvent.setup()
    renderForm({ defaults: { ...defaultsOf('room_lab'), courseId: 'course_poz' } })
    // Another room or another course settles it: both fields say so.
    expect(screen.getAllByText('Lab lacks: Projector.')).toHaveLength(2)
    expect(screen.getByRole('combobox', { name: /Course/ }).getAttribute('aria-invalid')).toBe(
      'true'
    )
    await choose(user, /Room/, /Online/)
    expect(screen.getAllByText('This course is not held online.')).toHaveLength(2)
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
    // The end is the course's length after the start, shown, not typed.
    const end = screen.getByRole('status', { name: /^End/ })
    expect(end.textContent).toBe('12:00')
    const start = screen.getByRole('textbox', { name: /^Start/ })
    await user.clear(start)
    await user.type(start, '1030')
    await user.tab()
    expect(end.textContent).toBe('13:30')
  })

  it('offers only the providers of the course, with their prices, and marks one that does not offer it', async () => {
    vi.mocked(checkSessionSlotAction).mockResolvedValue(null)
    const user = userEvent.setup()
    renderForm({ defaults: { ...defaultsOf('room_aula_a'), providerId: EXTERNAL.providerId } })
    const spaced = (text: string | null) => text?.replace(/\s/g, ' ')
    expect(spaced(screen.getByRole('status', { name: 'Price per person' }).textContent)).toBe(
      '600,00 Kč'
    )
    await user.click(screen.getByRole('combobox', { name: /Provider/ }))
    expect(screen.getAllByRole('option').map(o => spaced(o.textContent))).toEqual([
      'Interní školitel · 450,00 Kč · default',
      'Externí lektor · 600,00 Kč',
    ])
    await user.keyboard('{Escape}')
    // POZ-OCH is offered by the internal one only: the external one is marked on both fields.
    await choose(user, /Course/, /POZ-OCH/)
    expect(
      screen.getAllByText(
        'That provider does not offer the course. Choose one that does, or add the course to its offerings.'
      )
    ).toHaveLength(2)
    await choose(user, /Provider/, /Interní/)
    expect(screen.queryByText(/does not offer the course/)).toBeNull()
    // A course with no length: nothing to end by.
    renderForm({
      courses: [{ ...COURSES.bozp, needs: { ...COURSES.bozp.needs, sessionMinutes: null } }],
    })
    expect(screen.getAllByRole('status', { name: /^End/ }).at(-1)?.textContent).toBe(
      'The course has no length set yet.'
    )
  })

  it('keeps the seats at or above the bookings when editing', async () => {
    vi.mocked(checkSessionSlotAction).mockResolvedValue(null)
    const user = userEvent.setup()
    renderForm({
      isNew: false,
      self: 'T016',
      named: 3,
      defaults: { ...defaultsOf('room_aula_a'), capacity: 10, unnamedBookings: 5 },
    })
    expect(screen.getByText(/8 seats are booked\./)).toBeTruthy()
    await user.clear(capacity())
    await user.type(capacity(), '6')
    expect(
      await screen.findAllByText('8 seats are booked; the session cannot open fewer.')
    ).toHaveLength(2)
    const unnamed = screen.getByRole('textbox', { name: /Other bookings/ })
    await user.clear(capacity())
    await user.type(capacity(), '10')
    await user.clear(unnamed)
    await user.type(unnamed, '9')
    // More seats or fewer unnamed bookings settle it: both say so (12 booked, 10 seats).
    expect(unnamed.getAttribute('aria-invalid')).toBe('true')
    expect(capacity().getAttribute('aria-invalid')).toBe('true')
    expect(screen.getAllByText('12 seats are booked; the session cannot open fewer.')).toHaveLength(
      2
    )
    // Only named bookings left: the unnamed field has nothing to give.
    await user.clear(unnamed)
    await user.type(unnamed, '0')
    await user.clear(capacity())
    await user.type(capacity(), '2')
    expect(unnamed.getAttribute('aria-invalid')).toBeNull()
    expect(capacity().getAttribute('aria-invalid')).toBe('true')
    await expectNoAxeViolations()
  })
})

function defaultsOf(roomId: string): SessionDefaults {
  return {
    courseId: 'course_bozp',
    providerId: INTERNAL.providerId,
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
    const department = () => screen.getByRole('combobox', { name: /Department/ })
    const position = () => screen.getByRole('combobox', { name: /Position/ })
    expect(leads().getAttribute('aria-checked')).toBe('true')
    // The library has no "Laborantka": nothing changes by itself, both fields say why.
    await choose(user, /Department/, /Knihovna/)
    expect(posted('positionId')).toBe('pos_lab')
    expect(leads().getAttribute('aria-checked')).toBe('true')
    expect(
      screen.getAllByText(
        'Knihovna does not have the position Laborantka; choose one of its positions.'
      )
    ).toHaveLength(2)
    expect(department().getAttribute('aria-invalid')).toBe('true')
    expect(position().getAttribute('aria-invalid')).toBe('true')
    // Leading the library replaces its head, and the form says so.
    expect(
      screen.getByText(/Malá Dana leads it now; saving makes this person the head/)
    ).toBeTruthy()
    await user.click(position())
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([
      '—',
      'Laborantka · not in this department',
      'Referent',
    ])
    await user.click(screen.getByRole('option', { name: 'Referent' }))
    expect(position().getAttribute('aria-invalid')).toBeNull()
    expect(department().getAttribute('aria-invalid')).toBeNull()
    // No department while leading: the lead stays ticked and both fields say what is missing.
    await choose(user, /Department/, /—/)
    expect(leads().getAttribute('aria-checked')).toBe('true')
    expect(leads().hasAttribute('disabled')).toBe(false)
    expect(screen.getAllByText('Choose the department they lead.')).toHaveLength(2)
    await user.click(leads())
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
        courses={[
          { id: 'course_lead', code: 'LEAD', name: 'Vedení', validityMonths: null },
          { id: 'course_bozp', code: 'BOZP-Z', name: 'BOZP', validityMonths: 24 },
        ]}
        providers={[{ id: 'prov_1', name: 'Bezpečná firma s.r.o.' }]}
        defaults={{
          employeeId: 'emp_E0153',
          courseId: 'course_lead',
          completedOn: '2026-10-16',
          validUntil: '2027-10-16',
          providerId: 'prov_1',
          price: null,
          note: null,
          imported: false,
        }}
      />
    )
    expect(screen.queryByRole('textbox', { name: /New provider/ })).toBeNull()
    expect(screen.getByText('Leave empty: the course never expires.')).toBeTruthy()
    // Another course changes nothing else: the dates stay as they were.
    const form = container.querySelector('form')
    const posted = () => Object.fromEntries(form ? new FormData(form) : [])
    const before = posted()
    await choose(user, /^Course/, /BOZP-Z/)
    expect(posted()).toEqual({ ...before, courseId: 'course_bozp' })
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

describe('focus', () => {
  function Page() {
    const [shown, setShown] = useState(true)
    return (
      <NavigationHistory>
        <main id="main" tabIndex={-1}>
          <h1>Departments</h1>
          {shown && (
            <button
              type="button"
              onClick={() => {
                setShown(false)
              }}
            >
              Archive Laboratoře
            </button>
          )}
        </main>
      </NavigationHistory>
    )
  }

  it('stays on the page when the focused element leaves it, and starts a new page at its title', async () => {
    renderClient(<Page />)
    // The row is archived: its button goes, and focus goes to the main region, not the body.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Archive Laboratoře' }))
    await waitFor(() => {
      expect(document.activeElement?.id).toBe('main')
    })
    act(() => {
      navigate('/positions')
    })
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Departments' }))
    })
    navigate('/')
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
        <RequirementPanel person={PERSON} requirements={[]} canBook />
      </>
    )
    expect(screen.getByText('Nothing required')).toBeTruthy()
    expect(screen.getByText('Parental leave')).toBeTruthy()
    expect(screen.getByText('Cancelled')).toBeTruthy()
    expect(screen.queryByText('Full')).toBeNull()
    expect(screen.queryByText('Almost full')).toBeNull()
    expect(screen.getByText('Nothing is required of this person.')).toBeTruthy()
  })

  it('never wear the brand blue for a state; a role does', () => {
    renderClient(
      <>
        {EMPLOYMENT_STATES.map(state => (
          <EmploymentBadge key={state} status={state} />
        ))}
        {SESSION_STATUSES.map(state => (
          <SessionStatusBadge key={state} status={state} />
        ))}
        <RoleBadge value="ADMIN" />
      </>
    )
    const badges = [...document.querySelectorAll('span')].filter(b =>
      b.className.includes('rounded-sm border')
    )
    const admin = screen.getByText('Admin')
    expect(admin.className).toContain('bg-accent-soft')
    for (const badge of badges.filter(b => b !== admin))
      expect(badge.className, badge.textContent).not.toContain('accent')
  })

  it('show a requirement never completed, and one without a booking, each to book', () => {
    renderClient(
      <RequirementPanel
        person={PERSON}
        canBook
        requirements={[
          {
            courseCode: 'GDPR',
            courseName: 'Ochrana osobních údajů',
            status: 'MISSING',
            completedOn: null,
            validUntil: null,
            daysLeft: null,
            booked: null,
            opening: 'OPEN' as const,
          },
          {
            courseCode: 'BOZP-Z',
            courseName: 'BOZP – základní školení',
            status: 'EXPIRING',
            completedOn: '2024-11-01',
            validUntil: '2026-11-01',
            daysLeft: null,
            booked: null,
            opening: 'OPEN' as const,
          },
        ]}
      />
    )
    const missing = screen.getByRole('row', { name: /Ochrana/ })
    expect(within(missing).getAllByText('—')).toHaveLength(3)
    expect(screen.getByText('01.11.2026')).toBeTruthy()
    // Missing and expiring, nothing booked: both can be booked from here.
    expect(
      screen.getAllByRole('button', { name: /^Book .* for Černá Marie…$/ }).map(b => b.textContent)
    ).toEqual(['Book…', 'Book…'])
  })

  it('say why a needed training cannot be booked, offer to cancel a booking, and nothing for a valid one', () => {
    const requirement = {
      courseCode: 'GDPR',
      courseName: 'Ochrana osobních údajů',
      status: 'EXPIRED' as const,
      completedOn: '2023-01-01',
      validUntil: '2025-01-01',
      daysLeft: -300,
      booked: null,
      opening: 'OPEN' as const,
    }
    const reasonOf = (button: HTMLElement) =>
      document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent
    const book = () => screen.getByRole('button', { name: /^Book .+ for Černá Marie…$/ })
    // On leave, no session, every one full: in its place, dimmed, saying why.
    for (const [status, opening, reason] of [
      ['PARENTAL_LEAVE', 'OPEN', 'On parental leave: nothing to book until they are back'],
      ['ACTIVE', 'NONE', 'No session of this course is scheduled'],
      ['ACTIVE', 'FULL', 'Every session of this course is full'],
    ] as const) {
      const { unmount } = renderClient(
        <RequirementPanel
          person={{ ...PERSON, status }}
          canBook
          requirements={[{ ...requirement, opening }]}
        />
      )
      expect(book().getAttribute('aria-disabled')).toBe('true')
      expect(reasonOf(book())).toBe(reason)
      unmount()
    }
    // Booked: when and where, and the way to cancel it; valid: nothing to do.
    const { unmount } = renderClient(
      <RequirementPanel
        person={PERSON}
        canBook
        requirements={[
          {
            ...requirement,
            booked: {
              sessionExternalId: 'T016',
              startsAt: '2026-11-04T08:00:00Z',
              endsAt: '2026-11-04T11:00:00Z',
              room: AULA_A,
            },
          },
          { ...requirement, courseCode: 'X', status: 'VALID' },
        ]}
      />
    )
    expect(screen.queryByRole('button', { name: /^Book / })).toBeNull()
    expect(
      screen.getByRole('button', {
        name: 'Cancel the booking of Ochrana osobních údajů for Černá Marie',
      })
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Aula A' }).getAttribute('href')).toBe(
      '/rooms/room_aula_a'
    )
    unmount()
    // A reader is offered nothing.
    renderClient(<RequirementPanel person={PERSON} canBook={false} requirements={[requirement]} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

const PERSON = { externalId: 'E0153', name: 'Černá Marie', status: 'ACTIVE' as const }

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
          paging={LOCAL}
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
        paging={LOCAL}
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
    renderClient(<CompletionHistoryTable completions={completions} paging={LOCAL} showNotes />)
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
        paging={LOCAL}
        sessions={[
          session(),
          session({ externalId: 'T020', room: ONLINE, capacity: 0, bookedCount: 0 }),
        ]}
        canEdit={false}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Date' }))
    await user.click(screen.getByRole('button', { name: 'Room' }))
    await user.click(screen.getByRole('button', { name: 'Booked' }))
    expect(screen.getAllByRole('row')).toHaveLength(3)

    renderClient(
      <SessionTable paging={LOCAL} sessions={[session({ status: 'CANCELLED' })]} canEdit compact />
    )
    const compact = screen.getAllByRole('table').at(-1) as HTMLElement
    expect(within(compact).queryByText('Aula A')).toBeNull()
    expect(within(compact).queryByRole('link', { name: /Edit session/ })).toBeNull()
  })
})

describe('saving and deciding', () => {
  it('says a save went through, in a toast, on the page the form goes on to', async () => {
    const user = userEvent.setup()
    renderClient(
      <DepartmentForm
        isNew
        action={() => Promise.resolve({ status: 'saved', href: '/departments/dep_new' })}
        cancelHref="/departments"
        heading={{ title: 'New department' }}
        defaults={{ name: '', headId: null }}
        members={[]}
      />
    )
    await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Kvalita')
    // The button says what it does.
    await user.click(screen.getByRole('button', { name: 'Create department' }))
    expect(await screen.findByText('Department created')).toBeTruthy()
    expect(router.push).toHaveBeenCalledWith('/departments/dep_new')
    // A toast can be closed before it leaves on its own.
    const toasts = screen.getByRole('region', { name: /Notifications/ })
    await user.click(within(toasts).getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByText('Department created')).toBeNull()
    })
  })

  it('goes back where the form was opened from, filters included; opened directly, to the record', async () => {
    const user = userEvent.setup()
    const form = () => (
      <DepartmentForm
        action={() => Promise.resolve({ status: 'saved', href: '/departments/dep_lab' })}
        cancelHref="/departments/dep_lab"
        heading={{ title: 'Edit Laboratoře' }}
        defaults={{ name: 'Laboratoře', headId: null }}
        members={[]}
      />
    )
    // Reached from a filtered list, in the app.
    window.history.replaceState(null, '', '/departments/dep_lab/edit')
    sessionStorage.setItem(
      HISTORY,
      JSON.stringify([
        { href: '/departments?q=lab', title: 'Departments · Training register' },
        { href: '/departments/dep_lab/edit', title: null },
      ])
    )
    const { unmount } = renderClient(form())
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe(
        '/departments?q=lab'
      )
    })
    await user.type(screen.getByRole('textbox', { name: /Name/ }), ' a')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/departments?q=lab')
    })
    unmount()
    // Opened directly (the page the document loaded on): nothing in the app led here.
    vi.mocked(router.push).mockClear()
    window.history.replaceState(null, '', '/')
    sessionStorage.setItem(HISTORY, JSON.stringify([{ href: '/departments', title: null }]))
    renderClient(form())
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe(
      '/departments/dep_lab'
    )
    await user.type(screen.getByRole('textbox', { name: /Name/ }), ' b')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/departments/dep_lab')
    })
  })

  it('asks before moving the people booked on a session to another course', async () => {
    const user = userEvent.setup()
    vi.mocked(checkSessionSlotAction).mockResolvedValue(null)
    const action = vi.fn(() =>
      Promise.resolve<FormState>({ status: 'saved', href: '/sessions/T016' })
    )
    renderClient(
      <SessionForm
        action={action}
        cancelHref="/sessions/T016"
        heading={{ title: 'Edit T016' }}
        rooms={[ROOMS.aula]}
        courses={[COURSES.bozp, { ...COURSES.fire, needs: { ...COURSES.bozp.needs } }]}
        named={1}
        defaults={{
          courseId: 'course_bozp',
          providerId: INTERNAL.providerId,
          date: '2026-11-04',
          startTime: '08:00',
          endTime: '11:00',
          roomId: 'room_aula_a',
          capacity: 30,
          unnamedBookings: 0,
          pricePerPerson: null,
          status: 'PLANNED',
        }}
      />
    )
    await user.click(screen.getByRole('combobox', { name: /Course/ }))
    await user.click(screen.getByRole('option', { name: /Požární ochrana/ }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    const dialog = await screen.findByRole('dialog', { name: 'Change the course?' })
    expect(within(dialog).getByText(/now for Požární ochrana/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Change course' }))
    await waitFor(() => {
      expect(action).toHaveBeenCalled()
    })
  })

  it('never changes a session’s status: a cancelled one is edited as it is, its room unchecked', async () => {
    const user = userEvent.setup()
    vi.mocked(checkSessionSlotAction).mockResolvedValue('ROOM_BUSY')
    const action = vi.fn(() =>
      Promise.resolve<FormState>({ status: 'saved', href: '/sessions/T017' })
    )
    renderClient(
      <SessionForm
        action={action}
        cancelHref="/sessions/T017"
        heading={{ title: 'Edit T017' }}
        rooms={[ROOMS.aula]}
        courses={[COURSES.bozp]}
        named={2}
        defaults={{ ...defaultsOf('room_aula_a'), status: 'CANCELLED' }}
      />
    )
    // Cancelling and reinstating are the session page's acts, not a field.
    expect(screen.queryByRole('combobox', { name: /Status/ })).toBeNull()
    const seats = screen.getByRole('textbox', { name: /^Seats/ })
    await user.clear(seats)
    await user.type(seats, '12')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(action).toHaveBeenCalled()
    })
    // Cancelled, it holds no room: nobody asked whether the room is free.
    expect(checkSessionSlotAction).not.toHaveBeenCalled()
    expect((action.mock.calls[0] as unknown as [unknown, FormData])[1].has('status')).toBe(false)
  })
})

describe('ConfirmDialog', () => {
  function Harness({ onConfirm }: { onConfirm: () => Promise<ConfirmOutcome> }) {
    const [open, setOpen] = useState(true)
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancel the booking?"
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        tone="danger"
        onConfirm={onConfirm}
      >
        <p>The seat goes back to the session.</p>
      </ConfirmDialog>
    )
  }

  it('does it on confirm, then closes and says so', async () => {
    const user = userEvent.setup()
    renderClient(
      <Harness onConfirm={() => Promise.resolve({ kind: 'done', toast: { title: 'Cancelled' } })} />
    )
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))
    expect(await screen.findByText('Cancelled')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stays open to say why it was refused, or why it failed', async () => {
    const user = userEvent.setup()
    const onConfirm = vi
      .fn<() => Promise<ConfirmOutcome>>()
      .mockResolvedValueOnce({ kind: 'refused', message: 'Already cancelled.' })
      .mockRejectedValueOnce(new Error('offline'))
    renderClient(<Harness onConfirm={onConfirm} />)
    const dialog = screen.getByRole('dialog', { name: 'Cancel the booking?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel booking' }))
    expect(await within(dialog).findByText('Already cancelled.')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel booking' }))
    expect(
      await within(dialog).findByText('That did not go through. Check the page and try again.')
    ).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Keep booking' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('after a partial result, lists what was refused and offers only Close', async () => {
    const user = userEvent.setup()
    renderClient(
      <Harness
        onConfirm={() =>
          Promise.resolve({
            kind: 'partial',
            toast: { title: 'Booked 1 person' },
            message: 'Bílá Jana: the session is full',
          })
        }
      />
    )
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText('Bílá Jana: the session is full')).toBeTruthy()
    expect(screen.getByText('Booked 1 person')).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: 'Cancel booking' })).toBeNull()
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1) as HTMLElement)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('skeletons', () => {
  it('stand in for each page in its shape, saying it is loading', () => {
    for (const skeleton of [
      <AdvisorSkeleton key="advisor" />,
      <PlannerSkeleton key="planner" />,
      <ImportSkeleton key="import" />,
      <ArchivedRecordSkeleton key="archived" />,
      <DashboardSkeleton key="dashboard" />,
      <DetailSkeleton key="detail" />,
      <FormSkeleton key="form" />,
      <ListSkeleton key="list" />,
    ]) {
      const { unmount } = renderClient(<LoadingRegion>{skeleton}</LoadingRegion>)
      expect(screen.getByRole('status').textContent).toBe('Loading…')
      unmount()
    }
  })
})
