// @vitest-environment jsdom
import { getAdvisorInput } from '@muni/db/repositories'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { signInAs } from '@/test/auth'
import { expectLogged } from '@/test/console'
import { advisorInput } from '@/test/fixtures'
import { renderClient } from '@/test/render'

import { BookNeedButton } from './book-button'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getAdvisorInput: vi.fn(),
}))
vi.mock('@/server/auth')
const { applyAssignmentsAction } = vi.hoisted(() => ({
  applyAssignmentsAction: vi.fn(() => Promise.resolve({ ok: true, applied: 1, failed: [] })),
}))
vi.mock('@/server/actions/assignments', () => ({ applyAssignmentsAction }))

beforeEach(() => {
  signInAs('ADMIN')
  vi.mocked(getAdvisorInput).mockResolvedValue(advisorInput())
})
afterEach(() => {
  vi.clearAllMocks()
})

const open = async (query: Parameters<typeof BookNeedButton>[0]['query']) => {
  const user = userEvent.setup()
  renderClient(<BookNeedButton query={query} label="Book for them…" />)
  await user.click(screen.getByRole('button', { name: 'Book for them…' }))
  return { user, dialog: await screen.findByRole('dialog', { name: 'Book trainings' }) }
}

describe('booking what a query names', () => {
  it('reads the trainings as it opens, and books the proposed session', async () => {
    let answer: (input: ReturnType<typeof advisorInput>) => void = () => undefined
    vi.mocked(getAdvisorInput).mockReturnValue(
      new Promise(resolve => {
        answer = resolve
      })
    )
    const { user, dialog } = await open({ employee: 'E0153' })
    // Read as the dialog opens: nothing to confirm yet.
    expect((await within(dialog).findByRole('status')).textContent).toBe('Finding sessions…')
    expect(within(dialog).getByRole('button', { name: /^Book 0 trainings/ })).toHaveProperty(
      'disabled',
      true
    )
    answer(advisorInput())
    const choice = await within(dialog).findByRole('combobox', { name: 'Session for Černá Marie' })
    expect(choice.textContent).toMatch(/03.02.2027/)
    // One training: nothing to leave out.
    expect(within(dialog).queryByRole('checkbox')).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: /^Book 1 training · 450,00\sKč$/ }))
    expect(applyAssignmentsAction).toHaveBeenCalledWith([
      { sessionExternalId: 'T018', employeeExternalId: 'E0153', source: 'MANUAL' },
    ])
    expect(await screen.findByText('Booked 1 training')).toBeTruthy()
  })

  it('says why a training cannot be booked, and how to get a session for it', async () => {
    const { dialog } = await open({ employee: 'E0002' })
    expect(await within(dialog).findByText('No session scheduled')).toBeTruthy()
    expect(
      within(dialog).getByRole('link', { name: 'Schedule a session' }).getAttribute('href')
    ).toBe('/courses/POZ-OCH/sessions/new')
    expect(within(dialog).getByRole('button', { name: /^Book 0 trainings/ })).toHaveProperty(
      'disabled',
      true
    )
  })

  it('says when nothing is left to book, and when the read failed', async () => {
    const { user, dialog } = await open({ employee: 'E9999' })
    expect(
      await within(dialog).findByText(
        'Nothing to book: every training here is held or already booked.'
      )
    ).toBeTruthy()
    await user.keyboard('{Escape}')
    vi.mocked(getAdvisorInput).mockRejectedValue(new Error('offline'))
    expectLogged('error')
    await user.click(screen.getByRole('button', { name: 'Book for them…' }))
    const failed = await screen.findByRole('dialog', { name: 'Book trainings' })
    expect(
      await within(failed).findByText('That did not go through. Check the page and try again.')
    ).toBeTruthy()
  })
})
