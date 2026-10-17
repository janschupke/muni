// @vitest-environment jsdom
import {
  type ArchivedItem,
  getArchivedRecord,
  listArchived,
  recordExists,
} from '@muni/db/repositories'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ArchivedCompletion from '@/app/completions/archived/[id]/page'
import ArchivedCompletions from '@/app/completions/archived/page'
import ArchivedCourse from '@/app/courses/archived/[id]/page'
import ArchivedCourses from '@/app/courses/archived/page'
import ArchivedDepartment from '@/app/departments/archived/[id]/page'
import ArchivedDepartments from '@/app/departments/archived/page'
import ArchivedEmployee from '@/app/employees/archived/[id]/page'
import ArchivedEmployees, {
  generateMetadata as employeesMetadata,
} from '@/app/employees/archived/page'
import ArchivedPosition from '@/app/positions/archived/[id]/page'
import ArchivedPositions from '@/app/positions/archived/page'
import ArchivedProvider from '@/app/providers/archived/[id]/page'
import ArchivedProviders from '@/app/providers/archived/page'
import ArchivedRoom from '@/app/rooms/archived/[id]/page'
import ArchivedRooms from '@/app/rooms/archived/page'
import ArchivedSession from '@/app/sessions/archived/[id]/page'
import ArchivedSessions from '@/app/sessions/archived/page'
import ArchivedUser from '@/app/users/archived/[id]/page'
import ArchivedUsers from '@/app/users/archived/page'
import { ConfirmArchiveButton } from '@/components/confirm-archive-button'
import { UnarchiveButton } from '@/components/unarchive-button'
import { archiveAction, previewArchive, unarchiveAction } from '@/server/actions/archive'
import { requireAdminPage } from '@/server/auth'
import { signInAs } from '@/test/auth'
import { expectNoAxeViolations } from '@/test/axe'
import { NotFoundError } from '@/test/next'
import { params, renderClient, renderServer } from '@/test/render'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  listArchived: vi.fn(),
  getArchivedRecord: vi.fn(),
  recordExists: vi.fn(() => Promise.resolve(true)),
}))
vi.mock('@/server/auth')
vi.mock('@/server/actions/archive', () => ({
  archiveAction: vi.fn(),
  previewArchive: vi.fn(),
  unarchiveAction: vi.fn(),
}))

const ADMIN = { archived: false as const, id: 'usr_admin', name: 'Jana Správcová', email: null }

const person = (over: Partial<ArchivedItem> = {}): ArchivedItem => ({
  id: 'emp_1',
  label: null,
  detail: null,
  when: null,
  tag: 'a1b2c3',
  archivedAt: '2026-10-20T08:00:00.000Z',
  archivedBy: ADMIN,
  ...over,
})

beforeEach(() => {
  signInAs('ADMIN')
  vi.mocked(listArchived).mockResolvedValue([])
  vi.mocked(getArchivedRecord).mockResolvedValue(null)
})

describe('archived lists', () => {
  it('list people by tag only, each opening its admin page and coming back on request', async () => {
    vi.mocked(listArchived).mockResolvedValue([
      person(),
      person({ id: 'emp_2', tag: 'ffee00', archivedBy: { archived: true, tag: '00aa11' } }),
    ])
    expect(await employeesMetadata()).toEqual({ title: 'Archived employees' })
    await renderServer(ArchivedEmployees())
    expect(requireAdminPage).toHaveBeenCalled()
    expect(listArchived).toHaveBeenCalledWith('employee', 'ADMIN')
    expect(
      screen.getByRole('link', { name: 'Archived employee #a1b2c3' }).getAttribute('href')
    ).toBe('/employees/archived/emp_1')
    // Who archived it: an admin by name, an archived user by tag.
    expect(screen.getByText('Jana Správcová')).toBeTruthy()
    expect(screen.getByText('Archived user #00aa11')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Archived completions' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Bring back Archived employee #a1b2c3' })
    ).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('show a session with its course and start, and say when nothing is archived', async () => {
    vi.mocked(listArchived).mockResolvedValueOnce([
      person({
        id: 'ses_1',
        label: 'S001',
        detail: 'BOZP-Z BOZP – základní školení',
        when: { key: 'startsAt', value: '2026-09-01T08:00:00.000Z', type: 'datetime' },
        archivedBy: null,
      }),
    ])
    const { unmount } = await renderServer(ArchivedSessions())
    expect(screen.getByRole('link', { name: 'S001' })).toBeTruthy()
    expect(screen.getByText('BOZP-Z BOZP – základní školení')).toBeTruthy()
    expect(screen.getByText(/1\. 9\. 2026|9\/1\/2026|Sep/)).toBeTruthy()
    unmount()
    await renderServer(ArchivedRooms())
    expect(screen.getByText('Nothing is archived here.')).toBeTruthy()
  })

  it('exist for every kind', () => {
    const pages = [
      [ArchivedEmployees, 'employee'],
      [ArchivedCourses, 'course'],
      [ArchivedSessions, 'session'],
      [ArchivedCompletions, 'completion'],
      [ArchivedDepartments, 'department'],
      [ArchivedPositions, 'position'],
      [ArchivedRooms, 'room'],
      [ArchivedProviders, 'provider'],
      [ArchivedUsers, 'user'],
    ] as const
    for (const [Page, kind] of pages) expect(Page().props).toEqual({ kind })
  })
})

describe('archived record pages', () => {
  it('show an archived person, by name, to the admin, with their codes translated', async () => {
    vi.mocked(getArchivedRecord).mockResolvedValue({
      ...person(),
      kind: 'employee',
      title: 'Urbanová Tereza',
      fields: [
        { key: 'externalId', value: 'E0044', type: 'text' },
        { key: 'email', value: null, type: 'text' },
        { key: 'status', value: 'LEFT', type: 'text' },
        { key: 'hiredOn', value: '2019-03-01', type: 'date' },
      ],
    })
    await renderServer(ArchivedEmployee({ params: params({ id: 'emp_1' }) }))
    expect(getArchivedRecord).toHaveBeenCalledWith('employee', 'emp_1', 'ADMIN')
    expect(screen.getByRole('heading', { level: 1, name: 'Urbanová Tereza' })).toBeTruthy()
    expect(screen.getByText('E0044')).toBeTruthy()
    expect(screen.getByText('Left')).toBeTruthy()
    expect(screen.getByText('Only admins see this page.', { exact: false })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bring back' })).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('are a 404 for a record that is not archived', async () => {
    vi.mocked(recordExists).mockResolvedValueOnce(false)
    await expect(renderServer(ArchivedRoom({ params: params({ id: 'room_1' }) }))).rejects.toThrow(
      NotFoundError
    )
  })

  it('exist for every kind', async () => {
    const pages = [
      [ArchivedCourse, 'course'],
      [ArchivedSession, 'session'],
      [ArchivedCompletion, 'completion'],
      [ArchivedDepartment, 'department'],
      [ArchivedPosition, 'position'],
      [ArchivedRoom, 'room'],
      [ArchivedProvider, 'provider'],
      [ArchivedUser, 'user'],
    ] as const
    for (const [Page, kind] of pages)
      expect((await Page({ params: params({ id: 'x1' }) })).props).toEqual({ kind, id: 'x1' })
  })
})

describe('archive and bring-back buttons', () => {
  it('warn that a person’s future bookings go with them, and close once archived', async () => {
    const user = userEvent.setup()
    vi.mocked(previewArchive).mockResolvedValue({ ok: true, removesBookings: 2 })
    vi.mocked(archiveAction).mockResolvedValue({ status: 'done' })
    renderClient(<ConfirmArchiveButton kind="employee" id="emp_1" name="Urbanová Tereza" compact />)
    await user.click(screen.getByRole('button', { name: 'Archive Urbanová Tereza' }))
    const dialog = await screen.findByRole('dialog', { name: 'Archive Urbanová Tereza?' })
    expect(
      await within(dialog).findByText('Their 2 bookings on sessions ahead are removed.')
    ).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }))
    expect(archiveAction).toHaveBeenCalledWith('employee', 'emp_1', null, { status: 'idle' })
    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('say why a record cannot come back', async () => {
    const user = userEvent.setup()
    vi.mocked(unarchiveAction).mockResolvedValue({
      status: 'refused',
      reason: 'taken',
      fields: ['name', 'companyId'],
    })
    renderClient(<UnarchiveButton kind="provider" id="prov_1" name="Vzor" />)
    await user.click(screen.getByRole('button', { name: 'Bring back' }))
    expect(
      await screen.findByText(
        'An active record now uses its name, IČO. Rename or archive that one first.'
      )
    ).toBeTruthy()
  })
})
