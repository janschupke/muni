import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { render } from '../test/render'
import { createDataColumns, DataTable, type SortingState } from './data-table'

/** Tables here sort and page their own rows. */
const LOCAL = { local: 'the rows a test gives' }

interface Person {
  id: string
  name: string
  price: number | null
}

const col = createDataColumns<Person>()
const columns = col.columns([
  col.accessor('name', { header: 'Name', sortFn: 'text' }),
  col.accessor(p => p.price ?? undefined, {
    id: 'price',
    header: 'Price',
    sortFn: 'basic',
    meta: { align: 'right' },
    cell: ctx => ctx.getValue() ?? '—',
  }),
])

const PEOPLE: Person[] = [
  { id: '1', name: 'Čermák', price: 450 },
  { id: '2', name: 'Adámek', price: null },
  { id: '3', name: 'Zelený', price: 2100 },
  { id: '4', name: 'Chalupa', price: 0 },
  { id: '5', name: 'Hora', price: 120 },
]

const firstColumn = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map(row => within(row).getAllByRole('cell')[0]?.textContent)

const priceColumn = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map(row => within(row).getAllByRole('cell')[1]?.textContent)

const header = (name: string) => screen.getByRole('columnheader', { name: new RegExp(name) })

const LABELS = {
  nav: 'Pages',
  previous: 'Previous',
  next: 'Next',
  status: (page: number, count: number) => `Page ${String(page)} of ${String(count)}`,
}

describe('DataTable sorting', () => {
  it('cycles a header from ascending to descending to unsorted', async () => {
    const user = userEvent.setup()
    render(
      <DataTable
        paging={LOCAL}
        caption="People"
        columns={columns}
        data={PEOPLE}
        getRowId={p => p.id}
      />
    )
    const button = within(header('Name')).getByRole('button')

    expect(header('Name').getAttribute('aria-sort')).toBeNull()
    await user.click(button)
    expect(header('Name').getAttribute('aria-sort')).toBe('ascending')
    await user.click(button)
    expect(header('Name').getAttribute('aria-sort')).toBe('descending')
    await user.click(button)
    expect(header('Name').getAttribute('aria-sort')).toBeNull()
    expect(firstColumn()).toEqual(PEOPLE.map(p => p.name))
  })

  it('collates Czech names: č after c, ch after h', async () => {
    const user = userEvent.setup()
    render(
      <DataTable
        paging={LOCAL}
        caption="People"
        columns={columns}
        data={PEOPLE}
        getRowId={p => p.id}
      />
    )
    await user.click(within(header('Name')).getByRole('button'))
    expect(firstColumn()).toEqual(['Adámek', 'Čermák', 'Hora', 'Chalupa', 'Zelený'])
  })

  it('keeps missing values last in both directions', async () => {
    const user = userEvent.setup()
    render(
      <DataTable
        paging={LOCAL}
        caption="People"
        columns={columns}
        data={PEOPLE}
        getRowId={p => p.id}
      />
    )
    const button = within(header('Price')).getByRole('button')
    await user.click(button)
    expect(priceColumn()).toEqual(['0', '120', '450', '2100', '—'])
    await user.click(button)
    expect(priceColumn()).toEqual(['2100', '450', '120', '0', '—'])
  })

  it('sorts the whole dataset before paginating', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: String(i),
      name: `Person ${String(i)}`,
      price: i,
    }))
    render(
      <DataTable
        paging={LOCAL}
        caption="People"
        columns={columns}
        data={many}
        getRowId={p => p.id}
        pageSize={50}
        paginationLabels={{
          nav: 'Pages',
          previous: 'Previous',
          next: 'Next',
          status: (page, count) => `Page ${String(page)} of ${String(count)}`,
        }}
      />
    )
    expect(screen.getAllByRole('row')).toHaveLength(51)
    await user.click(screen.getByRole('button', { name: /Next/ }))
    expect(screen.getByText('Page 2 of 2')).toBeTruthy()

    const button = within(header('Price')).getByRole('button')
    await user.click(button)
    await user.click(button)
    // Descending: the overall maximum (59) heads page 1, and sorting returned to page 1.
    expect(screen.getByText('Page 1 of 2')).toBeTruthy()
    expect(priceColumn()[0]).toBe('59')
  })

  it('shows the last page for one past the end', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: String(i),
      name: `Person ${String(i)}`,
      price: i,
    }))
    render(
      <DataTable
        paging={LOCAL}
        caption="People"
        columns={columns}
        data={many}
        getRowId={p => p.id}
        pagination={{ pageIndex: 4, pageSize: 25 }}
        paginationLabels={LABELS}
      />
    )
    expect(screen.getByText('Page 3 of 3')).toBeTruthy()
    expect(firstColumn()).toHaveLength(10)
  })

  it('in server mode shows the page it is given, and hands a header click to the server', async () => {
    const user = userEvent.setup()
    const onSortingChange = vi.fn<(sorting: SortingState) => void>()
    const Anchor = ({ href, children }: { href: string; children: React.ReactNode }) => (
      <a href={href}>{children}</a>
    )
    const { container } = render(
      <DataTable
        paging={{
          server: {
            page: 2,
            pageCount: 4,
            sorting: [{ id: 'name', desc: true }],
            onSortingChange,
            hrefFor: page => `/people?page=${String(page)}`,
            linkAs: Anchor,
          },
        }}
        caption="People"
        columns={columns}
        data={PEOPLE}
        getRowId={p => p.id}
        paginationLabels={LABELS}
      />
    )
    // The rows as the server sent them: not re-sorted, not cut.
    expect(firstColumn()).toEqual(PEOPLE.map(p => p.name))
    expect(screen.getByText('Page 2 of 4')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Next/ }).getAttribute('href')).toBe('/people?page=3')
    expect(header('Name').getAttribute('aria-sort')).toBe('descending')
    // A server list always has an order: the header flips it, never clears it.
    await user.click(within(header('Name')).getByRole('button'))
    expect(onSortingChange).toHaveBeenLastCalledWith([{ id: 'name', desc: false }])
    expect(container.querySelector('[data-paging]')?.getAttribute('data-paging')).toBe('server')
  })

  it('says why a table holds every row', () => {
    const { container } = render(
      <DataTable
        paging={LOCAL}
        caption="People"
        columns={columns}
        data={PEOPLE}
        getRowId={p => p.id}
      />
    )
    expect(container.querySelector('[data-paging]')?.getAttribute('data-paging')).toBe(
      'local: the rows a test gives'
    )
  })

  it('leaves the order to the caller in manual mode', async () => {
    const user = userEvent.setup()
    const onSortingChange = vi.fn<(sorting: SortingState) => void>()
    render(
      <DataTable
        paging={LOCAL}
        caption="People"
        columns={columns}
        data={PEOPLE}
        getRowId={p => p.id}
        manualSorting
        sorting={[]}
        onSortingChange={onSortingChange}
      />
    )
    await user.click(within(header('Name')).getByRole('button'))
    expect(onSortingChange).toHaveBeenCalledWith([{ id: 'name', desc: false }])
    expect(firstColumn()).toEqual(PEOPLE.map(p => p.name))
  })

  it('renders plain headers when sorting is off', () => {
    render(
      <DataTable
        paging={LOCAL}
        caption="People"
        columns={columns}
        data={PEOPLE}
        getRowId={p => p.id}
        enableSorting={false}
      />
    )
    expect(within(header('Name')).queryByRole('button')).toBeNull()
  })
})

describe('DataTable detail rows', () => {
  it('toggles a detail row under its row, several at once, wired for assistive tech', async () => {
    const user = userEvent.setup()
    render(
      <DataTable
        paging={LOCAL}
        caption="People"
        columns={columns}
        data={PEOPLE}
        getRowId={p => p.id}
        renderExpanded={p => <p>Details of {p.name}</p>}
        getRowCanExpand={p => p.price !== null}
        expandLabel={p => `Details: ${p.name}`}
        expandHeader="Details"
      />
    )
    // Adámek has no price: no disclosure button for that row.
    expect(screen.queryByRole('button', { name: 'Details: Adámek' })).toBeNull()

    const zeleny = screen.getByRole('button', { name: 'Details: Zelený' })
    expect(zeleny.getAttribute('aria-expanded')).toBe('false')
    await user.click(zeleny)
    expect(zeleny.getAttribute('aria-expanded')).toBe('true')
    const panel = screen.getByText('Details of Zelený')
    const detailRow = panel.closest('tr')
    expect(detailRow?.id).toBe(zeleny.getAttribute('aria-controls'))
    // The detail spans every column, including the disclosure column.
    expect(detailRow?.querySelector('td')?.getAttribute('colspan')).toBe('3')

    await user.click(screen.getByRole('button', { name: 'Details: Hora' }))
    expect(screen.getByText('Details of Hora')).toBeTruthy()
    expect(screen.getByText('Details of Zelený')).toBeTruthy()

    await user.click(zeleny)
    expect(screen.queryByText('Details of Zelený')).toBeNull()
  })

  it('keeps a detail open while sorting moves its row', async () => {
    const user = userEvent.setup()
    render(
      <DataTable
        paging={LOCAL}
        caption="People"
        columns={columns}
        data={PEOPLE}
        getRowId={p => p.id}
        renderExpanded={p => <p>Details of {p.name}</p>}
        expandLabel={p => `Details: ${p.name}`}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Details: Hora' }))
    await user.click(within(header('Name')).getByRole('button'))
    const rows = screen.getAllByRole('row').map(r => r.textContent)
    const hora = rows.findIndex(text => text.startsWith('Hora'))
    expect(rows[hora + 1]).toBe('Details of Hora')
  })
})
