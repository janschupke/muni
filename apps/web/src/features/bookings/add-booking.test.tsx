// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { addBookingAction } from '@/server/actions/assignments'
import { renderClient } from '@/test/render'

import { AddBookingForm } from './add-booking'

vi.mock('@/server/actions/assignments', () => ({ addBookingAction: vi.fn() }))

afterEach(() => {
  vi.clearAllMocks()
})

const renderForm = () =>
  renderClient(
    <AddBookingForm sessionExternalId="T016" options={[{ value: 'E0153', label: 'Černá Marie' }]} />
  )

const book = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('combobox', { name: /Person to book/ }))
  await user.click(screen.getByRole('option', { name: 'Černá Marie' }))
  await user.click(screen.getByRole('button', { name: 'Book' }))
}

describe('AddBookingForm', () => {
  it('says who was booked, and says so when the server could not be reached', async () => {
    const user = userEvent.setup()
    vi.mocked(addBookingAction).mockResolvedValueOnce({ status: 'done' })
    renderForm()
    await book(user)
    expect(await screen.findByText('Booked: Černá Marie')).toBeTruthy()

    vi.mocked(addBookingAction).mockRejectedValueOnce(new Error('offline'))
    await book(user)
    expect(
      await screen.findByText('That did not go through. Check the page and try again.')
    ).toBeTruthy()
  })

  it('says when nobody needs the training', () => {
    renderClient(<AddBookingForm sessionExternalId="T016" options={[]} />)
    expect(
      screen.getByText(
        'Nobody needs this training now: everyone it is required of holds it or is booked.'
      )
    ).toBeTruthy()
  })
})
