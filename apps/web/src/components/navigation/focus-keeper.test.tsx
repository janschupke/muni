import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { navigate } from '@/test/next'
import { renderClient } from '@/test/render'

import { NavigationHistory } from './navigation-history'

// @vitest-environment jsdom

vi.mock('@/server/actions/sessions', () => ({ checkSessionSlotAction: vi.fn() }))

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('focus', () => {
  function Page() {
    const [shown, setShown] = useState(true)
    return (
      <NavigationHistory>
        <main id="main" tabIndex={-1}>
          <h1>Departments</h1>
          {shown && (
            <button
              type="button"
              onClick={() => {
                setShown(false)
              }}
            >
              Archive Laboratoře
            </button>
          )}
        </main>
      </NavigationHistory>
    )
  }

  it('stays on the page when the focused element leaves it, and starts a new page at its title', async () => {
    renderClient(<Page />)
    // The row is archived: its button goes, and focus goes to the main region, not the body.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Archive Laboratoře' }))
    await waitFor(() => {
      expect(document.activeElement?.id).toBe('main')
    })
    act(() => {
      navigate('/positions')
    })
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Departments' }))
    })
    navigate('/')
  })
})
