import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DepartmentForm, PositionForm } from '@/features/org/group-forms'
import { renderClient } from '@/test/render'

// @vitest-environment jsdom

vi.mock('@/server/actions/sessions', () => ({ checkSessionSlotAction: vi.fn() }))

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
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
