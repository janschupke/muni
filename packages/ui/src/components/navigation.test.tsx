import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { render } from '../test/render'
import { THEME_BOOT_SCRIPT, THEME_STORAGE_KEY } from '../theme/boot'
import { ThemeToggle } from '../theme/theme-toggle'
import { LinkTab, LinkTabs, NavItem } from './nav'
import { Pagination } from './pagination'
import { SegmentedControl } from './segmented-control'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'
import { Tooltip } from './tooltip'

function FakeLink({ href, rel, children }: { href: string; rel?: string; children: ReactNode }) {
  return (
    <a href={href} rel={rel}>
      {children}
    </a>
  )
}

const labels = { nav: 'Stránky', previous: 'Předchozí', next: 'Další', status: 'Strana 2 z 3' }

describe('route tabs and navigation', () => {
  it('marks the current page, as a plain link or on the app’s link', () => {
    render(
      <>
        <LinkTabs aria-label="Termíny">
          <LinkTab href="/sessions" active>
            Nadcházející
          </LinkTab>
          <LinkTab asChild>
            <a href="/sessions?when=past">Proběhlé</a>
          </LinkTab>
        </LinkTabs>
        <nav aria-label="Hlavní">
          <NavItem href="/" active>
            Přehled
          </NavItem>
          <NavItem asChild>
            <a href="/advisor">Poradce</a>
          </NavItem>
        </nav>
      </>
    )
    expect(screen.getByRole('link', { name: 'Nadcházející' }).getAttribute('aria-current')).toBe(
      'page'
    )
    expect(screen.getByRole('link', { name: 'Proběhlé' }).hasAttribute('aria-current')).toBe(false)
    expect(screen.getByRole('link', { name: 'Přehled' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Poradce' }).className).toContain('rounded-md')
  })

  it('switches Radix tabs', async () => {
    const user = userEvent.setup()
    render(
      <Tabs defaultValue="plan">
        <TabsList aria-label="Pohledy">
          <TabsTrigger value="plan">Plán</TabsTrigger>
          <TabsTrigger value="over">Přeplněné</TabsTrigger>
        </TabsList>
        <TabsContent value="plan">Obsah plánu</TabsContent>
        <TabsContent value="over">Obsah přeplněných</TabsContent>
      </Tabs>
    )
    expect(screen.getByRole('tabpanel').textContent).toBe('Obsah plánu')
    await user.click(screen.getByRole('tab', { name: 'Přeplněné' }))
    expect(screen.getByRole('tabpanel').textContent).toBe('Obsah přeplněných')
  })
})

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

describe('SegmentedControl', () => {
  it('uses the label as the visible text when there is no icon, and can be disabled', () => {
    render(
      <SegmentedControl
        label="Období"
        value="upcoming"
        onValueChange={vi.fn()}
        disabled
        items={[
          { value: 'upcoming', label: 'Nadcházející' },
          { value: 'past', label: 'Proběhlé' },
        ]}
      />
    )
    const radio = screen.getByRole('radio', { name: 'Proběhlé' })
    expect(radio.hasAttribute('aria-label')).toBe(false)
    expect(radio.hasAttribute('disabled')).toBe(true)
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
})

describe('theme', () => {
  const themeLabels = { light: 'Světlý', dark: 'Tmavý', system: 'Systémový' }

  afterEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
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
    expect(document.documentElement.dataset.theme).toBe('dark')
    delete document.documentElement.dataset.theme
    localStorage.setItem(THEME_STORAGE_KEY, 'neon')
    boot()
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('starts from the choice the boot script applied, and stores a new one', async () => {
    const user = userEvent.setup()
    document.documentElement.dataset.theme = 'light'
    render(<ThemeToggle labels={themeLabels} groupLabel="Motiv" />)
    expect(screen.getByRole('radio', { name: 'Světlý' }).getAttribute('aria-checked')).toBe('true')
    await user.click(screen.getByRole('radio', { name: 'Tmavý' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    await user.click(screen.getByRole('radio', { name: 'Systémový' }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
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
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
