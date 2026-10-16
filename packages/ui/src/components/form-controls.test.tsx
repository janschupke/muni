import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { render } from '../test/render'
import { Checkbox } from './checkbox'
import { Dropzone } from './dropzone'
import { Field, FieldRow, Hint, Input, Textarea } from './field'

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

describe('Checkbox', () => {
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
