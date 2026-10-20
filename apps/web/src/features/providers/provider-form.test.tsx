// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { FormState } from '@/lib/form/form'
import { expectNoAxeViolations } from '@/test/axe'
import { renderClient } from '@/test/render'

import { ProviderForm } from './provider-form'

const COURSES = [
  { id: 'course_bozp', code: 'BOZP-Z', name: 'BOZP – základní školení' },
  { id: 'course_gdpr', code: 'GDPR', name: 'Ochrana osobních údajů' },
]

const DEFAULTS = {
  name: 'Externí lektor',
  companyId: null,
  email: null,
  phone: null,
  website: null,
  note: null,
  isDefault: false,
  offerings: [{ courseId: 'course_bozp', price: 450 }],
}

const render = (action = vi.fn(() => Promise.resolve<FormState>({ status: 'idle' }))) => {
  renderClient(
    <ProviderForm
      action={action}
      cancelHref="/providers/p1"
      heading={{ title: 'Edit Externí lektor' }}
      defaults={DEFAULTS}
      courses={COURSES}
    />
  )
  return action
}

const posted = (action: ReturnType<typeof vi.fn>) =>
  Object.fromEntries((action.mock.calls.at(-1) as unknown as [unknown, FormData])[1])

describe('the provider form', () => {
  it('lists the courses it offers as rows: add one, never the same course twice, remove one', async () => {
    const user = userEvent.setup()
    const action = render(
      vi.fn(() => Promise.resolve<FormState>({ status: 'saved', href: '/providers/p1' }))
    )
    const rows = () => screen.getByRole('group', { name: 'Offered courses' })
    expect(within(rows()).getByRole('combobox', { name: 'Course in row 1' }).textContent).toContain(
      'BOZP-Z'
    )
    expect(
      within(rows()).getByRole('textbox', {
        name: 'Price per person for BOZP-Z · BOZP – základní školení',
      })
    ).toHaveProperty('value', '450,00')
    // A new row takes the focus, and offers only the course not listed yet.
    await user.click(screen.getByRole('button', { name: 'Add a course' }))
    const second = within(rows()).getByRole('combobox', { name: 'Course in row 2' })
    expect(document.activeElement).toBe(second)
    await user.click(second)
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([
      'GDPR · Ochrana osobních údajů',
    ])
    await user.click(screen.getByRole('option', { name: /GDPR/ }))
    // Every course listed: nothing more to add.
    expect(screen.queryByRole('button', { name: 'Add a course' })).toBeNull()
    await user.type(
      within(rows()).getByRole('textbox', {
        name: 'Price per person for GDPR · Ochrana osobních údajů',
      }),
      '0'
    )
    await expectNoAxeViolations()
    // Removing the first row: its course is free again, and "Add" has the focus.
    await user.click(
      screen.getByRole('button', { name: 'Remove BOZP-Z · BOZP – základní školení' })
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add a course' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(action).toHaveBeenCalled()
    })
    expect(posted(action)).toMatchObject({
      'offerings.0.courseId': 'course_gdpr',
      'offerings.0.price': '0',
    })
    expect(posted(action)).not.toHaveProperty('offerings.1.courseId')
  })

  it('says on the rows which course upcoming sessions still use', async () => {
    const user = userEvent.setup()
    render(
      vi.fn(() =>
        Promise.resolve<FormState>({
          status: 'error',
          fieldErrors: { offerings: 'offering_in_use' },
          values: { offerings: { course: 'BOZP – základní školení', count: 2 } },
        })
      )
    )
    await user.click(
      screen.getByRole('button', { name: 'Remove BOZP-Z · BOZP – základní školení' })
    )
    expect(screen.getByText('It offers no course yet.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(
      await screen.findByText(
        'Upcoming sessions of BOZP – základní školení are held by this provider (2). Cancel them, or schedule them with another provider, before it stops offering the course.'
      )
    ).toBeTruthy()
  })

  it('can be made the default for imported sessions', () => {
    render()
    const checkbox = screen.getByRole('checkbox', { name: 'Default for imported sessions' })
    expect(checkbox.getAttribute('aria-checked')).toBe('false')
  })
})
