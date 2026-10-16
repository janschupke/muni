// @vitest-environment jsdom
import { listUsers, type UserListItem } from '@muni/db/repositories'
import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requireAdminPage } from '@/server/auth'
import { signInAs } from '@/test/auth'
import { expectNoAxeViolations } from '@/test/axe'
import { renderServer } from '@/test/render'

import UsersPage, { generateMetadata } from './page'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  listUsers: vi.fn(),
}))
vi.mock('@/server/auth')

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
    expect(screen.getByText(/assigned in the Clerk dashboard/)).toBeTruthy()
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
