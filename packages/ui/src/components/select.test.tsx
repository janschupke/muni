import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { render } from '../test/render'
import { Field } from './field'
import { Select } from './select'

const DEPARTMENTS = [
  { value: 'Laboratoře', label: 'Laboratoře' },
  { value: 'Správa budov', label: 'Správa budov' },
  { value: 'Studijní oddělení', label: 'Studijní oddělení' },
]

function renderInForm(props: Partial<Parameters<typeof Select>[0]> = {}) {
  render(
    <form aria-label="filters">
      <Field label="Department">
        {control => (
          <Select
            {...control}
            name="department"
            options={DEPARTMENTS}
            emptyLabel="Any"
            {...props}
          />
        )}
      </Field>
    </form>
  )
  const form = screen.getByRole<HTMLFormElement>('form', { name: 'filters' })
  return { posted: () => new FormData(form).get('department') }
}

describe('Select', () => {
  it('is a combobox named by its Field label', () => {
    renderInForm()
    expect(screen.getByRole('combobox', { name: 'Department' })).toBeTruthy()
  })

  it('posts an empty string for the empty option, the value otherwise', async () => {
    const user = userEvent.setup()
    const { posted } = renderInForm({ defaultValue: 'Laboratoře' })
    expect(posted()).toBe('Laboratoře')
    expect(screen.getByRole('combobox').textContent).toContain('Laboratoře')

    await user.click(screen.getByRole('combobox', { name: 'Department' }))
    await user.click(screen.getByRole('option', { name: 'Any' }))
    expect(posted()).toBe('')
    expect(screen.getByRole('combobox').textContent).toContain('Any')

    await user.click(screen.getByRole('combobox', { name: 'Department' }))
    await user.click(screen.getByRole('option', { name: 'Správa budov' }))
    expect(posted()).toBe('Správa budov')
  })

  it('is operable from the keyboard', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    renderInForm({ onValueChange })

    screen.getByRole('combobox', { name: 'Department' }).focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('listbox')).toBeTruthy()
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onValueChange).toHaveBeenLastCalledWith('Správa budov')
  })

  it('shows the placeholder when there is no value and no empty option', () => {
    render(<Select aria-label="Course" options={DEPARTMENTS} placeholder="Choose…" />)
    expect(screen.getByRole('combobox', { name: 'Course' }).textContent).toContain('Choose…')
  })
})
