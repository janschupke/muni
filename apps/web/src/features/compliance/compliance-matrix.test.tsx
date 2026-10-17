// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { counts, matrix } from '@/test/fixtures'
import { renderClient } from '@/test/render'

import { ComplianceMatrixTable } from './compliance-matrix'

describe('compliance matrix', () => {
  it('colours each cell by its band and explains the bands', () => {
    renderClient(<ComplianceMatrixTable matrix={matrix()} canBook={false} />)
    expect(
      [...screen.getByRole('list', { name: 'Colour bands' }).querySelectorAll('li')].map(
        li => li.textContent
      )
    ).toEqual(['100%', '90%–99%', '75%–89%', '50%–74%', 'Under 50%'])
    const lab = screen.getByRole('row', { name: /^Laboratoře/ })
    expect(within(lab).getByRole('button', { name: /BOZP.*66%/ }).className).toContain(
      'bg-heat-low'
    )
    expect(within(lab).getByRole('button', { name: /Bezpečná.*0%/ }).className).toContain(
      'bg-heat-poor'
    )
    expect(screen.getByRole('link', { name: 'Laboratoře' }).getAttribute('href')).toBe(
      '/departments/dep_lab'
    )
    const library = screen.getByRole('row', { name: /^Knihovna/ })
    expect(within(library).getByRole('button', { name: /BOZP.*100%/ }).className).toContain(
      'bg-heat-full'
    )
  })

  it('opens a department into one row per person, aligned under the courses', async () => {
    const user = userEvent.setup()
    renderClient(<ComplianceMatrixTable matrix={matrix()} canBook={false} />)
    const toggle = screen.getByRole('button', { name: 'People in Laboratoře' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.hasAttribute('aria-controls')).toBe(false)
    expect(screen.queryByRole('link', { name: 'Černá Marie' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'In the people rows:' })).toBeNull()

    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const controlled = toggle.getAttribute('aria-controls')?.split(' ') ?? []
    expect(controlled).toHaveLength(3)
    for (const id of controlled) expect(document.getElementById(id)?.tagName).toBe('TR')

    const marie = screen.getByRole('row', { name: /Černá Marie/ })
    expect(within(marie).getByRole('link', { name: 'Černá Marie' }).getAttribute('href')).toBe(
      '/employees/E0153'
    )
    expect(within(marie).getByText('Laborantka')).toBeTruthy()
    // One cell per course, in the course order, with the state in words.
    const cells = within(marie).getAllByRole('cell').slice(1)
    expect(cells.map(c => c.textContent)).toEqual([
      'BOZP – základní školení: Expired · valid until 01.09.2026 · booked for 04.11.2026 8:00',
      'Bezpečná práce v laboratoři: Missing',
    ])
    const tomas = screen.getByRole('row', { name: /Dvořák Tomáš/ })
    expect(within(tomas).getByText(/Not required/)).toBeTruthy()
    expect(screen.getByRole('list', { name: 'In the people rows:' }).textContent).toContain(
      'Booked on a session'
    )

    await user.click(toggle)
    expect(screen.queryByRole('link', { name: 'Černá Marie' })).toBeNull()
  })

  it('makes an opened department one stop for Tab, moved through with the arrows', async () => {
    const user = userEvent.setup()
    renderClient(<ComplianceMatrixTable matrix={matrix()} canBook={false} />)
    const toggle = screen.getByRole('button', { name: 'People in Laboratoře' })
    await user.click(toggle)
    // The people rows, in order, each with one button per course.
    const grid = (toggle.getAttribute('aria-controls')?.split(' ') ?? []).map(id =>
      within(document.getElementById(id) as HTMLElement).getAllByRole('button')
    )
    const cells = grid.flat()
    expect(cells.filter(c => c.tabIndex === 0)).toEqual([grid[0]?.[0]])

    // Tab from the person's name reaches the block's one stop.
    within(
      document.getElementById(
        toggle.getAttribute('aria-controls')?.split(' ')[0] ?? ''
      ) as HTMLElement
    )
      .getByRole('link')
      .focus()
    await user.tab()
    expect(document.activeElement).toBe(grid[0]?.[0])
    // Its words show as it takes the focus.
    expect((await screen.findByRole('tooltip', { hidden: true })).textContent).toMatch(
      /^BOZP – základní školení: /
    )

    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(grid[0]?.[1])
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(grid[1]?.[1])
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(grid[1]?.[0])
    await user.keyboard('{Control>}{End}{/Control}')
    expect(document.activeElement).toBe(grid.at(-1)?.at(-1))
    // Past the edge it stays put; the stop moves with the focus.
    await user.keyboard('{ArrowRight}{ArrowDown}')
    expect(document.activeElement).toBe(grid.at(-1)?.at(-1))
    expect(cells.filter(c => c.tabIndex === 0)).toEqual([grid.at(-1)?.at(-1)])

    // Enter opens the department × course dialog, and closing it comes back to the cell.
    await user.keyboard('{Control>}{Home}{/Control}{Enter}')
    expect(
      await screen.findByRole('dialog', { name: 'Laboratoře · BOZP – základní školení' })
    ).toBeTruthy()
    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(document.activeElement).toBe(grid[0]?.[0])
  })

  it('lets a person cell under a course nobody there must hold open nothing', async () => {
    const user = userEvent.setup()
    renderClient(<ComplianceMatrixTable matrix={matrix()} canBook={false} />)
    await user.click(screen.getByRole('button', { name: 'People in Knihovna' }))
    const lab = screen.getByRole('button', { name: /^Bezpečná práce v laboratoři: Not required/ })
    expect(lab.getAttribute('aria-disabled')).toBe('true')
    await user.click(lab)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a cell into its people, most urgent first, and returns focus on close', async () => {
    const user = userEvent.setup()
    renderClient(<ComplianceMatrixTable matrix={matrix()} canBook={false} />)
    const cell = screen.getByRole('button', {
      name: 'Laboratoře, BOZP – základní školení: 66%, show people',
    })
    expect(cell.getAttribute('aria-haspopup')).toBe('dialog')
    await user.click(cell)

    const dialog = await screen.findByRole('dialog', {
      name: 'Laboratoře · BOZP – základní školení',
    })
    expect(within(dialog).getByText('2 of 3 people hold it (66%)')).toBeTruthy()
    const rows = within(dialog).getAllByRole('row').slice(1)
    expect(rows.map(r => within(r).getAllByRole('cell')[0]?.textContent)).toEqual([
      'Černá Marie',
      'Dvořák Tomáš',
      'Adámek Petr',
    ])
    expect(within(rows[0] as HTMLElement).getByText('(45 days ago)')).toBeTruthy()
    expect(
      within(rows[0] as HTMLElement)
        .getByRole('link', { name: /04.11.2026/ })
        .getAttribute('href')
    ).toBe('/sessions/T016')
    expect(within(dialog).getByRole('link', { name: 'Course detail' }).getAttribute('href')).toBe(
      '/courses/BOZP-Z'
    )
    expect(
      within(dialog).getByRole('link', { name: 'Everyone in Laboratoře' }).getAttribute('href')
    ).toBe('/employees?department=Laborato%C5%99e')

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(document.activeElement).toBe(cell)
  })

  it('shows never-completed and never-expiring trainings in the detail', async () => {
    const user = userEvent.setup()
    renderClient(<ComplianceMatrixTable matrix={matrix()} canBook={false} />)
    await user.click(screen.getByRole('button', { name: /^Laboratoře, Bezpečná/ }))
    const missing = await screen.findByRole('dialog')
    // Never held: no expiry, no completion, no booking, for each of the two.
    expect(within(missing).getAllByText('—')).toHaveLength(6)
    await user.click(within(missing).getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    await user.click(screen.getByRole('button', { name: /^Knihovna, BOZP/ }))
    expect(within(await screen.findByRole('dialog')).getByText('No expiry')).toBeTruthy()
  })

  it('lets an admin book, from a cell, each person who needs the training, or all of them', async () => {
    const user = userEvent.setup()
    renderClient(<ComplianceMatrixTable matrix={matrix()} canBook />)
    await user.click(screen.getByRole('button', { name: /^Laboratoře, Bezpečná/ }))
    const dialog = await screen.findByRole('dialog')
    const books = within(dialog).getAllByRole('button', { name: /^Book Bezpečná .* for / })
    expect(books.map(b => b.getAttribute('aria-label'))).toEqual([
      'Book Bezpečná práce v laboratoři for Adámek Petr…',
      'Book Bezpečná práce v laboratoři for Černá Marie…',
    ])
    expect(
      within(dialog).getByRole('button', {
        name: 'Book everyone in Laboratoře who needs Bezpečná práce v laboratoři…',
      }).textContent
    ).toBe(`Book all needed (${String(books.length)})`)
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    // A training already booked offers nothing more to book: only to cancel the booking.
    await user.click(
      screen.getByRole('button', { name: 'Laboratoře, BOZP – základní školení: 66%, show people' })
    )
    const bozp = await screen.findByRole('dialog')
    expect(
      within(within(bozp).getByRole('row', { name: /Černá Marie/ }))
        .getAllByRole('button')
        .map(b => b.getAttribute('aria-label'))
    ).toEqual(['Cancel the booking of BOZP – základní školení for Černá Marie'])
  })

  it('colours a cell by the percent it prints: 26 of 29 reads 89 %, never 90 % in yellow', () => {
    const base = matrix()
    const [first, ...rest] = base.rows
    if (!first) throw new Error('fixture')
    const near = {
      counts: counts({ VALID: 26, EXPIRING: 0, EXPIRED: 0, MISSING: 3 }),
      rate: 26 / 29,
    }
    const exact = { counts: counts({ VALID: 27, EXPIRING: 0, EXPIRED: 0, MISSING: 3 }), rate: 0.9 }
    renderClient(
      <ComplianceMatrixTable
        matrix={{
          ...base,
          rows: [
            { ...first, cells: { ...first.cells, 'BOZP-Z': near, 'LAB-BEZ': exact } },
            ...rest,
          ],
        }}
        canBook={false}
      />
    )
    const lab = screen.getByRole('row', { name: /^Laboratoře/ })
    const cell = (name: RegExp) => within(lab).getByRole('button', { name })
    expect(cell(/BOZP.*: 89%/).className).toContain('bg-heat-fair')
    expect(cell(/Bezpečná.*: 90%/).className).toContain('bg-heat-high')
  })

  it('does not open a cell that is not required', () => {
    renderClient(<ComplianceMatrixTable matrix={matrix()} canBook={false} />)
    const library = screen.getByRole('row', { name: /^Knihovna/ })
    expect(within(library).getAllByRole('button')).toHaveLength(2)
  })
})
