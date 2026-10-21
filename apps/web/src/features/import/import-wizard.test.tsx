// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { EMPTY_REFERENCE } from '@muni/importer'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderClient } from '@/test/render'

import { ImportWizard } from './import-wizard'

// The server action and router are the only things replaced; parsing, validation, the
// review table and the commit loop are the real code, driven with the real exports.
const commitImportChunk = vi.fn((_kind: string, records: unknown[], _last: boolean) =>
  Promise.resolve({
    ok: true as const,
    created: records.length,
    updated: 0,
    unchanged: 0,
    skipped: 0,
  })
)
vi.mock('@/server/actions/import', () => ({
  commitImportChunk: (kind: string, records: unknown[], last: boolean) =>
    commitImportChunk(kind, records, last),
  findArchived: async () => (await import('@muni/importer')).NO_ARCHIVED,
}))

const DATA = path.join(import.meta.dirname, '../../../../../data')
const csv = (name: string, dir = '') =>
  new File([readFileSync(path.join(DATA, dir, name))], name, { type: 'text/csv' })

/**
 * A completions export of `count` rows, on lines 2 to count + 1, each on its own day: enough
 * for several pages of the review, and quick to read.
 */
function completions(count: number) {
  const header =
    'id_zaznamu,id_zamestnance,zamestnanec,kod_skoleni,datum_absolvovani,platnost_do,poskytovatel,cena_kc,poznamka'
  const rows = Array.from({ length: count }, (_, i) => {
    const day = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10)
    const id = `Z${String(i + 1).padStart(6, '0')}`
    return `${id},E0001,Urbanová Tereza,BOZP-Z,${day},,Interní školitel,450,`
  })
  return new File([[header, ...rows].join('\n')], 'absolvovana_skoleni.csv', {
    type: 'text/csv',
  })
}

function renderWizard(today = '2026-10-16') {
  return renderClient(<ImportWizard reference={EMPTY_REFERENCE} today={today} />)
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

    await user.click(screen.getByRole('button', { name: 'Review rows' }))

    // Review step (loaded when needed), named and focused: the button that led here is gone.
    await waitFor(() => {
      expect(document.activeElement?.textContent).toMatch(/^Step 2 of 4: /)
    })
    // The sessions tab has the three known errors: a mistyped course, an impossible date, and
    // a session exported twice under two IDs.
    await user.click(await screen.findByRole('tab', { name: /Sessions/ }))
    const panel = screen.getByRole('tabpanel')
    const errorsCard = within(panel).getByRole('button', { name: /Errors/ })
    expect(errorsCard.textContent).toContain('3')
    await user.click(errorsCard)
    expect(errorsCard.getAttribute('aria-pressed')).toBe('true')
    expect(
      within(panel)
        .getByRole('button', { name: /Problems on line 11/ })
        .getAttribute('aria-label')
    ).toContain('Unknown course “KYB3R”. Did you mean KYBER?')

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
    expect(errorsCard.textContent).toContain('2')
    expect(within(panel).queryByRole('button', { name: /Problems on line 11/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    // Confirm step: counts per dataset, errors skipped.
    expect(screen.getByText('Courses: 10 records will be written')).toBeTruthy()
    expect(screen.getByText('Employees: 170 records will be written')).toBeTruthy()
    expect(screen.getByText('Sessions: 32 records will be written')).toBeTruthy()
    expect(screen.getByText('Completions: 2,818 records will be written')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Import 3,030 records/ }))

    // Commit: dependency order, chunks of at most 500, each dataset's last chunk marked (the
    // server works out the heads and the default provider after it).
    // Announced from the one status region the run keeps.
    expect(await screen.findByText('Import complete', { selector: '[role="status"]' })).toBeTruthy()
    const calls = commitImportChunk.mock.calls.map(([kind, records, last]) => [
      kind,
      records.length,
      last,
    ])
    expect(calls).toEqual([
      ['courses', 10, true],
      ['employees', 170, true],
      ['completions', 500, false],
      ['completions', 500, false],
      ['completions', 500, false],
      ['completions', 500, false],
      ['completions', 500, false],
      ['completions', 318, true],
      ['sessions', 32, true],
    ])
    // Managers first: everyone's manager is written before them.
    const people = commitImportChunk.mock.calls.find(([kind]) => kind === 'employees')?.[1] ?? []
    const at = new Map(people.map((p, i) => [(p as { email: string | null }).email, i]))
    const late = people.filter((p, i) => {
      const manager = (p as { managerEmail: string | null }).managerEmail
      return manager !== null && (at.get(manager) ?? -1) > i
    })
    expect(late).toEqual([])
    expect(screen.getByText('Completions: 2818 created, 0 updated')).toBeTruthy()
  })

  it('imports the derived files (data/import) onto an empty register with no error', async () => {
    const user = userEvent.setup()
    const { container } = renderWizard('2026-10-20')
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('file input missing')
    await user.upload(
      input,
      [
        'katalog_skoleni.csv',
        'zamestnanci.csv',
        'mistnosti.csv',
        'terminy_skoleni.csv',
        'absolvovana_skoleni.csv',
      ].map(name => csv(name, 'import'))
    )
    await user.click(await screen.findByRole('button', { name: 'Review rows' }))
    // No tab counts an error.
    expect(await screen.findAllByRole('tab')).toHaveLength(5)
    expect(screen.queryByText(/with errors$/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    for (const line of [
      'Rooms: 9 records will be written',
      'Courses: 10 records will be written',
      'Employees: 170 records will be written',
      'Completions: 2,814 records will be written',
      'Sessions: 32 records will be written',
    ])
      expect(screen.getByText(line)).toBeTruthy()
    // Nothing to skip: every row of every file is written.
    expect(screen.queryByText(/invalid rows? (is|are) skipped/)).toBeNull()
  })

  /**
   * The completions tab of a review of two pages of rows (60): a full first page, ten on the
   * second. Queries keep to the part of the table they are about (the header, the body, the
   * pager): a role query over a whole page of rows weighs every cell and button in it.
   */
  async function reviewCompletions() {
    const user = userEvent.setup()
    const { container } = renderWizard()
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('file input missing')
    // Two pages of rows: what paging needs, without reading a real export.
    await user.upload(input, [csv('katalog_skoleni.csv'), completions(60)])
    await user.click(await screen.findByRole('button', { name: 'Review rows' }))
    await user.click(await screen.findByRole('tab', { name: /Completions/ }))
    const panel = screen.getByRole('tabpanel')
    const [head, body] = within(panel).getAllByRole<HTMLTableSectionElement>('rowgroup')
    if (!head || !body) throw new Error('no table')
    // The file line each row of the page shows, from its first cell.
    const lines = () => [...body.rows].map(row => Number(row.cells[0]?.textContent))
    const pager = within(within(panel).getByRole('navigation'))
    return { user, panel, head: within(head), body, pager, lines }
  }

  it('sorts the whole dataset before paging', async () => {
    const { user, head, lines } = await reviewCompletions()
    expect(lines()).toHaveLength(50)
    await user.click(head.getByRole('button', { name: 'Line' }))
    await user.click(head.getByRole('button', { name: 'Line' }))
    expect(head.getByRole('columnheader', { name: /Line/ }).getAttribute('aria-sort')).toBe(
      'descending'
    )
    // Page 1 now starts at the file's last line, not the last line of the old first page.
    const page1 = lines()
    expect(page1[0]).toBe(61)
    expect(page1).toEqual([...page1].sort((a, b) => b - a))
  })

  it('keeps the page through an edit', async () => {
    const { user, body, pager, lines } = await reviewCompletions()
    await user.click(pager.getByRole('button', { name: /Next/ }))
    expect(lines()[0]).toBe(52)
    expect(pager.getByText(/^Page 2 of/)).toBeTruthy()
    const firstRow = body.rows[0]
    if (!firstRow) throw new Error('no rows')
    const [editButton] = within(firstRow).getAllByRole('button', { name: /Edit .+ on line \d+$/ })
    if (!editButton) throw new Error('no editable cell')
    await user.click(editButton)
    await user.type(within(firstRow).getByRole('textbox'), ' x{Enter}')
    expect(pager.getByText(/^Page 2 of/)).toBeTruthy()
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
      'terminy.csv: required columns are missing: Room, Capacity.',
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
      .mockResolvedValueOnce({ ok: true, created: 2, updated: 0, unchanged: 0, skipped: 0 })
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
