// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { providerDetail } from '@/test/fixtures'
import { renderClient } from '@/test/render'

import { ProviderCompletionsTable } from './provider-completions-table'

vi.mock('@/server/actions/archive', () => ({ archiveAction: vi.fn(), previewArchive: vi.fn() }))

const [cerna, adamek] = providerDetail().completionList
if (!cerna || !adamek) throw new Error('fixture')

const ROWS = [
  cerna,
  // Archived: listed by tag only, and its completion cannot be edited from here.
  {
    ...adamek,
    id: 'cmp_2700',
    externalId: 'Z002700',
    employee: { archived: true as const, tag: 'b7' },
  },
  adamek,
]

/** Who each row names, top to bottom. */
const people = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map(row => within(row).getAllByRole('cell')[0]?.textContent)

describe('ProviderCompletionsTable', () => {
  it('sorts by employee, an archived one by its tag, and edits only those on record', async () => {
    const user = userEvent.setup()
    renderClient(
      <ProviderCompletionsTable
        rows={ROWS}
        paging={{ local: 'the rows a test gives' }}
        prices
        canEdit
      />
    )
    expect(people()).toEqual([
      'Černá MarieE0153',
      'Archived employee #b7 (archived)',
      'Adámek PetrE0154',
    ])
    // An archived person sorts by their tag (“~b7”), ahead of the names.
    await user.click(screen.getByRole('button', { name: 'Employee' }))
    expect(people()).toEqual([
      'Archived employee #b7 (archived)',
      'Adámek PetrE0154',
      'Černá MarieE0153',
    ])
    // Only the completions of people still on record can be edited here.
    const archived = screen.getByRole('row', { name: /Archived employee #b7/ })
    expect(within(archived).queryByRole('link', { name: /Edit/ })).toBeNull()
    const current = screen.getByRole('row', { name: /^Adámek Petr/ })
    expect(within(current).getByRole('link', { name: /Edit/ }).getAttribute('href')).toBe(
      '/employees/E0154/completions/cmp_2790/edit'
    )
  })

  it('leaves out prices and actions when not asked for', () => {
    renderClient(
      <ProviderCompletionsTable
        rows={ROWS}
        paging={{ local: 'the rows a test gives' }}
        prices={false}
        canEdit={false}
      />
    )
    expect(screen.queryByRole('columnheader', { name: 'Price' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull()
  })
})
