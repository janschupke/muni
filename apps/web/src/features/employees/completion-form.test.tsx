import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CompletionForm } from '@/features/employees/completion-form'
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
