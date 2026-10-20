import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { render } from '../test/render'
import { THEME_BOOT_SCRIPT, THEME_STORAGE_KEY } from './boot'
import { ThemeToggle } from './theme-toggle'

describe('theme', () => {
  const themeLabels = { light: 'Světlý', dark: 'Tmavý', system: 'Systémový' }

  afterEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    vi.restoreAllMocks()
  })

  it('the boot script applies a stored choice before paint, and ignores anything else', () => {
    // As the layout ships it: an inline script in <head>.
    const boot = () => {
      const script = document.createElement('script')
      script.textContent = THEME_BOOT_SCRIPT
      document.head.append(script)
      script.remove()
    }
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    boot()
    expect(document.documentElement.dataset['theme']).toBe('dark')
    document.documentElement.removeAttribute('data-theme')
    localStorage.setItem(THEME_STORAGE_KEY, 'neon')
    boot()
    expect(document.documentElement.dataset['theme']).toBeUndefined()
  })

  it('starts from the choice the boot script applied, and stores a new one', async () => {
    const user = userEvent.setup()
    document.documentElement.dataset['theme'] = 'light'
    render(<ThemeToggle labels={themeLabels} groupLabel="Motiv" />)
    expect(screen.getByRole('radio', { name: 'Světlý' }).getAttribute('aria-checked')).toBe('true')
    await user.click(screen.getByRole('radio', { name: 'Tmavý' }))
    expect(document.documentElement.dataset['theme']).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    await user.click(screen.getByRole('radio', { name: 'Systémový' }))
    expect(document.documentElement.dataset['theme']).toBeUndefined()
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  it('keeps every switch on the page in step', async () => {
    const user = userEvent.setup()
    render(
      <>
        <ThemeToggle labels={themeLabels} groupLabel="Motiv" />
        <ThemeToggle labels={themeLabels} groupLabel="Motiv 2" />
      </>
    )
    await user.click(screen.getAllByRole('radio', { name: 'Tmavý' })[0] as HTMLElement)
    for (const radio of screen.getAllByRole('radio', { name: 'Tmavý' }))
      expect(radio.getAttribute('aria-checked')).toBe('true')
  })

  it('still switches when storage is blocked', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<ThemeToggle labels={themeLabels} groupLabel="Motiv" />)
    expect(screen.getByRole('radio', { name: 'Systémový' }).getAttribute('aria-checked')).toBe(
      'true'
    )
    await user.click(screen.getByRole('radio', { name: 'Tmavý' }))
    expect(document.documentElement.dataset['theme']).toBe('dark')
  })
})
