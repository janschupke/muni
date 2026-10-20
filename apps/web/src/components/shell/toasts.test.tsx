// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderClient } from '@/test/render'

import { type ToastMessage, useToast } from './toasts'

function Show({ message }: { message: ToastMessage }) {
  const toast = useToast()
  return (
    <button
      type="button"
      onClick={() => {
        toast(message)
      }}
    >
      Show
    </button>
  )
}

describe('toasts', () => {
  it('shows a toast with its shortcut, and closes it on request', async () => {
    const user = userEvent.setup()
    renderClient(
      <Show
        message={{
          title: 'Created S007',
          action: { label: 'Open session', href: '/sessions/S007' },
        }}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Show' }))
    expect((await screen.findByRole('link', { name: 'Open session' })).getAttribute('href')).toBe(
      '/sessions/S007'
    )
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Open session' })).toBeNull()
    })
    expect(screen.queryAllByText('Created S007')).toEqual([])
  })
})
