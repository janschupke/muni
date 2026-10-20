// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { roomRow } from '@/test/fixtures'
import { renderClient } from '@/test/render'

import { RoomsTable } from './rooms-table'

vi.mock('@/server/actions/archive', () => ({ archiveAction: vi.fn(), previewArchive: vi.fn() }))

const ROOMS = [
  roomRow({ id: 'room_lab', name: 'Laboratoř 2', kind: 'LAB', capacity: 12, utilisation: 0.6 }),
  roomRow({
    id: 'room_online',
    name: 'Online',
    kind: 'ONLINE',
    capacity: null,
    capabilities: [],
    utilisation: null,
  }),
  roomRow({ id: 'room_aula_a', name: 'Aula A', kind: 'CLASSROOM', capacity: 40, utilisation: 0.1 }),
]

/** The room each row names, top to bottom. */
const names = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map(row => within(row).getAllByRole('link')[0]?.textContent)

describe('RoomsTable', () => {
  it('sorts by kind and by how booked each room is, those without a figure last', async () => {
    const user = userEvent.setup()
    renderClient(<RoomsTable rooms={ROOMS} paging={{ local: 'the rooms a test gives' }} />)
    expect(names()).toEqual(['Laboratoř 2', 'Online', 'Aula A'])
    const online = screen.getByRole('row', { name: /^Online/ })
    expect(within(online).getByText('No limit')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Kind' }))
    expect(names()).toEqual(['Aula A', 'Laboratoř 2', 'Online'])

    await user.click(screen.getByRole('button', { name: 'Booked, next 30 days' }))
    expect(names()).toEqual(['Aula A', 'Laboratoř 2', 'Online'])
    await user.click(screen.getByRole('button', { name: 'Booked, next 30 days' }))
    expect(names()).toEqual(['Laboratoř 2', 'Aula A', 'Online'])
    // No admin, no actions.
    expect(screen.queryByRole('link', { name: /^Edit/ })).toBeNull()
  })

  it('gives admins an edit link and archiving on each row', () => {
    renderClient(<RoomsTable rooms={ROOMS} paging={{ local: 'the rooms a test gives' }} canEdit />)
    const aula = screen.getByRole('row', { name: /^Aula A/ })
    expect(within(aula).getByRole('link', { name: /Edit/ }).getAttribute('href')).toBe(
      '/rooms/room_aula_a/edit'
    )
    expect(within(aula).getByRole('button', { name: /Archive/ })).toBeTruthy()
  })
})
