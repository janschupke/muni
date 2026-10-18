import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { render } from '../test/render'
import { Checkbox } from './checkbox'
import { Dropzone } from './dropzone'
import { Field, FieldRow, Fieldset, FieldValue, Hint, Input, Textarea } from './field'

describe('Field', () => {
  it('names the control by its label alone and links help and error', () => {
    render(
      <Field label="Kapacita" help="Celkový počet míst." error="Musí být kladné číslo." required>
        {props => <Input {...props} defaultValue="-1" />}
      </Field>
    )
    const input = screen.getByRole('textbox', { name: 'Kapacita' })
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.hasAttribute('required')).toBe(true)
    const describedBy = (input.getAttribute('aria-describedby') ?? '').split(' ')
    expect(describedBy.map(id => document.getElementById(id)?.textContent)).toEqual([
      'Celkový počet míst.',
      'Musí být kladné číslo.',
    ])
  })

  it('shows a worked-out value in a field’s place, labelled, not to be typed in', () => {
    render(
      <FieldValue label="Konec" help="Délka kurzu po začátku.">
        11:00
      </FieldValue>
    )
    const value = screen.getByRole('status', { name: 'Konec' })
    expect(value.tagName).toBe('OUTPUT')
    expect(value.textContent).toBe('11:00')
    expect(document.getElementById(value.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Délka kurzu po začátku.'
    )
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('marks the field it belongs to, and whether it changed or was visited', () => {
    const { container } = render(
      <Field label="Jméno" name="firstName" dirty touched error="Povinné.">
        {props => <Input {...props} />}
      </Field>
    )
    const field = container.querySelector('[data-field="firstName"]')
    expect(field?.getAttribute('data-dirty')).toBe('true')
    expect(field?.getAttribute('data-touched')).toBe('true')
    expect(field?.getAttribute('data-invalid')).toBe('true')
    expect(screen.getByText('Povinné.').getAttribute('aria-live')).toBe('polite')
  })

  it('describes nothing when there is nothing to say', () => {
    render(
      <FieldRow columns={3}>
        <Field label="Poznámka">{props => <Textarea {...props} />}</Field>
        <Field label="Cena">{props => <Input {...props} size="sm" />}</Field>
      </FieldRow>
    )
    const note = screen.getByRole('textbox', { name: 'Poznámka' })
    expect(note.hasAttribute('aria-describedby')).toBe(false)
    expect(note.hasAttribute('aria-invalid')).toBe(false)
    expect(screen.getByRole('textbox', { name: 'Cena' }).className).toContain('h-8')
  })

  it('lays fields side by side in two columns by default', () => {
    const { container } = render(
      <>
        <FieldRow>
          <span>a</span>
        </FieldRow>
        <Hint>Nápověda</Hint>
      </>
    )
    expect(container.firstElementChild?.className).toContain('sm:grid-cols-2')
    expect(screen.getByText('Nápověda').className).toContain('text-xs')
  })
})

describe('Fieldset', () => {
  it('names a group of controls and links its help and error to it', () => {
    render(
      <Fieldset
        name="departmentIds"
        legend="Departments"
        help="Where the position exists."
        error="Pick one."
      >
        <Checkbox name="departmentIds" value="d1" label="Laboratoře" />
      </Fieldset>
    )
    const group = screen.getByRole('group', { name: 'Departments' })
    expect(group.getAttribute('data-invalid')).toBe('true')
    const described = (group.getAttribute('aria-describedby') ?? '').split(' ')
    expect(described.map(id => document.getElementById(id)?.textContent)).toEqual([
      'Where the position exists.',
      'Pick one.',
    ])
  })
})

describe('disabled controls', () => {
  it('lose their fill instead of fading, so they never look like an enabled one', () => {
    render(
      <>
        <Input aria-label="Jméno" disabled />
        <Checkbox label="Vede oddělení" disabled />
      </>
    )
    for (const control of [
      screen.getByRole('textbox', { name: 'Jméno' }),
      screen.getByRole('checkbox', { name: 'Vede oddělení' }),
    ]) {
      expect(control.className).toContain('bg-control')
      expect(control.className).toContain('border-border-control')
      expect(control.className).toContain('disabled:bg-transparent')
      expect(control.className).not.toMatch(/disabled:opacity/)
    }
  })
})

describe('Checkbox', () => {
  it('can be marked wrong and described', () => {
    render(
      <>
        <Checkbox label="Vede oddělení" aria-invalid aria-describedby="why" />
        <p id="why">Nejdřív zvolte oddělení.</p>
      </>
    )
    const box = screen.getByRole('checkbox', { name: 'Vede oddělení' })
    expect(box.getAttribute('aria-invalid')).toBe('true')
    expect(box.getAttribute('aria-describedby')).toBe('why')
  })

  it('is labelled, toggles, and reports a boolean', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(<Checkbox label="Jen aktivní" name="active" onCheckedChange={onCheckedChange} />)
    const box = screen.getByRole('checkbox', { name: 'Jen aktivní' })
    await user.click(box)
    expect(box.getAttribute('aria-checked')).toBe('true')
    expect(onCheckedChange).toHaveBeenLastCalledWith(true)
    await user.click(screen.getByText('Jen aktivní'))
    expect(onCheckedChange).toHaveBeenLastCalledWith(false)
  })

  it('works without a change handler', async () => {
    const user = userEvent.setup()
    render(<Checkbox label="Online" defaultChecked />)
    await user.click(screen.getByRole('checkbox', { name: 'Online' }))
    expect(screen.getByRole('checkbox', { name: 'Online' }).getAttribute('aria-checked')).toBe(
      'false'
    )
  })
})

describe('Dropzone', () => {
  const csv = (name: string) => new File(['kod;nazev'], name, { type: 'text/csv' })

  it('takes files from the picker and clears it, so the same file can be picked again', async () => {
    const user = userEvent.setup()
    const onFiles = vi.fn()
    render(
      <Dropzone title="Přetáhněte soubory" hint="CSV" accept=".csv" multiple onFiles={onFiles} />
    )
    const input = screen.getByLabelText<HTMLInputElement>(/Přetáhněte soubory/)
    await user.upload(input, [csv('katalog.csv'), csv('terminy.csv')])
    expect(onFiles).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'katalog.csv' }),
      expect.objectContaining({ name: 'terminy.csv' }),
    ])
    expect(input.value).toBe('')
  })

  it('highlights while dragging and takes dropped files', () => {
    const onFiles = vi.fn()
    render(<Dropzone title="Přetáhněte soubory" onFiles={onFiles} />)
    const zone = screen.getByText('Přetáhněte soubory').closest('label') as HTMLElement
    fireEvent.dragOver(zone)
    expect(zone.className).toContain('border-accent')
    fireEvent.dragLeave(zone)
    expect(zone.className).not.toContain('border-accent')
    fireEvent.drop(zone, { dataTransfer: { files: [csv('zamestnanci.csv')] } })
    expect(onFiles).toHaveBeenCalledWith([expect.objectContaining({ name: 'zamestnanci.csv' })])
  })

  it('reports no files when the picker is cancelled', () => {
    const onFiles = vi.fn()
    render(<Dropzone title="Soubory" onFiles={onFiles} />)
    const input = screen.getByLabelText('Soubory')
    Object.defineProperty(input, 'files', { value: null, configurable: true })
    fireEvent.change(input)
    expect(onFiles).toHaveBeenCalledWith([])
  })
})
