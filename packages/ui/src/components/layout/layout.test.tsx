import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { render } from '../../test/render'
import { Button } from '../actions/button'
import { EmptyState } from '../feedback/empty-state'
import { PageMessage } from '../feedback/page-message'
import { StepIndicator } from '../feedback/step-indicator'
import { Card, CardBody, CardHeader } from './card'
import { DescriptionItem, DescriptionList, StatItem, StatList } from './description-list'
import { DetailGrid, DetailPanel } from './detail-panel'
import { ItemList, ItemListRow } from './item-list'
import { Container, SplitLayout } from './layout'
import { PageHeader } from './page-header'
import { SectionHeading } from './section-heading'
import { Toolbar, ToolbarChip, ToolbarSummary } from './toolbar'

describe('surfaces and layout', () => {
  it('builds cards, headers and page structure', () => {
    render(
      <Container asChild>
        <main>
          <PageHeader
            eyebrow="← Zaměstnanci"
            title="Marie Černá"
            description="Laborantka · Laboratoře"
            actions={<Button>Upravit</Button>}
          />
          <SectionHeading actions={<Button>Vše</Button>} description="Příštích 30 dní">
            Nadcházející termíny
          </SectionHeading>
          <SplitLayout
            side={
              <Card>
                <CardHeader title="Profil" description="Údaje" actions={<Button>Akce</Button>} />
                <CardBody>
                  <DescriptionList>
                    <DescriptionItem label="ID">E0153</DescriptionItem>
                  </DescriptionList>
                </CardBody>
              </Card>
            }
            main={
              <Card asChild>
                <article>
                  <CardHeader title="Školení" />
                  <StatList>
                    <StatItem label="Platná">3</StatItem>
                  </StatList>
                </article>
              </Card>
            }
          />
          <PageMessage
            title="Nenalezeno"
            description="Stránka neexistuje."
            actions={<a href="/">Domů</a>}
          />
          <PageMessage title="Chyba" icon={<svg aria-hidden />} tone="danger">
            <code>abc</code>
          </PageMessage>
          <PageMessage title="Prázdno" icon={<svg aria-hidden />} />
        </main>
      </Container>
    )
    // Full width up to 1920px.
    expect(screen.getByRole('main').className).toContain('max-w-page')
    expect(screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent)).toEqual([
      'Marie Černá',
      'Nenalezeno',
      'Chyba',
      'Prázdno',
    ])
    expect(screen.getByText('abc').parentElement?.className).toContain('text-fg-muted')
    const [errorIcon, emptyIcon] = screen
      .getAllByRole('heading', { level: 1 })
      .slice(2)
      .map(h => h.previousElementSibling?.className ?? '')
    expect(errorIcon).toContain('bg-danger-soft')
    expect(emptyIcon).toContain('bg-tint')
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
      'Nadcházející termíny',
      'Profil',
      'Školení',
    ])
    expect(screen.getByText('Příštích 30 dní').tagName).toBe('P')
    expect(screen.getByRole('article').className).toContain('rounded-lg')
    expect(screen.getByText('E0153').tagName).toBe('DD')
    expect(screen.getByText('3').tagName).toBe('DD')
  })

  it('shows an empty state as a box or a quiet line', () => {
    render(
      <>
        <EmptyState title="Žádné termíny" action={<a href="/sessions/new">Nový termín</a>}>
          Zkuste jiné období.
        </EmptyState>
        <EmptyState title="Bez rezervací" variant="inline" />
        <EmptyState title="Nic" />
      </>
    )
    expect(screen.getByText('Zkuste jiné období.')).toBeTruthy()
    expect(screen.getByText('Bez rezervací').tagName).toBe('P')
    // What to do about it sits in the box, under its text.
    expect(
      screen.getByRole('link', { name: 'Nový termín' }).closest('.border-dashed')?.textContent
    ).toContain('Žádné termíny')
  })

  it('lays out lists, toolbars and steps', () => {
    render(
      <>
        <ItemList>
          <ItemListRow>Řádek</ItemListRow>
        </ItemList>
        <Toolbar asChild>
          <form role="search" aria-label="Filtry">
            <ToolbarChip remove={<button type="button">Odebrat filtr</button>}>
              Podřízení: Novák
            </ToolbarChip>
            <ToolbarSummary>12 lidí</ToolbarSummary>
          </form>
        </Toolbar>
        <Toolbar>
          <span>bez formuláře</span>
        </Toolbar>
        <StepIndicator steps={['Nahrát', 'Zkontrolovat', 'Potvrdit']} current={1} />
      </>
    )
    expect(screen.getByText('Řádek').tagName).toBe('LI')
    expect(within(screen.getByRole('search')).getByText('12 lidí')).toBeTruthy()
    // A filter from a link: its words and the button that drops it, at a control's height.
    const chip = screen.getByText(/Podřízení: Novák/)
    expect(within(chip).getByRole('button', { name: 'Odebrat filtr' })).toBeTruthy()
    expect(chip.className).toContain('h-9')
    const steps = screen.getAllByRole('listitem').slice(1)
    expect(steps.map(s => s.getAttribute('aria-current'))).toEqual([null, 'step', null])
    // A finished step shows a tick instead of its number.
    expect(steps[0]?.textContent).toBe('Nahrát')
    expect(steps[2]?.textContent).toBe('3Potvrdit')
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
