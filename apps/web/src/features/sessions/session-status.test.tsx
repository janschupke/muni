// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RecordActions, RowActions } from '@/components/views/record-actions'
import { cancelSessionAction, reinstateSessionAction } from '@/server/actions/sessions'
import { renderClient } from '@/test/render'

import { SessionStatusButton } from './session-status-button'
import { sessionTarget } from './session-target'

vi.mock('@/server/actions/sessions', () => ({
  cancelSessionAction: vi.fn(),
  reinstateSessionAction: vi.fn(),
}))
vi.mock('@/server/actions/archive', () => ({ previewArchive: vi.fn(), archiveAction: vi.fn() }))

afterEach(() => {
  vi.clearAllMocks()
})

const NAME = 'T016 · BOZP – základní školení'

describe('cancelling a session', () => {
  const cancel = async () => {
    const user = userEvent.setup()
    renderClient(<SessionStatusButton act="cancel" externalId="T016" name={NAME} named={2} />)
    await user.click(screen.getByRole('button', { name: 'Cancel session…' }))
    const dialog = await screen.findByRole('dialog', { name: `Cancel ${NAME}?` })
    return { user, dialog }
  }

  it('says what happens to the people on it, and cancels only when told', async () => {
    vi.mocked(cancelSessionAction).mockResolvedValue({ ok: true })
    const { user, dialog } = await cancel()
    expect(within(dialog).getByText(/The 2 people booked stay listed on it/)).toBeTruthy()
    expect(within(dialog).getByText(/then it can be archived/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Keep session' }))
    expect(cancelSessionAction).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel session…' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel session' })
    )
    expect(await screen.findByText(`Session cancelled: ${NAME}`)).toBeTruthy()
    expect(cancelSessionAction).toHaveBeenCalledWith('T016')
  })

  it('says why the server would not, in the dialog', async () => {
    vi.mocked(cancelSessionAction).mockResolvedValue({ ok: false, reason: 'STARTED' })
    const { user, dialog } = await cancel()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel session' }))
    expect(
      await within(dialog).findByText('It has started: what took place stays as it was.')
    ).toBeTruthy()
  })

  it('is an icon in a table row', () => {
    renderClient(
      <SessionStatusButton act="cancel" externalId="T016" name={NAME} named={0} compact />
    )
    expect(screen.getByRole('button', { name: `Cancel ${NAME}` })).toBeTruthy()
  })
})

describe('reinstating a session', () => {
  it('plans it again, or says what is in the way', async () => {
    const user = userEvent.setup()
    vi.mocked(reinstateSessionAction)
      .mockResolvedValueOnce({ ok: false, reason: 'ROOM_BUSY' })
      .mockResolvedValueOnce({ ok: false, reason: 'unauthorized' })
      .mockResolvedValueOnce({ ok: true })
    renderClient(<SessionStatusButton act="reinstate" externalId="T017" name={NAME} named={1} />)
    await user.click(screen.getByRole('button', { name: 'Reinstate…' }))
    const dialog = await screen.findByRole('dialog', { name: `Plan ${NAME} again?` })
    const confirm = () => within(dialog).getByRole('button', { name: 'Reinstate' })
    // The reason and the button's return come together: once the reason shows, the button
    // can be pressed again (it no longer says it is working).
    const refused = async (reason: string) => {
      await within(dialog).findByText(reason)
      expect((confirm() as HTMLButtonElement).disabled).toBe(false)
    }
    await user.click(confirm())
    await refused('Another planned session uses this room at that time.')
    await user.click(confirm())
    await refused('your account may no longer make changes; sign in again')
    await user.click(confirm())
    expect(await screen.findByText(`Session planned again: ${NAME}`)).toBeTruthy()
  })
})

describe('a session’s actions, by where it stands', () => {
  const now = new Date('2026-11-04T09:00:00Z')
  const DAY = { ahead: '2026-11-05', today: '2026-11-04', before: '2026-11-03' }
  const at = (day: string, status: 'PLANNED' | 'CANCELLED' = 'PLANNED', row = false) =>
    sessionTarget(
      {
        id: 'ses_T016',
        externalId: 'T016',
        courseName: 'BOZP – základní školení',
        status,
        startsAt: `${day}T08:00:00Z`,
        endsAt: `${day}T10:00:00Z`,
        bookings: [],
      },
      { now, row }
    )
  const buttons = (ui: React.ReactNode, name: (b: HTMLElement) => string | null) => {
    const { unmount } = renderClient(ui)
    const names = screen.queryAllByRole('button').map(name)
    unmount()
    return names
  }
  const page = (target: ReturnType<typeof at>) =>
    buttons(<RecordActions {...target} then="/sessions" />, b => b.textContent)
  const row = (target: ReturnType<typeof at>) =>
    buttons(<RowActions {...target} />, b => b.getAttribute('aria-label'))

  it('cancels one still to start, leaves one under way, archives one over or cancelled', () => {
    expect(page(at(DAY.ahead))).toEqual(['Cancel session…'])
    expect(page(at(DAY.today))).toEqual([])
    expect(page(at(DAY.before))).toEqual(['Archive'])
    expect(page(at(DAY.ahead, 'CANCELLED'))).toEqual(['Reinstate…', 'Archive'])
    expect(page(at(DAY.before, 'CANCELLED'))).toEqual(['Archive'])
  })

  it('in a table row, the same as icons, and no reinstating', () => {
    expect(row(at(DAY.ahead, 'PLANNED', true))).toEqual([`Cancel ${NAME}`])
    expect(row(at(DAY.today, 'PLANNED', true))).toEqual([])
    expect(row(at(DAY.ahead, 'CANCELLED', true))).toEqual([`Archive ${NAME}`])
  })
})
