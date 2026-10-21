import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { route } from '@/test/next'
import { renderClient } from '@/test/render'

import { NavigationHistory, originOf, parseHistory, readHistory } from './navigation-history'

// @vitest-environment jsdom

vi.mock('@/server/actions/sessions', () => ({ checkSessionSlotAction: vi.fn() }))

const HISTORY = 'muni.history'

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('navigation history', () => {
  it('records each page and its title in this tab', async () => {
    route.pathname = '/courses'
    document.title = 'Courses · Training register'
    window.history.replaceState(null, '', '/courses')
    renderClient(
      <NavigationHistory>
        <p>Obsah</p>
      </NavigationHistory>
    )
    expect(screen.getByText('Obsah')).toBeTruthy()
    await waitFor(() => {
      expect(parseHistory(readHistory())).toEqual([
        { href: '/courses', title: 'Courses · Training register' },
      ])
    })
    // A title that changes later is picked up; one seen on another URL is not.
    document.title = 'Kurzy · Registr školení'
    await waitFor(() => {
      expect(parseHistory(readHistory())[0]?.title).toBe('Kurzy · Registr školení')
    })
    window.history.replaceState(null, '', '/elsewhere')
    document.title = 'Elsewhere'
    // The observer's callback is a microtask queued by the change: one queued after it runs
    // once the observer has seen the new title.
    await Promise.resolve()
    expect(parseHistory(readHistory())[0]?.title).toBe('Kurzy · Registr školení')
  })

  it('records a page with its query, and its title only while the address is still its own', async () => {
    route.pathname = '/employees'
    route.search = 'department=Laborato%C5%99e'
    document.title = 'Employees · Training register'
    window.history.replaceState(null, '', '/employees?department=Laboratoře')
    renderClient(
      <NavigationHistory>
        <p>Lidé</p>
      </NavigationHistory>
    )
    await waitFor(() => {
      expect(parseHistory(readHistory())).toEqual([
        {
          href: '/employees?department=Laborato%C5%99e',
          title: 'Employees · Training register',
        },
      ])
    })
  })

  it('goes back to the page a form was opened from, with its filters', () => {
    window.history.replaceState(null, '', '/courses/new?copy=BOZP-Z')
    const history = (...hrefs: string[]) =>
      JSON.stringify(hrefs.map(href => ({ href, title: null })))
    expect(originOf(history('/courses?archived=1', '/courses/new?copy=BOZP-Z'))).toBe(
      '/courses?archived=1'
    )
    // Nothing in this tab led here.
    expect(originOf(history('/courses/new?copy=BOZP-Z'))).toBeNull()
  })

  it('survives blocked storage and junk in it', () => {
    sessionStorage.setItem(HISTORY, '{not json')
    expect(parseHistory(readHistory())).toEqual([])
    sessionStorage.setItem(HISTORY, '{"an":"object"}')
    expect(parseHistory(readHistory())).toEqual([])
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readHistory()).toBeNull()
    renderClient(
      <NavigationHistory>
        <p>Pořád funguje</p>
      </NavigationHistory>
    )
    expect(screen.getByText('Pořád funguje')).toBeTruthy()
  })
})
