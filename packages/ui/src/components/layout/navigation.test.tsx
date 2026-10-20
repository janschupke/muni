import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { render } from '../../test/render'
import { LinkTab, LinkTabs, NavItem, tabTriggerClass } from './nav'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'

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

describe('tabs', () => {
  it('answer the pointer with a fill and an underline, not only the text', () => {
    expect(tabTriggerClass).toContain('hover:bg-state-hover')
    expect(tabTriggerClass).toContain('hover:border-border-emphasis')
  })
})
