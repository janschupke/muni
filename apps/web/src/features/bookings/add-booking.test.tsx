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
    <AddBookingForm
      fixed={{ sessionExternalId: 'T016' }}
      field="employeeExternalId"
      label="Person to book"
      options={[{ value: 'E0153', label: 'Černá Marie' }]}
    />
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

  it('says when there is nothing left to book', () => {
    renderClient(
      <AddBookingForm
        fixed={{ sessionExternalId: 'T016' }}
        field="employeeExternalId"
        label="Person to book"
        options={[]}
      />
    )
    expect(screen.getByText('Nothing left to book here.')).toBeTruthy()
  })
})
