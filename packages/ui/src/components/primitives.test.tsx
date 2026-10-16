import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { render } from '../test/render'
import { Alert } from './alert'
import { Badge } from './badge'
import { Button } from './button'
import { Card, CardBody, CardHeader } from './card'
import { DescriptionItem, DescriptionList, StatItem, StatList } from './description-list'
import { EmptyState } from './empty-state'
import { ItemList, ItemListRow } from './item-list'
import { Container, SplitLayout } from './layout'
import { PageHeader } from './page-header'
import { PageMessage } from './page-message'
import { SectionHeading } from './section-heading'
import { StepIndicator } from './step-indicator'
import { CellStack, Table, TableContainer, TBody, Td, Th, THead, Tr } from './table'
import { TextLink } from './text-link'
import { Toolbar, ToolbarSummary } from './toolbar'

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
  })
})

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
          <SectionHeading actions={<Button>Vše</Button>}>Nadcházející termíny</SectionHeading>
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
    expect(emptyIcon).toContain('bg-surface-sunken')
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
      'Nadcházející termíny',
      'Profil',
      'Školení',
    ])
    expect(screen.getByRole('article').className).toContain('rounded-lg')
    expect(screen.getByText('E0153').tagName).toBe('DD')
    expect(screen.getByText('3').tagName).toBe('DD')
  })

  it('shows an empty state as a box or a quiet line', () => {
    render(
      <>
        <EmptyState title="Žádné termíny">Zkuste jiné období.</EmptyState>
        <EmptyState title="Bez přihlášek" variant="inline" />
        <EmptyState title="Nic" />
      </>
    )
    expect(screen.getByText('Zkuste jiné období.')).toBeTruthy()
    expect(screen.getByText('Bez přihlášek').tagName).toBe('P')
  })

  it('lays out lists, toolbars and steps', () => {
    render(
      <>
        <ItemList>
          <ItemListRow>Řádek</ItemListRow>
        </ItemList>
        <Toolbar asChild>
          <form role="search" aria-label="Filtry">
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
    const steps = screen.getAllByRole('listitem').slice(1)
    expect(steps.map(s => s.getAttribute('aria-current'))).toEqual([null, 'step', null])
    // A finished step shows a tick instead of its number.
    expect(steps[0]?.textContent).toBe('Nahrát')
    expect(steps[2]?.textContent).toBe('3Potvrdit')
  })
})

describe('Table', () => {
  it('aligns, pins and stacks cells', () => {
    render(
      <TableContainer>
        <Table density="compact">
          <THead>
            <tr>
              <Th sticky="left">Jméno</Th>
              <Th align="right" nowrap>
                Cena
              </Th>
              <Th scope="row" sticky="right">
                Akce
              </Th>
            </tr>
          </THead>
          <TBody>
            <Tr>
              <Td sticky="left">
                <CellStack title="Marie Černá" meta="E0153" />
              </Td>
              <Td align="right" nowrap>
                450 Kč
              </Td>
              <Td sticky="right">
                <CellStack title="Bez meta" />
              </Td>
            </Tr>
          </TBody>
        </Table>
      </TableContainer>
    )
    const [name, price, action] = screen.getAllByRole('columnheader')
    expect(name?.className).toContain('sticky left-0')
    expect(price?.className).toContain('text-right tabular-nums')
    expect(price?.className).toContain('whitespace-nowrap')
    expect(screen.getByRole('rowheader').className).toContain('right-0')
    expect(action).toBeUndefined()
    expect(screen.getByRole('table').className).toContain('[&_td]:px-2')
    expect(screen.getByText('E0153').className).toContain('text-xs')
    expect(screen.getByText('Bez meta').parentElement?.children).toHaveLength(1)
    expect(screen.getByText('450 Kč').className).toContain('text-right')
  })
})
