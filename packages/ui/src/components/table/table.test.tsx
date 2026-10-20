import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { render } from '../../test/render'
import { SelectBox } from '../forms/checkbox'
import { ExpandButton } from './expand-button'
import { Pagination } from './pagination'
import { CellStack, Table, TableContainer, TBody, Td, Th, THead, Tr } from './table'

describe('Table', () => {
  it('aligns, pins and stacks cells', () => {
    render(
      <TableContainer paging="the rows a test gives">
        <Table density="compact">
          <THead>
            <tr>
              <Th sticky="left">Jméno</Th>
              <Th align="right" nowrap>
                Cena
              </Th>
              <Th scope="row" sticky="right">
                Akce
              </Th>
            </tr>
          </THead>
          <TBody>
            <Tr>
              <Td sticky="left">
                <CellStack title="Marie Černá" meta="E0153" />
              </Td>
              <Td align="right" nowrap>
                450 Kč
              </Td>
              <Td sticky="right">
                <CellStack title="Bez meta" />
              </Td>
            </Tr>
          </TBody>
        </Table>
      </TableContainer>
    )
    const [name, price, action] = screen.getAllByRole('columnheader')
    expect(name?.className).toContain('sticky left-0')
    expect(price?.className).toContain('text-right tabular-nums')
    expect(price?.className).toContain('whitespace-nowrap')
    expect(screen.getByRole('rowheader').className).toContain('right-0')
    expect(action).toBeUndefined()
    expect(screen.getByRole('table').className).toContain('[&_td]:px-2')
    expect(screen.getByText('E0153').className).toContain('text-xs')
    expect(screen.getByText('Bez meta').parentElement?.children).toHaveLength(1)
    expect(screen.getByText('450 Kč').className).toContain('text-right')
  })

  it('shows a row’s hover in its pinned cells too, over their own fill', () => {
    render(
      <Table>
        <TBody>
          <Tr>
            <Td sticky="left">Marie Černá</Td>
            <Td>450 Kč</Td>
          </Tr>
        </TBody>
      </Table>
    )
    const row = screen.getByRole('row')
    // The row publishes its state; the pinned cell paints it over its opaque fill.
    expect(row.className).toContain('hover:[--row-state:var(--color-state-hover)]')
    expect(row.className).toContain('bg-(--row-state)')
    const pinned = screen.getByText('Marie Černá')
    expect(pinned.className).toContain('bg-surface-elevated')
    expect(pinned.className).toContain('layer-row')
    expect(screen.getByText('450 Kč').className).not.toContain('layer-row')
  })
})

function FakeLink({
  href,
  rel,
  children,
}: {
  href: string
  rel?: string | undefined
  children: ReactNode
}) {
  return (
    <a href={href} rel={rel}>
      {children}
    </a>
  )
}

const labels = { nav: 'Stránky', previous: 'Předchozí', next: 'Další', status: 'Strana 2 z 3' }

describe('Pagination', () => {
  it('renders nothing for a single page', () => {
    const { container } = render(<Pagination page={1} pageCount={1} labels={labels} />)
    expect(container.innerHTML).toBe('')
  })

  it('links to the neighbouring pages, keeping the edge step a plain disabled button', () => {
    render(
      <Pagination
        page={3}
        pageCount={3}
        labels={labels}
        hrefFor={page => `/employees?page=${String(page)}`}
        linkAs={FakeLink}
      />
    )
    const previous = screen.getByRole('link', { name: 'Předchozí' })
    expect([previous.getAttribute('href'), previous.getAttribute('rel')]).toEqual([
      '/employees?page=2',
      'prev',
    ])
    expect(screen.getByRole('button', { name: 'Další' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('navigation', { name: 'Stránky' }).textContent).toContain(
      'Strana 2 z 3'
    )
  })

  it('calls back with the target page in button mode', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<Pagination page={1} pageCount={3} labels={labels} onPageChange={onPageChange} />)
    expect(screen.getByRole('button', { name: 'Předchozí' }).hasAttribute('disabled')).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Další' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })
})

describe('ExpandButton and SelectBox', () => {
  it('say whether a row is open, and select without a visible label', async () => {
    const user = userEvent.setup()
    const toggle = vi.fn()
    render(
      <>
        <ExpandButton open aria-label="Details for Laboratoře" onClick={toggle} />
        <SelectBox checked="indeterminate" onCheckedChange={toggle} aria-label="Select page" />
      </>
    )
    const expand = screen.getByRole('button', { name: 'Details for Laboratoře' })
    expect(expand.getAttribute('aria-expanded')).toBe('true')
    await user.click(expand)
    const box = screen.getByRole('checkbox', { name: 'Select page' })
    expect(box.getAttribute('aria-checked')).toBe('mixed')
    await user.click(box)
    expect(toggle).toHaveBeenCalledTimes(2)
  })
})
