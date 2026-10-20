import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { route, router } from '@/test/next'
import { renderClient } from '@/test/render'

import { BackLink } from './back-link'

// @vitest-environment jsdom

vi.mock('@/server/actions/sessions', () => ({ checkSessionSlotAction: vi.fn() }))

const HISTORY = 'muni.history'

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('back links', () => {
  const store = (entries: { href: string; title: string | null }[]) => {
    sessionStorage.setItem(HISTORY, JSON.stringify(entries))
  }

  it('fall back to the parent page without history', () => {
    renderClient(<BackLink fallback={{ href: '/employees', label: 'Employees' }} />)
    expect(screen.getByRole('link', { name: 'Back to Employees' }).getAttribute('href')).toBe(
      '/employees'
    )
  })

  it('name the page the visitor came from, filters included, and go back for real', async () => {
    const user = userEvent.setup()
    route.pathname = '/employees/E0153'
    store([
      { href: '/employees?department=Laborato%C5%99e', title: 'Employees · Training register' },
      { href: '/employees/E0153', title: 'Marie Černá · Training register' },
    ])
    renderClient(<BackLink fallback={{ href: '/employees', label: 'Employees' }} />)
    const link = await screen.findByRole('link', { name: 'Back to Employees' })
    expect(link.getAttribute('href')).toBe('/employees?department=Laborato%C5%99e')
    await user.click(link)
    expect(router.back).toHaveBeenCalled()
  })

  it('skip forms, call the overview by name, and use the fallback label for untitled pages', async () => {
    route.pathname = '/employees/E0153'
    route.search = 'tab=history'
    store([
      { href: '/', title: 'Training register' },
      { href: '/employees/E0153/edit', title: 'Edit · Training register' },
      { href: '/employees/E0153?tab=history', title: null },
    ])
    renderClient(<BackLink fallback={{ href: '/employees', label: 'Employees' }} />)
    expect(
      (await screen.findByRole('link', { name: 'Back to Overview' })).getAttribute('href')
    ).toBe('/')
    act(() => {
      store([{ href: '/courses', title: null }])
      window.dispatchEvent(new Event('muni:history'))
    })
    expect(await screen.findByRole('link', { name: 'Back to Employees' })).toBeTruthy()
  })
})
