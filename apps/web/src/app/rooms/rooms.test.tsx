// @vitest-environment jsdom
import { getRoom, getRoomForEdit, listRooms } from '@muni/db/repositories'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { removeRoom } from '@/server/actions/rooms'
import { getViewer, requirePageUser } from '@/server/auth'
import { expectNoAxeViolations } from '@/test/axe'
import { ONLINE, roomDetail, roomRow } from '@/test/fixtures'
import { NotFoundError } from '@/test/next'
import { params, renderServer } from '@/test/render'

import EditRoomPage from './[id]/edit/page'
import RoomPage, { generateMetadata as roomMetadata } from './[id]/page'
import NewRoomPage, { generateMetadata as newMetadata } from './new/page'
import RoomsPage, { generateMetadata as listMetadata } from './page'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getRoom: vi.fn(),
  getRoomForEdit: vi.fn(),
  listRooms: vi.fn(),
}))
vi.mock('@/server/auth')
vi.mock('@/server/actions/edit', () => ({ saveSession: vi.fn() }))
vi.mock('@/server/actions/rooms', () => ({
  saveRoom: vi.fn(),
  removeRoom: vi.fn(() =>
    Promise.resolve({ status: 'error', fieldErrors: {}, formError: 'in_use' })
  ),
}))

beforeEach(() => {
  vi.mocked(getViewer).mockResolvedValue('anonymous')
  vi.mocked(requirePageUser).mockResolvedValue('user_1')
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

  it('lets signed-in users add a room, and says when there are none', async () => {
    vi.mocked(getViewer).mockResolvedValue('authenticated')
    vi.mocked(listRooms).mockResolvedValue([])
    await renderServer(RoomsPage())
    expect(screen.getByRole('link', { name: 'New room' }).getAttribute('href')).toBe('/rooms/new')
    expect(screen.getByText('No rooms yet.')).toBeTruthy()
  })
})

describe('room detail', () => {
  const props = { params: params({ id: 'room_aula_a' }) }

  it('is titled by the room, or by the id when unknown', async () => {
    expect(await roomMetadata(props)).toEqual({ title: 'Aula A' })
    vi.mocked(getRoom).mockResolvedValue(null)
    expect(await roomMetadata({ params: params({ id: 'gone' }) })).toEqual({ title: 'gone' })
    await expect(RoomPage({ params: params({ id: 'gone' }) })).rejects.toThrow(NotFoundError)
  })

  it('shows its equipment, its sessions and which courses fit, read-only for visitors', async () => {
    await renderServer(RoomPage(props))
    expect(screen.getByRole('heading', { level: 1, name: 'Aula A' })).toBeTruthy()
    expect(screen.getByText('Wheelchair access')).toBeTruthy()
    expect(screen.getByText('Přízemí, vchod B')).toBeTruthy()
    expect(screen.getByText('25% of working hours')).toBeTruthy()
    // The course list, not the session table (which names courses too).
    const course = (name: string) =>
      screen
        .getAllByRole('link', { name })
        .map(link => link.closest('li'))
        .find(item => item !== null) as HTMLElement
    expect(within(course('BOZP – základní školení')).getByText('Fits')).toBeTruthy()
    expect(
      within(course('Bezpečná práce v laboratoři')).getByText('Missing Lab equipment')
    ).toBeTruthy()
    expect(within(course('Ochrana osobních údajů')).getByText('Seats only 40')).toBeTruthy()
    expect(within(course('Kybernetická bezpečnost')).getByText('Not held online')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Nov 4, 2026/ }).getAttribute('href')).toBe(
      '/sessions/T016'
    )
    expect(screen.getByRole('link', { name: '4 past sessions' }).getAttribute('href')).toBe(
      '/sessions?when=past&room=room_aula_a'
    )
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
  })

  it('says when nothing is scheduled, nothing came before and no course is set up', async () => {
    vi.mocked(getViewer).mockResolvedValue('authenticated')
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
    expect(screen.getByText('No course has its session needs set yet.')).toBeTruthy()
    expect(screen.queryByText(/past session/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
      '/rooms/room_online/edit'
    )
  })
})

describe('room forms', () => {
  it('add a room, for signed-in users only', async () => {
    expect(await newMetadata()).toEqual({ title: 'New room' })
    await renderServer(NewRoomPage())
    expect(requirePageUser).toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: 'New room' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveProperty('value', '')
    await expectNoAxeViolations()
  })

  it('edit a room with its current values, and refuse to delete one in use', async () => {
    const user = userEvent.setup()
    await renderServer(EditRoomPage({ params: params({ id: 'room_aula_a' }) }))
    expect(screen.getByRole('heading', { level: 1, name: 'Edit Aula A' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /Seats/ })).toHaveProperty('value', '40')
    expect(screen.getByRole('checkbox', { name: 'Projector' }).getAttribute('aria-checked')).toBe(
      'true'
    )
    await expectNoAxeViolations()
    // It asks first: cancelling deletes nothing.
    await user.click(screen.getByRole('button', { name: 'Delete room' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete Aula A?' })
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(removeRoom).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete room' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' })
    )
    expect(removeRoom).toHaveBeenCalled()
    expect(
      await screen.findByText('The room still has sessions, so it cannot be deleted.')
    ).toBeTruthy()
    vi.mocked(getRoomForEdit).mockResolvedValue(null)
    await expect(EditRoomPage({ params: params({ id: 'gone' }) })).rejects.toThrow(NotFoundError)
  })
})
