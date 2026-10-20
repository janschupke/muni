// @vitest-environment jsdom
import { EMPTY_REFERENCE, type ImportBatch, parseFile, validateBatch } from '@muni/importer'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderClient } from '@/test/render'

import { ReviewStep } from './review-step'

const parse = (name: string, lines: string[]) =>
  parseFile(name, new TextEncoder().encode(lines.join('\n')), { today: '2026-10-16' })

const COURSES = parse('katalog.csv', [
  'kod,nazev,platnost_mesicu,povinne_pro',
  'BOZP-Z,BOZP – základní školení,24,VSICHNI',
  'XX,,24,VSICHNI',
])
const EMPLOYEES = parse('zamestnanci.csv', [
  'id_zamestnance,jmeno,prijmeni,datum_nastupu,stav',
  'E0153,Marie,Černá,2019-03-01,aktivní',
])

/** Courses (one with an error) and employees (all fine); no other dataset at all. */
function batch(): ImportBatch {
  const valid = validateBatch(
    { courses: COURSES.rows, employees: EMPLOYEES.rows } as ImportBatch,
    EMPTY_REFERENCE
  )
  return { courses: valid.courses ?? [], employees: valid.employees ?? [], rooms: [] }
}

function renderStep(columnsByKind = { courses: COURSES.columns, employees: EMPLOYEES.columns }) {
  const handlers = {
    onEdit: vi.fn(),
    onRemoved: vi.fn(),
    onRevert: vi.fn(),
    onBack: vi.fn(),
    onNext: vi.fn(),
  }
  renderClient(<ReviewStep batch={batch()} columnsByKind={columnsByKind} {...handlers} />)
  return handlers
}

describe('ReviewStep', () => {
  it('has a tab per dataset with rows, each counting its rows and its errors', () => {
    renderStep()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual([
      'Courses22 rows11 with errors',
      'Employees11 row',
    ])
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
  })

  it('removes and restores a row of the open dataset', async () => {
    const user = userEvent.setup()
    const { onRemoved } = renderStep()
    const panel = screen.getByRole('tabpanel')
    await user.click(within(panel).getByRole('button', { name: 'Remove line 3' }))
    expect(onRemoved).toHaveBeenLastCalledWith('courses', 1, true)
  })

  it('passes an edit and its undoing on with the dataset they belong to', async () => {
    const user = userEvent.setup()
    const { onEdit } = renderStep()
    await user.click(screen.getByRole('tab', { name: /Employees/ }))
    const panel = screen.getByRole('tabpanel')
    await user.click(within(panel).getByRole('button', { name: /Edit First name on line 2$/ }))
    await user.type(within(panel).getByRole('textbox'), 'na{Enter}')
    expect(onEdit).toHaveBeenLastCalledWith('employees', 0, 'firstName', 'Mariena')

    const onRevert = vi.fn()
    const edited = batch()
    edited.courses = (edited.courses ?? []).map(row => ({ ...row, isEdited: true }))
    renderClient(
      <ReviewStep
        batch={edited}
        columnsByKind={{}}
        onEdit={vi.fn()}
        onRemoved={vi.fn()}
        onRevert={onRevert}
        onBack={vi.fn()}
        onNext={vi.fn()}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Undo the edits on line 2' }))
    expect(onRevert).toHaveBeenLastCalledWith('courses', 0)
  })

  it('restores a removed row', async () => {
    const user = userEvent.setup()
    const onRemoved = vi.fn()
    const removed = batch()
    const [first] = removed.courses ?? []
    if (!first) throw new Error('no course row')
    removed.courses = [{ ...first, isRemoved: true }]
    renderClient(
      <ReviewStep
        batch={removed}
        columnsByKind={{}}
        onEdit={vi.fn()}
        onRemoved={onRemoved}
        onRevert={vi.fn()}
        onBack={vi.fn()}
        onNext={vi.fn()}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Restore line 2' }))
    expect(onRemoved).toHaveBeenLastCalledWith('courses', 0, false)
  })

  it('goes back to the files or on to confirming', async () => {
    const user = userEvent.setup()
    const { onBack, onNext } = renderStep()
    await user.click(screen.getByRole('button', { name: 'Back to files' }))
    expect(onBack).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('shows no tab for an empty batch', () => {
    renderClient(
      <ReviewStep
        batch={{}}
        columnsByKind={{}}
        onEdit={vi.fn()}
        onRemoved={vi.fn()}
        onRevert={vi.fn()}
        onBack={vi.fn()}
        onNext={vi.fn()}
      />
    )
    expect(screen.queryAllByRole('tab')).toEqual([])
  })
})
