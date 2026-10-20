// @vitest-environment jsdom
import type { Role } from '@muni/domain/enums'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { FormState } from '@/lib/form/form'
import { renderClient } from '@/test/render'

import { RoleForm } from './role-form'

/** The user's role now (a prop named `role`, not an ARIA one). */
const VIEWER: Role = 'VIEWER'

async function changeTo(role: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: 'Role' }))
  await user.click(screen.getByRole('option', { name: role }))
  await user.click(screen.getByRole('button', { name: 'Change role' }))
  const dialog = await screen.findByRole('dialog', { name: `Change the role to ${role}?` })
  await user.click(within(dialog).getByRole('button', { name: 'Change role' }))
  return dialog
}

describe('RoleForm', () => {
  it('changes the role once confirmed, and says so', async () => {
    const action = vi.fn((_state: FormState, _form: FormData) =>
      Promise.resolve<FormState>({ status: 'saved', href: '/users/usr_2' })
    )
    renderClient(<RoleForm action={action} role={VIEWER} disabled={false} />)
    await changeTo('Admin')
    expect(await screen.findByText('Role changed to Admin')).toBeTruthy()
    expect(action.mock.calls[0]?.[1].get('role')).toBe('ADMIN')
  })

  it('says why the server refused, or that it failed when it gives no reason', async () => {
    const action = vi
      .fn<(state: FormState, form: FormData) => Promise<FormState>>()
      .mockResolvedValueOnce({ status: 'error', fieldErrors: {}, formError: 'rate_limited' })
    renderClient(<RoleForm action={action} role={VIEWER} disabled={false} />)
    const dialog = await changeTo('Full access')
    expect(await within(dialog).findByText(/^Too many/)).toBeTruthy()

    action.mockResolvedValueOnce({ status: 'error', fieldErrors: {} })
    const user = userEvent.setup()
    const confirm = within(dialog).getByRole('button', { name: 'Change role' })
    await waitFor(() => {
      expect(confirm).toHaveProperty('disabled', false)
    })
    await user.click(confirm)
    expect(
      await within(dialog).findByText('That did not go through. Check the page and try again.')
    ).toBeTruthy()
  })
})
