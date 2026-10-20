import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { render } from '../../test/render'
import { Alert } from './alert'
import { Skeleton, SkeletonText } from './skeleton'
import { Toast, toastDuration, ToastProvider, ToastViewport } from './toast'
import { Tooltip } from './tooltip'

describe('Alert', () => {
  it('announces danger assertively and everything else politely, always with an icon', () => {
    const { container } = render(
      <>
        <Alert tone="danger" title="Uložení selhalo">
          Zkuste to znovu.
        </Alert>
        <Alert tone="success">Uloženo.</Alert>
        <Alert tone="warning" variant="inline">
          2 řádky přeskočeny.
        </Alert>
        <Alert tone="info" role="none">
          Jen pro čtení.
        </Alert>
      </>
    )
    expect(screen.getByRole('alert').textContent).toBe('Uložení selhaloZkuste to znovu.')
    expect(screen.getAllByRole('status').map(s => s.textContent)).toEqual([
      'Uloženo.',
      '2 řádky přeskočeny.',
    ])
    expect(screen.getByText('Jen pro čtení.').closest('[role]')).toBeNull()
    expect(container.querySelectorAll('svg[aria-hidden]')).toHaveLength(4)
  })
})

describe('Skeleton', () => {
  it('stands in for content, hidden from assistive technology', () => {
    const { container } = render(
      <>
        <Skeleton className="h-8 w-40" />
        <SkeletonText lines={3} />
        <SkeletonText lines={1} />
      </>
    )
    const blocks = container.querySelectorAll('[aria-hidden="true"]')
    expect(blocks[0]?.className).toContain('h-8 w-40')
    expect(blocks[0]?.className).toContain('motion-safe:animate-pulse')
    // A paragraph's last line is shorter; a single line is full.
    const [, paragraph, line] = [...container.children]
    expect(paragraph?.lastElementChild?.className).toContain('w-2/3')
    expect(line?.lastElementChild?.className).toContain('w-full')
  })
})

describe('Tooltip', () => {
  it('shows its content when the trigger gets focus', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Prošlé: 3" side="bottom">
        <button type="button">3</button>
      </Tooltip>
    )
    await user.tab()
    expect((await screen.findByRole('tooltip')).textContent).toBe('Prošlé: 3')
  })

  it('keeps a copy of the trigger’s name to sighted users', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="BOZP: prošlé" repeatsName>
        <button type="button">BOZP: prošlé</button>
      </Tooltip>
    )
    await user.tab()
    // Shown, but not read out a second time.
    const copy = await screen.findByRole('tooltip', { hidden: true })
    expect(copy.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

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
