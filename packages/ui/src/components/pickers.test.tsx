import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { render } from '../test/render'
import { DatePicker } from './date-picker'
import { Field } from './field'
import { TimePicker } from './time-picker'

const DATE_LABELS = {
  open: 'Choose date',
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  previousYear: 'Previous year',
  nextYear: 'Next year',
  today: 'Today',
  clear: 'Clear',
  format: { day: 'dd', month: 'mm', year: 'rrrr' },
}
const TIME_LABELS = { open: 'Choose time', hours: 'Hours', minutes: 'Minutes' }

function renderDate(props: Partial<Parameters<typeof DatePicker>[0]> = {}) {
  render(
    <form aria-label="form">
      <Field label="Completed on" error={props['aria-invalid'] ? 'Wrong' : undefined}>
        {control => (
          <DatePicker
            {...control}
            name="completedOn"
            locale="cs"
            today="2026-10-16"
            labels={DATE_LABELS}
            {...props}
          />
        )}
      </Field>
    </form>
  )
  const form = screen.getByRole<HTMLFormElement>('form', { name: 'form' })
  return {
    input: screen.getByRole<HTMLInputElement>('textbox', { name: 'Completed on' }),
    posted: () => new FormData(form).get('completedOn'),
  }
}

describe('DatePicker', () => {
  it('shows the date the way it is written here, and posts it as ISO', () => {
    const { input, posted } = renderDate({ defaultValue: '2026-03-01' })
    expect(input.value).toBe('01.03.2026')
    expect(posted()).toBe('2026-03-01')
    // Empty, it shows the format, never a date that could pass for a value.
    expect(input.getAttribute('placeholder')).toBe('dd.mm.rrrr')
  })

  it('reads a typed date on leaving the field, and posts what it cannot read as typed', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    const { input, posted } = renderDate({ onValueChange })
    await user.type(input, '5.11.26')
    expect(posted()).toBe('2026-11-05')
    await user.tab()
    expect(input.value).toBe('05.11.2026')
    expect(onValueChange).toHaveBeenCalledWith('2026-11-05')

    await user.clear(input)
    await user.type(input, '31. 2. 2026')
    await user.tab()
    expect(input.value).toBe('31. 2. 2026')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(posted()).toBe('31. 2. 2026')

    await user.clear(input)
    await user.type(input, '2026-12-24{Enter}')
    expect(input.value).toBe('24.12.2026')
    await user.clear(input)
    await user.tab()
    expect(posted()).toBe('')
  })

  it('picks a day from the calendar with the mouse', async () => {
    const user = userEvent.setup()
    const { input, posted } = renderDate({ defaultValue: '2026-03-01' })
    await user.click(screen.getByRole('button', { name: 'Choose date' }))
    const grid = screen.getByRole('grid', { name: 'březen 2026' })
    // The chosen day is selected and focused; today is marked.
    const first = within(grid).getByRole('button', { name: 'neděle 1. března 2026' })
    expect(first.closest('td')?.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(first)
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByRole('grid', { name: 'duben 2026' })).toBeTruthy()
    // The month button keeps the focus, so it can be pressed again.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next month' }))
    await user.click(screen.getByRole('button', { name: 'Previous year' }))
    await user.click(screen.getByRole('button', { name: 'Next year' }))
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await user.click(within(screen.getByRole('grid')).getByRole('button', { name: /^úterý 17\./ }))
    expect(screen.queryByRole('grid')).toBeNull()
    expect(input.value).toBe('17.03.2026')
    expect(posted()).toBe('2026-03-17')
  })

  it('moves through the calendar from the keyboard', async () => {
    const user = userEvent.setup()
    const { posted } = renderDate({ defaultValue: '2026-03-04' })
    await user.click(screen.getByRole('button', { name: 'Choose date' }))
    const focused = () => document.activeElement?.getAttribute('aria-label')
    await user.keyboard('{ArrowRight}')
    expect(focused()).toBe('čtvrtek 5. března 2026')
    await user.keyboard('{ArrowDown}')
    expect(focused()).toBe('čtvrtek 12. března 2026')
    await user.keyboard('{ArrowUp}{ArrowLeft}')
    expect(focused()).toBe('středa 4. března 2026')
    await user.keyboard('{Home}')
    expect(focused()).toBe('pondělí 2. března 2026')
    await user.keyboard('{End}')
    expect(focused()).toBe('neděle 8. března 2026')
    await user.keyboard('{PageDown}')
    expect(focused()).toBe('středa 8. dubna 2026')
    await user.keyboard('{PageUp}{PageUp}')
    expect(focused()).toBe('neděle 8. února 2026')
    await user.keyboard('{Shift>}{PageDown}{/Shift}')
    expect(focused()).toBe('pondělí 8. února 2027')
    await user.keyboard('{Shift>}{PageUp}{/Shift}{Enter}')
    expect(posted()).toBe('2026-02-08')
    expect(screen.queryByRole('grid')).toBeNull()
  })

  it('keeps to its bounds, and offers today and clearing', async () => {
    const user = userEvent.setup()
    const { posted } = renderDate({
      defaultValue: '2026-10-10',
      min: '2026-10-05',
      max: '2026-10-20',
      isDateDisabled: iso => iso === '2026-10-12',
    })
    await user.click(screen.getByRole('button', { name: 'Choose date' }))
    const grid = screen.getByRole('grid')
    expect(within(grid).getByRole('button', { name: /^neděle 4\./ })).toHaveProperty(
      'disabled',
      true
    )
    expect(within(grid).getByRole('button', { name: /^pondělí 12\./ })).toHaveProperty(
      'disabled',
      true
    )
    // The keys stop at the bounds.
    await user.keyboard('{PageDown}')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('úterý 20. října 2026')
    expect(
      within(grid)
        .getByRole('button', { name: /^pátek 16\./ })
        .getAttribute('aria-current')
    ).toBe('date')
    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(posted()).toBe('2026-10-16')
    await user.click(screen.getByRole('button', { name: 'Choose date' }))
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(posted()).toBe('')
  })

  it('offers no clearing when a date is required, and follows a controlled value', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <DatePicker value="2026-01-02" locale="en" labels={DATE_LABELS} required />
    )
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('02.01.2026')
    rerender(<DatePicker value="2026-01-03" locale="en" labels={DATE_LABELS} required />)
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('03.01.2026')
    await user.click(screen.getByRole('button', { name: 'Choose date' }))
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })
})

function renderTime(props: Partial<Parameters<typeof TimePicker>[0]> = {}) {
  render(
    <form aria-label="form">
      <Field label="Start">
        {control => <TimePicker {...control} name="startTime" labels={TIME_LABELS} {...props} />}
      </Field>
    </form>
  )
  const form = screen.getByRole<HTMLFormElement>('form', { name: 'form' })
  return {
    input: screen.getByRole<HTMLInputElement>('textbox', { name: 'Start' }),
    posted: () => new FormData(form).get('startTime'),
  }
}

describe('TimePicker', () => {
  it('reads a typed time into HH:mm, and posts what it cannot read as typed', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    const { input, posted } = renderTime({ onValueChange })
    await user.type(input, '930')
    await user.tab()
    expect(input.value).toBe('09:30')
    expect(posted()).toBe('09:30')
    expect(onValueChange).toHaveBeenCalledWith('09:30')
    await user.clear(input)
    await user.type(input, '25:00')
    await user.tab()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(posted()).toBe('25:00')
    await user.clear(input)
    await user.type(input, '7.05{Enter}')
    expect(input.value).toBe('07:05')
  })

  it('picks the hour and then the minute', async () => {
    const user = userEvent.setup()
    const { input, posted } = renderTime({ defaultValue: '08:00', minuteStep: 15 })
    await user.click(screen.getByRole('button', { name: 'Choose time' }))
    const hours = screen.getByRole('listbox', { name: 'Hours' })
    expect(within(hours).getByRole('option', { name: '08' }).getAttribute('aria-selected')).toBe(
      'true'
    )
    expect(document.activeElement?.textContent).toBe('08')
    await user.click(within(hours).getByRole('option', { name: '13' }))
    expect(posted()).toBe('13:00')
    const minutes = screen.getByRole('listbox', { name: 'Minutes' })
    expect(
      within(minutes)
        .getAllByRole('option')
        .map(o => o.textContent)
    ).toEqual(['00', '15', '30', '45'])
    await user.click(within(minutes).getByRole('option', { name: '45' }))
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input.value).toBe('13:45')
  })

  it('is operable from the keyboard', async () => {
    const user = userEvent.setup()
    const { posted } = renderTime()
    await user.click(screen.getByRole('button', { name: 'Choose time' }))
    expect(document.activeElement?.textContent).toBe('00')
    await user.keyboard('{End}{ArrowUp}{ArrowUp}{ArrowDown}{Enter}')
    expect(posted()).toBe('22:00')
    // The minutes have the focus now.
    expect(document.activeElement?.closest('[role="listbox"]')?.getAttribute('aria-label')).toBe(
      'Minutes'
    )
    await user.keyboard('{Home}{ArrowDown}{ArrowDown} ')
    expect(posted()).toBe('22:10')
  })
})
