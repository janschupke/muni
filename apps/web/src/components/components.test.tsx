// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as z from 'zod'

import { fieldErrors, type FormState } from '@/lib/form'
import { expectNoAxeViolations } from '@/test/axe'
import { ONLINE, session } from '@/test/fixtures'
import { route, router } from '@/test/next'
import { renderClient } from '@/test/render'

import { BackLink } from './back-link'
import { CompletionHistoryTable } from './completion-tables'
import { CompletionForm, CourseForm, EmployeeForm, SessionForm } from './form/entity-forms'
import { NavigationHistory, parseHistory, readHistory } from './navigation-history'
import { RequirementPanel } from './requirement-panel'
import { SessionTable } from './session-table'
import {
  ComplianceBadge,
  EmploymentBadge,
  OccupancyBadge,
  SessionStatusBadge,
} from './status-badges'

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
    expect(
      screen.getByRole('checkbox', { name: 'Can be held online' }).getAttribute('aria-checked')
    ).toBe('true')
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
          onlineAllowed: false,
          capabilities: [],
        }}
      />
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
          managers={[{ externalId: 'E0001', name: 'Urbanová Tereza' }]}
          defaults={{
            firstName: 'Marie',
            lastName: 'Černá',
            email: null,
            nationalId: null,
            departmentId: 'dep_lab',
            positionId: null,
            managerExternalId: 'E0001',
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
          rooms={[
            { id: 'room_aula_a', name: 'Aula A' },
            { id: 'room_online', name: 'Online' },
          ]}
          courses={[{ code: 'BOZP-Z', name: 'BOZP – základní školení' }]}
          defaults={{
            date: '2026-11-04',
            startTime: '08:00',
            endTime: '11:00',
            roomId: 'room_online',
            capacity: 30,
            unnamedBookings: 29,
            assignedCount: 1,
            pricePerPerson: null,
            status: 'PLANNED',
          }}
        />
        <CompletionForm
          action={action}
          cancelHref="/employees/E0153"
          heading={{ title: 'Edit completion' }}
          courses={[{ code: 'GDPR', name: 'Ochrana osobních údajů' }]}
          providers={['Bezpečná firma s.r.o.']}
          defaults={{
            courseCode: 'GDPR',
            completedOn: '2026-10-16',
            validUntil: null,
            provider: null,
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
    expect(screen.getByRole('textbox', { name: 'Left' })).toHaveProperty('value', '')
    expect(screen.getByRole('textbox', { name: /Hired/ })).toHaveProperty('value', '3/1/2019')
    expect(posted('hiredOn')).toBe('2019-03-01')
    expect(screen.getByRole('button', { name: 'Choose Hired from a calendar' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /Room/ }).textContent).toContain('Online')
    expect(screen.getAllByRole('combobox', { name: /Course/ })).toHaveLength(2)
    expect(screen.getByRole('textbox', { name: /Start/ })).toHaveProperty('value', '08:00')
    expect(screen.getByRole('button', { name: 'Choose Start from a list' })).toBeTruthy()
    expect(posted('date')).toBe('2026-11-04')
    expect(screen.getByText('Plus 1 person booked by name.')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Price per person (CZK)' })).toHaveProperty(
      'value',
      ''
    )
    expect(posted('completedOn')).toBe('2026-10-16')
    expect(screen.getByText(/came from an import/)).toBeTruthy()
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
