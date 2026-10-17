// @vitest-environment jsdom
import { getRoom, getRoomForEdit, listRooms } from '@muni/db/repositories'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { archiveAction, previewArchive } from '@/server/actions/archive'
import { requireAdminPage } from '@/server/auth'
import { RateLimitedError, spendRequest } from '@/server/rate-limit'
import { signInAs } from '@/test/auth'
import { expectNoAxeViolations } from '@/test/axe'
import { ONLINE, roomDetail, roomRow } from '@/test/fixtures'
import { NotFoundError } from '@/test/next'
import { params, renderServer } from '@/test/render'

import EditRoomPage, { generateMetadata as editRoomMetadata } from './[id]/edit/page'
import RoomPage, { generateMetadata as roomMetadata } from './[id]/page'
import NewRoomPage, { generateMetadata as newMetadata } from './new/page'
import RoomsPage, { generateMetadata as listMetadata } from './page'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getRoom: vi.fn(),
  getRoomForEdit: vi.fn(),
  listRooms: vi.fn(),
  recordExists: vi.fn(() => Promise.resolve(true)),
}))
vi.mock('@/server/auth')
vi.mock('@/server/actions/edit', () => ({ saveSession: vi.fn() }))
vi.mock('@/server/actions/rooms', () => ({ saveRoom: vi.fn() }))
vi.mock('@/server/actions/archive', () => ({
  archiveAction: vi.fn(),
  previewArchive: vi.fn(() => Promise.resolve({ ok: false, reason: 'IN_USE', count: 7 })),
}))

beforeEach(() => {
  signInAs('VIEWER')
  vi.mocked(listRooms).mockResolvedValue([
    roomRow(),
    roomRow({
      ...ONLINE,
      capacity: null,
      capabilities: [],
      upcomingSessions: 5,
      utilisation: null,
    }),
  ])
  vi.mocked(getRoom).mockResolvedValue(roomDetail())
  vi.mocked(getRoomForEdit).mockResolvedValue({
    id: 'room_aula_a',
    name: 'Aula A',
    kind: 'CLASSROOM',
    capacity: 40,
    note: null,
    capabilities: ['PROJECTOR'],
  })
})

describe('room list', () => {
  it('shows each room’s kind, seats, equipment and how booked it is', async () => {
    const user = userEvent.setup()
    expect(await listMetadata()).toEqual({ title: 'Rooms' })
    await renderServer(RoomsPage())
    const aula = screen.getByRole('row', { name: /Aula A/ })
    expect(within(aula).getByRole('link', { name: 'Aula A' }).getAttribute('href')).toBe(
      '/rooms/room_aula_a'
    )
    expect(within(aula).getByText('Classroom')).toBeTruthy()
    expect(within(aula).getByText('Projector')).toBeTruthy()
    expect(within(aula).getByText('25%')).toBeTruthy()
    const online = screen.getByRole('row', { name: /Online/ })
    expect(within(online).getByText('No limit')).toBeTruthy()
    expect(within(online).getAllByText('—')).toHaveLength(2)
    // Visitors cannot add rooms.
    expect(screen.queryByRole('link', { name: 'New room' })).toBeNull()
    for (const header of ['Room', 'Kind', 'Seats', 'Upcoming sessions', 'Booked, next 30 days'])
      await user.click(screen.getByRole('button', { name: header }))
    expect(screen.getAllByRole('row')).toHaveLength(3)
  })

  it('lets admins add a room, and says when there are none', async () => {
    signInAs('ADMIN')
    vi.mocked(listRooms).mockResolvedValue([])
    await renderServer(RoomsPage())
    // The empty list offers the first one where the table would be, as the header does.
    const empty = screen.getByText('No rooms yet.').parentElement as HTMLElement
    expect(within(empty).getByRole('link', { name: 'New room' }).getAttribute('href')).toBe(
      '/rooms/new'
    )
  })
})

describe('a page’s data from the server', () => {
  it('falls back to reading in the browser past the read limit, or when the server read fails', async () => {
    signInAs('VIEWER')
    const fetches = vi.spyOn(globalThis, 'fetch')
    // Past the minute's limit: the page renders, and its view asks (and is told to wait).
    vi.mocked(spendRequest).mockRejectedValueOnce(new RateLimitedError(30))
    vi.mocked(spendRequest).mockRejectedValueOnce(new RateLimitedError(30))
    await renderServer(RoomsPage())
    expect(fetches).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Too many requests in a short time/)).toBeTruthy()
    cleanup()
    // A read that throws on the server is the browser's to try again.
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(listRooms).mockRejectedValueOnce(new Error('timeout'))
    await renderServer(RoomsPage())
    expect(log).toHaveBeenCalled()
    expect(fetches).toHaveBeenCalledTimes(2)
  })
})

describe('room detail', () => {
  const props = { params: params({ id: 'room_aula_a' }) }

  it('is titled by the room, or by the id when unknown', async () => {
    expect(await roomMetadata(props)).toEqual({ title: 'Aula A' })
    vi.mocked(getRoom).mockResolvedValueOnce(null)
    await expect(renderServer(RoomPage({ params: params({ id: 'gone' }) }))).rejects.toThrow(
      NotFoundError
    )
  })

  it('shows its equipment, its sessions and which courses fit, read-only for viewers', async () => {
    await renderServer(RoomPage(props))
    expect(screen.getByRole('heading', { level: 1, name: 'Aula A' })).toBeTruthy()
    expect(screen.getByText('Wheelchair access')).toBeTruthy()
    expect(screen.getByText('Přízemí, vchod B')).toBeTruthy()
    expect(screen.getByText('25% of working hours')).toBeTruthy()
    // Each course's needs beside what the room provides, in numbers.
    const fit = screen.getByRole('table', { name: 'Course fit in Aula A' })
    expect(
      within(fit)
        .getAllByRole('columnheader')
        .map(h => h.textContent)
    ).toEqual(['Course', 'Seats needed', 'Seats here', 'Equipment needed', 'Fits'])
    const cells = (name: string) =>
      within(within(fit).getByRole('row', { name: new RegExp(name) }))
        .getAllByRole('cell')
        .map(c => c.textContent)
    expect(cells('BOZP')).toEqual(['BOZP – základní školení', '30', '40', 'None', 'Fits'])
    expect(cells('laboratoři')).toEqual([
      'Bezpečná práce v laboratoři',
      '20',
      '40',
      'Lab equipment (not in this room)Projector (in this room)',
      'Lacks Lab equipment',
    ])
    expect(cells('osobních')).toEqual([
      'Ochrana osobních údajů',
      '100',
      '40',
      'None',
      'Needs 100 seats, has 40',
    ])
    expect(cells('Angličtina')).toEqual(['Angličtina', 'Split by room', '40', 'None', 'Fits'])
    // The short room is marked where it falls short, not only in the verdict.
    expect(
      within(within(fit).getByRole('row', { name: /osobních/ })).getAllByRole('cell')[2]?.className
    ).toContain('text-danger-fg')
    expect(screen.getByRole('link', { name: /Nov 4, 2026/ }).getAttribute('href')).toBe(
      '/sessions/T016'
    )
    expect(screen.getByRole('link', { name: '4 past sessions' }).getAttribute('href')).toBe(
      '/sessions?when=past&room=room_aula_a'
    )
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
  })

  it('says when nothing is scheduled, nothing came before and no course is set up', async () => {
    signInAs('ADMIN')
    vi.mocked(getRoom).mockResolvedValue(
      roomDetail({
        ...ONLINE,
        capacity: null,
        capabilities: [],
        utilisation: null,
        note: null,
        upcoming: [],
        pastCount: 0,
        courses: [],
      })
    )
    await renderServer(RoomPage(props))
    expect(screen.getByText('No limit')).toBeTruthy()
    expect(screen.getByText('No equipment listed')).toBeTruthy()
    expect(screen.getByText('Nothing is scheduled here.')).toBeTruthy()
    expect(screen.getByText('There are no courses yet.')).toBeTruthy()
    expect(screen.queryByText(/past session/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
      '/rooms/room_online/edit'
    )
  })
})

describe('room fit online', () => {
  it('judges an online room only on whether each course may be held online', async () => {
    vi.mocked(getRoom).mockResolvedValue(
      roomDetail({ ...ONLINE, capacity: null, capabilities: [], utilisation: null })
    )
    await renderServer(RoomPage({ params: params({ id: 'room_online' }) }))
    const fit = screen.getByRole('table', { name: 'Course fit in Online' })
    expect(
      within(fit)
        .getAllByRole('columnheader')
        .map(h => h.textContent)
    ).toEqual(['Course', 'Fits'])
    const row = (name: RegExp) =>
      within(within(fit).getByRole('row', { name }))
        .getAllByRole('cell')
        .map(c => c.textContent)
    expect(row(/osobních/)).toEqual(['Ochrana osobních údajů', 'Fits'])
    expect(row(/BOZP/)).toEqual(['BOZP – základní školení', 'Not held online'])
    await expectNoAxeViolations()
  })
})

describe('room forms', () => {
  it('add a room, for admins only', async () => {
    expect(await newMetadata()).toEqual({ title: 'New room' })
    await renderServer(NewRoomPage())
    expect(requireAdminPage).toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: 'New room' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveProperty('value', '')
    await expectNoAxeViolations()
  })

  it('edit a room with its current values', async () => {
    signInAs('ADMIN')
    await renderServer(EditRoomPage({ params: params({ id: 'room_aula_a' }) }))
    expect(screen.getByRole('heading', { level: 1, name: 'Edit Aula A' })).toBeTruthy()
    expect(await editRoomMetadata({ params: params({ id: 'room_aula_a' }) })).toEqual({
      title: 'Edit Aula A',
    })
    expect(screen.getByRole('textbox', { name: /Seats/ })).toHaveProperty('value', '40')
    expect(screen.getByRole('checkbox', { name: 'Projector' }).getAttribute('aria-checked')).toBe(
      'true'
    )
    await expectNoAxeViolations()
    vi.mocked(getRoomForEdit).mockResolvedValueOnce(null)
    await expect(renderServer(EditRoomPage({ params: params({ id: 'gone' }) }))).rejects.toThrow(
      NotFoundError
    )
  })
})

describe('archiving a room', () => {
  it('asks first, and refuses while sessions ahead are held there', async () => {
    const user = userEvent.setup()
    signInAs('ADMIN')
    await renderServer(RoomPage({ params: params({ id: 'room_aula_a' }) }))
    await user.click(screen.getByRole('button', { name: 'Archive' }))
    const confirm = await screen.findByRole('dialog', { name: 'Archive Aula A?' })
    expect(previewArchive).toHaveBeenCalledWith('room', 'room_aula_a')
    expect(
      await within(confirm).findByText('7 sessions ahead are held here. Move or cancel them first.')
    ).toBeTruthy()
    expect(within(confirm).getByRole('button', { name: 'Archive' })).toHaveProperty(
      'disabled',
      true
    )
    await expectNoAxeViolations()
    await user.click(within(confirm).getByRole('button', { name: 'Keep as is' }))
    expect(archiveAction).not.toHaveBeenCalled()
  })

  it('offers no archiving to anyone but admins', async () => {
    signInAs('FULL')
    await renderServer(RoomPage({ params: params({ id: 'room_aula_a' }) }))
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
  })
})
