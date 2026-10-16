// @vitest-environment jsdom
import { getUser, listUsers, type UserListItem } from '@muni/db/repositories'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requireAdminPage } from '@/server/auth'
import { signInAs } from '@/test/auth'
import { expectNoAxeViolations } from '@/test/axe'
import { NotFoundError } from '@/test/next'
import { params, renderServer } from '@/test/render'

import UserPage from './[id]/page'
import UsersPage, { generateMetadata } from './page'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getUser: vi.fn(),
  listUsers: vi.fn(),
}))
vi.mock('@/server/auth')
vi.mock('@/server/actions/archive', () => ({ archiveAction: vi.fn(), previewArchive: vi.fn() }))
vi.mock('@/server/actions/users', () => ({
  saveUserRole: vi.fn(() =>
    Promise.resolve({ status: 'error', fieldErrors: { role: 'last_admin' } })
  ),
}))

const user = (overrides: Partial<UserListItem>): UserListItem => ({
  id: 'usr_1',
  clerkId: 'user_1',
  email: 'jana@example.com',
  name: 'Jana Nová',
  role: 'VIEWER',
  lastSignInAt: new Date('2026-10-16T07:30:00Z'),
  createdAt: new Date('2026-10-01T00:00:00Z'),
  ...overrides,
})

beforeEach(() => {
  signInAs('ADMIN')
  vi.mocked(listUsers).mockResolvedValue([
    user({ id: 'usr_2', name: 'Petr Admin', email: 'petr@example.com', role: 'ADMIN' }),
    user({}),
    // A placeholder from before users existed: nothing synced yet.
    user({ id: 'usr_3', name: null, email: null, lastSignInAt: null }),
  ])
})

describe('users', () => {
  it('lists everyone with access and their role, for admins', async () => {
    expect(await generateMetadata()).toEqual({ title: 'Users' })
    await renderServer(UsersPage())
    expect(requireAdminPage).toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeTruthy()
    expect(screen.getByText(/Open a user to change their role/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Petr Admin' }).getAttribute('href')).toBe(
      '/users/usr_2'
    )
    expect(screen.getByRole('button', { name: 'Archive Jana Nová' })).toBeTruthy()
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows.map(r => r.textContent)).toEqual([
      expect.stringContaining('Petr Admin'),
      expect.stringContaining('Jana Nová'),
      expect.stringContaining('—'),
    ])
    expect(within(rows[0] as HTMLElement).getByText('Admin')).toBeTruthy()
    expect(within(rows[1] as HTMLElement).getByText('Viewer')).toBeTruthy()
    expect(rows[1]?.textContent).toContain('Oct 16, 2026')
    await expectNoAxeViolations()
  })
})

describe('a user', () => {
  const detail = { ...user({ id: 'usr_2', name: 'Petr Admin', role: 'ADMIN' }), bookingsMade: 3 }

  it('shows the account and changes the role, saying why a change is refused', async () => {
    const u = userEvent.setup()
    vi.mocked(getUser).mockResolvedValue(detail)
    await renderServer(UserPage({ params: params({ id: 'usr_2' }) }))
    expect(screen.getByRole('heading', { level: 1, name: 'Petr Admin' })).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy()
    await expectNoAxeViolations()
    await u.click(screen.getByRole('combobox', { name: 'Role' }))
    await u.click(screen.getByRole('option', { name: 'Full access' }))
    await u.click(screen.getByRole('button', { name: 'Change role' }))
    expect(
      await screen.findByText('This is the last admin; make someone else an admin first.')
    ).toBeTruthy()
  })

  it('does not let admins change or archive themselves, and 404s for an unknown user', async () => {
    vi.mocked(getUser).mockResolvedValue({ ...detail, id: 'usr_admin' })
    await renderServer(UserPage({ params: params({ id: 'usr_admin' }) }))
    expect(screen.getByText('You cannot change your own role.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change role' })).toHaveProperty('disabled', true)
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
    vi.mocked(getUser).mockResolvedValue(null)
    await expect(UserPage({ params: params({ id: 'gone' }) })).rejects.toThrow(NotFoundError)
  })
})
