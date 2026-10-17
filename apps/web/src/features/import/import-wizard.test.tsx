// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { EMPTY_REFERENCE } from '@muni/importer'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { renderClient } from '@/test/render'

import { ImportWizard } from './import-wizard'

// The server action and router are the only things replaced; parsing, validation, the
// review table and the commit loop are the real code, driven with the real exports.
const commitImportChunk = vi.fn((_kind: string, records: unknown[]) =>
  Promise.resolve({ ok: true as const, created: records.length, updated: 0, skipped: 0 })
)
vi.mock('./actions', () => ({
  commitImportChunk: (kind: string, records: unknown[]) => commitImportChunk(kind, records),
  findArchived: async () => (await import('@muni/importer')).NO_ARCHIVED,
}))

const DATA = path.join(import.meta.dirname, '../../../../../data')
const csv = (name: string) =>
  new File([readFileSync(path.join(DATA, name))], name, { type: 'text/csv' })

function renderWizard() {
  return renderClient(<ImportWizard reference={EMPTY_REFERENCE} today="2026-10-16" />)
}

afterEach(() => {
  cleanup()
  commitImportChunk.mockClear()
})

describe('ImportWizard', () => {
  it('runs upload → review → fix → confirm → import with the real exports', async () => {
    const user = userEvent.setup()
    const { container } = renderWizard()

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('file input missing')
    await user.upload(input, [
      csv('katalog_skoleni.csv'),
      csv('zamestnanci.csv'),
      csv('terminy_skoleni.csv'),
      csv('absolvovana_skoleni.csv'),
    ])

    // Upload step: every file recognised, the Windows-1250 one included.
    expect(await screen.findByText('absolvovana_skoleni.csv')).toBeTruthy()
    expect(screen.getByText(/WINDOWS-1250 · delimiter “;” · 2,866 rows/)).toBeTruthy()
    expect(screen.getByText(/Skipped 3 blank, 1 repeated header and 1 comment lines/)).toBeTruthy()
    await expectNoAxeViolations()

    await user.click(screen.getByRole('button', { name: 'Review rows' }))

    // Review step (loaded when needed), named and focused: the button that led here is gone.
    await waitFor(() => {
      expect(document.activeElement?.textContent).toMatch(/^Step 2 of 4: /)
    })
    // The sessions tab has the two known errors.
    await user.click(await screen.findByRole('tab', { name: /Sessions/ }))
    const panel = screen.getByRole('tabpanel')
    const errorsCard = within(panel).getByRole('button', { name: /Errors/ })
    expect(errorsCard.textContent).toContain('2')
    await user.click(errorsCard)
    expect(errorsCard.getAttribute('aria-pressed')).toBe('true')
    expect(
      within(panel)
        .getByRole('button', { name: /Problems on line 11/ })
        .getAttribute('aria-label')
    ).toContain('Unknown course “KYB3R”')

    // Fix T010's course code inline; the row becomes valid and leaves the "errors" filter.
    // The cell says what is in it and that it is wrong, not only by its colour.
    expect(
      within(panel)
        .getByRole('button', { name: /Edit Course on line 11$/ })
        .getAttribute('aria-label')
    ).toMatch(/, has an error, Edit Course on line 11$/)
    await user.click(within(panel).getByRole('button', { name: /Edit Course on line 11$/ }))
    const cell = within(panel).getByRole('textbox', { name: 'Edit Course on line 11' })
    await user.clear(cell)
    await user.type(cell, 'KYBER{Enter}')
    expect(within(panel).getByRole('button', { name: /Errors/ }).textContent).toContain('1')
    expect(within(panel).queryByRole('button', { name: /Problems on line 11/ })).toBeNull()
    await expectNoAxeViolations()

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    // Confirm step: counts per dataset, errors skipped.
    expect(screen.getByText('Courses: 10 records will be written')).toBeTruthy()
    expect(screen.getByText('Employees: 170 records will be written')).toBeTruthy()
    expect(screen.getByText('Sessions: 33 records will be written')).toBeTruthy()
    expect(screen.getByText('Completions: 2,822 records will be written')).toBeTruthy()
    await expectNoAxeViolations()

    await user.click(screen.getByRole('button', { name: /Import 3,035 records/ }))

    // Commit: dependency order, chunks of at most 500.
    // Announced from the one status region the run keeps.
    expect(await screen.findByText('Import complete', { selector: '[role="status"]' })).toBeTruthy()
    const calls = commitImportChunk.mock.calls.map(([kind, records]) => [kind, records.length])
    expect(calls).toEqual([
      ['courses', 10],
      ['employees', 170],
      ['sessions', 33],
      ['completions', 500],
      ['completions', 500],
      ['completions', 500],
      ['completions', 500],
      ['completions', 500],
      ['completions', 322],
    ])
    expect(screen.getByText('Completions: 2822 created, 0 updated')).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('sorts the whole dataset before paging, and keeps the page through an edit', async () => {
    const user = userEvent.setup()
    const { container } = renderWizard()
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('file input missing')
    await user.upload(input, [csv('katalog_skoleni.csv'), csv('absolvovana_skoleni.csv')])
    await user.click(await screen.findByRole('button', { name: 'Review rows' }))
    await user.click(await screen.findByRole('tab', { name: /Completions/ }))
    const panel = screen.getByRole('tabpanel')

    const lines = () =>
      within(panel)
        .getAllByRole('row')
        .slice(1)
        .map(row => Number(within(row).getAllByRole('cell')[0]?.textContent))

    const unsorted = lines()
    expect(unsorted).toHaveLength(50)
    await user.click(within(panel).getByRole('button', { name: 'Line' }))
    await user.click(within(panel).getByRole('button', { name: 'Line' }))
    expect(
      within(panel).getByRole('columnheader', { name: /Line/ }).getAttribute('aria-sort')
    ).toBe('descending')
    // Page 1 now starts at the file's last line, not the last line of the old first page.
    const page1 = lines()
    expect(page1[0]).toBeGreaterThan(2800)
    expect(page1).toEqual([...page1].sort((a, b) => b - a))

    await user.click(within(panel).getByRole('button', { name: /Next/ }))
    const page2 = lines()
    expect(page2[0]).toBeLessThan(page1.at(-1) ?? 0)
    expect(within(panel).getByText(/^Page 2 of/)).toBeTruthy()

    const firstRow = within(panel).getAllByRole('row')[1]
    if (!firstRow) throw new Error('no rows')
    const [editButton] = within(firstRow).getAllByRole('button', { name: /Edit .+ on line \d+$/ })
    if (!editButton) throw new Error('no editable cell')
    await user.click(editButton)
    await user.type(within(panel).getByRole('textbox'), ' x{Enter}')
    expect(within(panel).getByText(/^Page 2 of/)).toBeTruthy()
  })

  it('rejects a file it cannot recognise', async () => {
    const user = userEvent.setup()
    const { container } = renderWizard()
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('file input missing')
    await user.upload(input, new File(['foo;bar\n1;2'], 'random.csv', { type: 'text/csv' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'random.csv: the columns do not match any known export.'
    )
    expect(screen.getByRole('button', { name: 'Review rows' }).hasAttribute('disabled')).toBe(true)
  })

  const upload = async (
    user: ReturnType<typeof userEvent.setup>,
    container: HTMLElement,
    files: File[]
  ) => {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('file input missing')
    await user.upload(input, files)
  }
  const file = (name: string, lines: string[]) =>
    new File([lines.join('\n')], name, { type: 'text/csv' })

  it('rejects oversized, empty and incomplete files, and drops one on request', async () => {
    const user = userEvent.setup()
    const { container } = renderWizard()
    await upload(user, container, [
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'obri.csv', { type: 'text/csv' }),
      file('prazdny.csv', ['']),
      file('terminy.csv', [
        'id_terminu;kod_skoleni;datum;cas',
        'T001;BOZP-Z;2026-11-04;08:00-11:00',
      ]),
      file('katalog.tsv', ['kod\tnazev\tbarva', 'GDPR\tOchrana osobních údajů\tmodrá']),
    ])
    const alerts = (await screen.findAllByRole('alert')).map(a => a.textContent)
    expect(alerts).toEqual([
      'obri.csv is larger than 10 MB.',
      'prazdny.csv: the file is empty.',
      'terminy.csv: required columns are missing: Location, Capacity.',
    ])
    expect(screen.getByText(/delimiter “TAB” · 1 row/)).toBeTruthy()
    expect(screen.getByText('Ignored columns: barva')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Remove katalog.tsv' }))
    expect(screen.queryByText('katalog.tsv')).toBeNull()
    expect(screen.getByRole('button', { name: 'Review rows' }).hasAttribute('disabled')).toBe(true)
  })

  it('filters rows, removes and restores them, and undoes an edit', async () => {
    const user = userEvent.setup()
    const { container } = renderWizard()
    await upload(user, container, [
      file('katalog.csv', [
        'kod,nazev,platnost_mesicu,povinne_pro',
        'BOZP-Z,BOZP – základní školení,2 roky,VSICHNI',
        'GDPR,Ochrana osobních údajů,24,VSICHNI',
        'XX,,24,VSICHNI',
      ]),
    ])
    await user.click(await screen.findByRole('button', { name: 'Review rows' }))
    const panel = screen.getByRole('tabpanel')
    const rows = () => within(panel).getAllByRole('row').length - 1

    await user.click(within(panel).getByRole('button', { name: /Warnings/ }))
    expect(rows()).toBe(1)
    // Clicking the active filter again shows everything.
    await user.click(within(panel).getByRole('button', { name: /Warnings/ }))
    expect(rows()).toBe(3)

    // A cell edit cancelled with Escape changes nothing; a real one can be undone.
    await user.click(within(panel).getByRole('button', { name: /Edit Name on line 3$/ }))
    await user.type(within(panel).getByRole('textbox'), ' navíc{Escape}')
    expect(within(panel).queryByRole('button', { name: /^Undo the edits on line / })).toBeNull()
    await user.click(within(panel).getByRole('button', { name: /Edit Name on line 3$/ }))
    await user.type(within(panel).getByRole('textbox'), ' navíc{Enter}')
    await user.click(within(panel).getByRole('button', { name: /^Undo the edits on line / }))
    expect(within(panel).getByRole('button', { name: /Edit Name on line 3$/ }).textContent).toBe(
      'Ochrana osobních údajů'
    )

    const [remove] = within(panel).getAllByRole('button', { name: /^Remove line / })
    if (!remove) throw new Error('no row to remove')
    await user.click(remove)
    await user.click(within(panel).getByRole('button', { name: /Removed/ }))
    expect(rows()).toBe(1)
    await user.click(within(panel).getByRole('button', { name: /^Restore line / }))
    expect(within(panel).getByRole('button', { name: /Removed/ }).textContent).toContain('0')

    await user.click(within(panel).getByRole('button', { name: /Ready/ }))
    expect(rows()).toBe(2)
    await user.click(screen.getByRole('button', { name: 'Back to files' }))
    expect(screen.getByText('katalog.csv')).toBeTruthy()
  })

  it('stops at a failed chunk, says how much was written, and starts over', async () => {
    const user = userEvent.setup()
    commitImportChunk
      .mockResolvedValueOnce({ ok: true, created: 2, updated: 0, skipped: 0 })
      .mockResolvedValueOnce({ ok: false, error: 'failed' } as never)
    const { container } = renderWizard()
    await upload(user, container, [
      file('katalog.csv', [
        'kod,nazev,platnost_mesicu,povinne_pro',
        'BOZP-Z,BOZP – základní školení,24,VSICHNI',
        'GDPR,Ochrana osobních údajů,24,VSICHNI',
      ]),
      file('zamestnanci.csv', [
        'id_zamestnance,jmeno,prijmeni,datum_nastupu,stav',
        'E0153,Marie,Černá,2019-03-01,aktivní',
      ]),
    ])
    await user.click(await screen.findByRole('button', { name: 'Review rows' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Back to review' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Import 3 records' }))
    expect(
      await screen.findByText('The import failed: the database refused the write', {
        selector: '[role="status"]',
      })
    ).toBeTruthy()
    expect(screen.getByText('2 records were written before the failure.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Import more files' }))
    expect(screen.getByRole('button', { name: 'Review rows' }).hasAttribute('disabled')).toBe(true)
  })
})
