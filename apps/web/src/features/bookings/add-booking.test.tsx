// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
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

  it('starts on the person a link named, and says it is booking while the server answers', async () => {
    const user = userEvent.setup()
    let answer: (state: { status: 'done' }) => void = () => undefined
    vi.mocked(addBookingAction).mockReturnValueOnce(
      new Promise(resolve => {
        answer = resolve
      })
    )
    renderClient(
      <AddBookingForm
        sessionExternalId="T016"
        options={[
          { value: 'E0153', label: 'Černá Marie' },
          { value: 'E0154', label: 'Dvořák Jan' },
        ]}
        initial="E0154"
      />
    )
    expect(screen.getByRole('combobox', { name: /Person to book/ }).textContent).toContain(
      'Dvořák Jan'
    )
    await user.click(screen.getByRole('button', { name: 'Book' }))
    expect(await screen.findByRole('button', { name: 'Booking…' })).toHaveProperty('disabled', true)
    answer({ status: 'done' })
    expect(await screen.findByText('Booked: Dvořák Jan')).toBeTruthy()
    // The select starts over: the named person is not chosen again.
    expect(screen.getByRole('combobox', { name: /Person to book/ }).textContent).toContain(
      'Choose…'
    )
  })

  it('ignores a named person who is not on offer', () => {
    renderClient(
      <AddBookingForm
        sessionExternalId="T016"
        options={[{ value: 'E0153', label: 'Černá Marie' }]}
        initial="E9999"
      />
    )
    expect(screen.getByRole('combobox', { name: /Person to book/ }).textContent).toContain(
      'Choose…'
    )
  })

  it('asks for a person when none was chosen, and says why the server refused a booking', async () => {
    const user = userEvent.setup()
    vi.mocked(addBookingAction).mockResolvedValueOnce({ status: 'refused', reason: 'invalid' })
    const { container } = renderForm()
    // The browser holds back a form with nothing chosen; one sent anyway is refused by the
    // server, and the field says what is missing.
    const form = container.querySelector('form')
    if (!form) throw new Error('no form')
    fireEvent.submit(form)
    expect(await screen.findByText('Choose whom or what to book first.')).toBeTruthy()

    vi.mocked(addBookingAction).mockResolvedValueOnce({
      status: 'refused',
      reason: 'SESSION_FULL',
    })
    await book(user)
    expect(await screen.findByText('Not booked: the session is full.')).toBeTruthy()
    expect(screen.queryByText('Choose whom or what to book first.')).toBeNull()
  })

  it('waits, disabled, while the people who can be booked are read', () => {
    renderClient(<AddBookingForm sessionExternalId="T016" options="loading" />)
    const select = screen.getByRole('combobox', { name: /Person to book/ })
    expect(select.textContent).toContain('Loading…')
    expect(select).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Book' })).toHaveProperty('disabled', true)
    expect(screen.queryByText(/Nobody needs this training/)).toBeNull()
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
