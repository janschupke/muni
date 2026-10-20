import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EmployeeForm } from '@/features/employees/employee-form'
import { renderClient } from '@/test/render'

// @vitest-environment jsdom

vi.mock('@/server/actions/sessions', () => ({ checkSessionSlotAction: vi.fn() }))

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

/** Opens a select by its label and picks an option. */
async function choose(user: ReturnType<typeof userEvent.setup>, label: RegExp, option: RegExp) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
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
