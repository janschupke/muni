import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { render } from '../test/render'
import { SelectBox } from './checkbox'
import { ChoiceGroup } from './choice-group'
import { createDataColumns, DataTable } from './data-table'
import { DetailGrid, DetailPanel } from './detail-panel'
import { Dialog } from './dialog'
import { ExpandButton } from './expand-button'
import { tabTriggerClass } from './nav'
import { Toast, toastDuration, ToastProvider, ToastViewport } from './toast'

/** Tables here sort and page their own rows. */
const LOCAL = { local: 'the rows a test gives' }

describe('Toast', () => {
  it('says what happened, offers a shortcut, and closes', async () => {
    const user = userEvent.setup()
    const closed = vi.fn()
    render(
      <ToastProvider label="Notifications">
        <Toast
          open
          onOpenChange={closed}
          title="Booked 3 people"
          description="On BOZP, Nov 4"
          action={<a href="/sessions/T016">Open session</a>}
          actionAltText="Open the session"
          closeLabel="Close"
        />
        <ToastViewport />
      </ToastProvider>
    )
    expect(await screen.findByText('Booked 3 people')).toBeTruthy()
    expect(screen.getByText('On BOZP, Nov 4')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open session' }).getAttribute('href')).toBe(
      '/sessions/T016'
    )
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(closed).toHaveBeenCalledWith(false)
  })

  it('keeps a failure until it is closed; the rest leave on their own', () => {
    expect(toastDuration('danger')).toBe(Infinity)
    expect(toastDuration('success')).toBe(6000)
  })
})

describe('Dialog footer', () => {
  it('keeps the decision under the body, outside its scroll', () => {
    render(
      <Dialog
        open
        onOpenChange={() => undefined}
        title="Book 2 people?"
        closeLabel="Close"
        footer={<button type="button">Book 2 people</button>}
      >
        <p>Who goes where.</p>
      </Dialog>
    )
    const button = screen.getByRole('button', { name: 'Book 2 people' })
    expect(button.parentElement?.className).toContain('border-t')
    expect(screen.getByText('Who goes where.').parentElement?.className).toContain(
      'overflow-y-auto'
    )
  })
})

describe('ChoiceGroup', () => {
  function Harness() {
    const [value, setValue] = useState<'move' | 'raise'>('move')
    return (
      <>
        <ChoiceGroup
          label="How to resolve it"
          value={value}
          onValueChange={setValue}
          choices={[
            { value: 'move', title: 'Move seats', description: 'Up to 3 seats.' },
            { value: 'raise', title: 'Raise the capacity', disabled: false },
          ]}
        />
        <p>Chosen: {value}</p>
      </>
    )
  }

  it('offers each way with what it means, one chosen at a time', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const group = screen.getByRole('radiogroup', { name: 'How to resolve it' })
    expect(within(group).getByText('Up to 3 seats.')).toBeTruthy()
    expect(
      within(group)
        .getByRole('radio', { name: /Move seats/ })
        .getAttribute('aria-checked')
    ).toBe('true')
    await user.click(within(group).getByRole('radio', { name: /Raise the capacity/ }))
    expect(screen.getByText('Chosen: raise')).toBeTruthy()
    // Only the chosen card looks chosen.
    expect(
      within(group)
        .getByRole('radio', { name: /Move seats/ })
        .getAttribute('data-state')
    ).toBe('unchecked')
    expect(
      within(group)
        .getByRole('radio', { name: /Raise the capacity/ })
        .getAttribute('data-state')
    ).toBe('checked')
  })
})

describe('DetailPanel', () => {
  it('heads each block of an opened row, at the level the page needs', () => {
    render(
      <DetailGrid>
        <DetailPanel title="Booked by name" count={2} flush>
          <table aria-label="People" />
        </DetailPanel>
        <DetailPanel title="Other rooms" level={3}>
          <p>None.</p>
        </DetailPanel>
      </DetailGrid>
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Booked by name · 2' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Other rooms' })).toBeTruthy()
    expect(screen.getByRole('table').parentElement?.className).toContain('overflow-x-auto')
    expect(screen.getByText('None.').parentElement?.className).toContain('px-4')
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

describe('DataTable selection', () => {
  interface Row {
    id: string
    name: string
    open: boolean
  }
  const col = createDataColumns<Row>()
  const ROWS: Row[] = [
    { id: '1', name: 'Adámek', open: true },
    { id: '2', name: 'Bílá', open: true },
    { id: '3', name: 'Cibulka', open: false },
  ]

  function Harness() {
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
    return (
      <>
        <DataTable
          paging={LOCAL}
          caption="People"
          columns={col.columns([col.accessor('name', { header: 'Name' })])}
          data={ROWS}
          getRowId={r => r.id}
          selection={{
            selected,
            onSelectedChange: setSelected,
            isRowSelectable: r => r.open,
            rowLabel: r => `Select ${r.name}`,
            pageLabel: 'Select every row on this page',
          }}
        />
        <p>Selected: {[...selected].join(',')}</p>
      </>
    )
  }

  it('selects rows one by one or the page at once, never the ones that cannot be', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.queryByRole('checkbox', { name: 'Select Cibulka' })).toBeNull()
    await user.click(screen.getByRole('checkbox', { name: 'Select Bílá' }))
    expect(screen.getByText('Selected: 2')).toBeTruthy()
    const page = screen.getByRole('checkbox', { name: 'Select every row on this page' })
    expect(page.getAttribute('aria-checked')).toBe('mixed')
    await user.click(page)
    expect(screen.getByText('Selected: 2,1')).toBeTruthy()
    expect(page.getAttribute('aria-checked')).toBe('true')
    await user.click(page)
    expect(screen.getByText('Selected:')).toBeTruthy()
    await user.click(screen.getByRole('checkbox', { name: 'Select Adámek' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Adámek' }))
    expect(screen.getByText('Selected:')).toBeTruthy()
  })
})

describe('tabs', () => {
  it('answer the pointer with a fill and an underline, not only the text', () => {
    expect(tabTriggerClass).toContain('hover:bg-state-hover')
    expect(tabTriggerClass).toContain('hover:border-border-emphasis')
  })
})
