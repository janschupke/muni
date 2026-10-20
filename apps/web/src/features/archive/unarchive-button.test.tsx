import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { UnarchiveButton } from '@/features/archive/unarchive-button'
import { unarchiveAction } from '@/server/actions/archive'
import { advisorInput } from '@/test/fixtures'
import { router } from '@/test/next'
import { renderClient } from '@/test/render'

// @vitest-environment jsdom

vi.mock('@/server/actions/assignments', () => ({ removeAssignmentAction: vi.fn() }))

vi.mock('@/server/actions/archive', () => ({ unarchiveAction: vi.fn() }))

afterEach(() => {
  vi.clearAllMocks()
})

const [T016, T018] = advisorInput().sessions
if (!T016 || !T018) throw new Error('fixture')

describe('bringing a record back', () => {
  it('asks, brings it back and goes where its page was opened from', async () => {
    const user = userEvent.setup()
    vi.mocked(unarchiveAction).mockResolvedValue({ status: 'done', href: '/rooms/r1' })
    renderClient(<UnarchiveButton kind="room" id="r1" name="Aula" then="/rooms" />)
    await user.click(screen.getByRole('button', { name: 'Bring back' }))
    const dialog = await screen.findByRole('dialog', { name: 'Bring back Aula?' })
    await user.click(within(dialog).getByRole('button', { name: 'Bring back' }))
    expect(await screen.findByText('Brought back: Aula')).toBeTruthy()
    await waitFor(() => {
      expect(router.push).toHaveBeenLastCalledWith('/rooms/r1')
    })
  })

  it('in a list, from its row', async () => {
    const user = userEvent.setup()
    vi.mocked(unarchiveAction).mockResolvedValue({ status: 'done' })
    renderClient(<UnarchiveButton kind="room" id="r1" name="Aula" compact />)
    await user.click(screen.getByRole('button', { name: /Aula/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Bring back Aula?' })
    await user.click(within(dialog).getByRole('button', { name: 'Bring back' }))
    expect(await screen.findByText('Brought back: Aula')).toBeTruthy()
    expect(router.push).not.toHaveBeenCalled()
  })
})
