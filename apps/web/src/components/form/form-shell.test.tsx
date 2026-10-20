import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as z from 'zod'

import { CourseForm } from '@/features/courses/course-form'
import { CompletionForm } from '@/features/employees/completion-form'
import { EmployeeForm } from '@/features/employees/employee-form'
import { DepartmentForm } from '@/features/org/group-forms'
import { type SessionDefaults, SessionForm } from '@/features/sessions/session-form'
import { fieldErrors, type FormState } from '@/lib/form/form'
import { checkSessionSlotAction } from '@/server/actions/sessions'
import { expectNoAxeViolations } from '@/test/axe'
import { EXTERNAL, INTERNAL } from '@/test/fixtures'
import { router } from '@/test/next'
import { renderClient } from '@/test/render'

// @vitest-environment jsdom

vi.mock('@/server/actions/sessions', () => ({ checkSessionSlotAction: vi.fn() }))

const HISTORY = 'muni.history'

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
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
