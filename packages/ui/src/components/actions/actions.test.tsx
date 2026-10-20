import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { render } from '../../test/render'
import { Badge } from '../display/badge'
import { Button } from './button'
import { TextLink } from './text-link'

describe('Badge, Button and TextLink', () => {
  it('render their element, or put their styling on the child with asChild', () => {
    render(
      <>
        <Badge tone="danger">Prošlé</Badge>
        <Badge>Bez tónu</Badge>
        <Button>Uložit</Button>
        <Button type="submit" variant="primary" size="sm">
          Odeslat
        </Button>
        <Button asChild variant="ghost">
          <a href="/employees">Zaměstnanci</a>
        </Button>
        <TextLink href="/courses" emphasis>
          Kurzy
        </TextLink>
        <TextLink asChild>
          <a href="/sessions">Termíny</a>
        </TextLink>
        <TextLink asChild arrow hitArea>
          <a href="/advisor">Poradce</a>
        </TextLink>
      </>
    )
    expect(screen.getByText('Prošlé').className).toContain('text-danger-fg')
    expect(screen.getByText('Bez tónu').className).toContain('text-fg-muted')
    expect(screen.getByRole('button', { name: 'Uložit' }).getAttribute('type')).toBe('button')
    expect(screen.getByRole('button', { name: 'Odeslat' }).getAttribute('type')).toBe('submit')
    const asLink = screen.getByRole('link', { name: 'Zaměstnanci' })
    expect(asLink.className).toContain('inline-flex')
    expect(screen.getByRole('link', { name: 'Kurzy' }).className).toContain('font-medium')
    expect(screen.getByRole('link', { name: 'Termíny' }).getAttribute('href')).toBe('/sessions')
    // Every link: the link colour, underlined on hover and never at rest, marked as a link.
    for (const name of ['Kurzy', 'Termíny', 'Poradce']) {
      const link = screen.getByRole('link', { name })
      expect(link.className).toContain('text-link')
      expect(link.className).toContain('hover:underline')
      expect(link.className).not.toMatch(/(^| )underline( |$)/)
      expect(link.hasAttribute('data-link')).toBe(true)
    }
    // A link that leads on ends with an arrow inside it; listed links are 24px tall.
    const onward = screen.getByRole('link', { name: 'Poradce' })
    expect(onward.querySelector('svg')).toBeTruthy()
    expect(onward.className).toContain('min-h-6')
  })
})
