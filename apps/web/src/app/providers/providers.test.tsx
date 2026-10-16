// @vitest-environment jsdom
import { getProvider, getProviderForEdit, listProviders } from '@muni/db/repositories'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { removeProvider } from '@/server/actions/providers'
import { getViewer, requirePageUser } from '@/server/auth'
import { expectNoAxeViolations } from '@/test/axe'
import { providerDetail, providerRow } from '@/test/fixtures'
import { NotFoundError } from '@/test/next'
import { params, renderServer } from '@/test/render'

import EditProviderPage from './[id]/edit/page'
import ProviderPage, { generateMetadata as providerMetadata } from './[id]/page'
import NewProviderPage, { generateMetadata as newMetadata } from './new/page'
import ProvidersPage, { generateMetadata as listMetadata } from './page'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getProvider: vi.fn(),
  getProviderForEdit: vi.fn(),
  listProviders: vi.fn(),
}))
vi.mock('@/server/auth')
vi.mock('@/server/actions/providers', () => ({
  saveProvider: vi.fn(),
  removeProvider: vi.fn(() => Promise.resolve({ status: 'refused', reason: 'in_use' })),
}))

const internal = providerRow({
  id: 'prov_int',
  name: 'Interní školitel',
  companyId: null,
  spend: null,
  lastCompletedOn: null,
  completions: 0,
  people: 0,
  courses: 0,
})

beforeEach(() => {
  vi.mocked(getViewer).mockResolvedValue('anonymous')
  vi.mocked(listProviders).mockResolvedValue({ providers: [providerRow(), internal], prices: true })
  vi.mocked(getProvider).mockResolvedValue(providerDetail())
  vi.mocked(getProviderForEdit).mockResolvedValue({
    id: 'prov_vzor',
    name: 'Vzorový školicí ústav',
    companyId: '00216224',
    email: 'kurzy@vzor.example',
    phone: null,
    website: null,
    note: null,
  })
})

describe('provider list', () => {
  it('shows each provider with what was completed with it, and sorts', async () => {
    const user = userEvent.setup()
    expect(await listMetadata()).toEqual({ title: 'Providers' })
    await renderServer(ProvidersPage())
    const vzor = screen.getByRole('row', { name: /Vzorový/ })
    expect(
      within(vzor).getByRole('link', { name: 'Vzorový školicí ústav' }).getAttribute('href')
    ).toBe('/providers/prov_vzor')
    expect(
      within(vzor)
        .getAllByRole('cell')
        .map(c => c.textContent.replace(/\s/g, ' '))
    ).toEqual([
      'Vzorový školicí ústav',
      '00216224',
      '718',
      '161',
      '10',
      'CZK 390,840',
      'Sep 30, 2026',
    ])
    expect(within(screen.getByRole('row', { name: /Interní/ })).getAllByText('—')).toHaveLength(3)
    expect(screen.queryByRole('link', { name: 'New provider' })).toBeNull()
    for (const header of ['Provider', 'IČO', 'Completions', 'People', 'Courses', 'Spent'])
      await user.click(screen.getByRole('button', { name: header }))
    await expectNoAxeViolations()
  })

  it('hides the spend from viewers who may not see prices; says when there are none', async () => {
    vi.mocked(listProviders).mockResolvedValueOnce({ providers: [providerRow()], prices: false })
    await renderServer(ProvidersPage())
    expect(screen.queryByRole('columnheader', { name: /Spent/ })).toBeNull()
    vi.mocked(getViewer).mockResolvedValue('authenticated')
    vi.mocked(listProviders).mockResolvedValueOnce({ providers: [], prices: true })
    await renderServer(ProvidersPage())
    expect(screen.getByRole('link', { name: 'New provider' }).getAttribute('href')).toBe(
      '/providers/new'
    )
    expect(screen.getByText(/No providers yet/)).toBeTruthy()
  })
})

describe('provider detail', () => {
  const props = { params: params({ id: 'prov_vzor' }) }

  it('shows its details, its totals, per course and its latest completions', async () => {
    expect(await providerMetadata(props)).toEqual({ title: 'Vzorový školicí ústav' })
    await renderServer(ProviderPage(props))
    expect(screen.getByRole('heading', { level: 1, name: 'Vzorový školicí ústav' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'kurzy@vzor.example' }).getAttribute('href')).toBe(
      'mailto:kurzy@vzor.example'
    )
    expect(screen.getByRole('link', { name: '+420 549 49 1111' }).getAttribute('href')).toBe(
      'tel:+420549491111'
    )
    expect(screen.getByRole('link', { name: 'www.vzor.example' }).getAttribute('href')).toBe(
      'https://www.vzor.example'
    )
    expect(screen.getByText('718 completions · 161 people · 10 courses')).toBeTruthy()
    expect(screen.getByText('CZK 390,840')).toBeTruthy()
    const lead = screen.getByRole('row', { name: /Vedení lidí\s*LEAD/ })
    expect(within(lead).getAllByText('—')).toHaveLength(2)
    const marie = screen.getByRole('row', { name: /Černá Marie/ })
    expect(within(marie).getByRole('link', { name: 'Černá Marie' }).getAttribute('href')).toBe(
      '/employees/E0153'
    )
    expect(within(marie).getByText('CZK 450.50')).toBeTruthy()
    expect(screen.getByText('The newest 2 completions with this provider.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    await expectNoAxeViolations()
  })

  it('without details, completions or prices, says so; and not one that does not exist', async () => {
    vi.mocked(getViewer).mockResolvedValue('authenticated')
    vi.mocked(getProvider).mockResolvedValue(
      providerDetail({
        ...internal,
        email: null,
        phone: null,
        website: null,
        note: null,
        prices: false,
        byCourse: [],
        recentCompletions: [],
      })
    )
    await renderServer(ProviderPage({ params: params({ id: 'prov_int' }) }))
    expect(screen.getByText('No contact details yet.')).toBeTruthy()
    expect(screen.getByText('No completion names this provider yet.')).toBeTruthy()
    expect(screen.queryByText('Spent')).toBeNull()
    expect(screen.queryByText('Latest completions')).toBeNull()
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
      '/providers/prov_int/edit'
    )
    vi.mocked(getProvider).mockResolvedValue(null)
    expect(await providerMetadata({ params: params({ id: 'gone' }) })).toEqual({ title: 'gone' })
    await expect(ProviderPage({ params: params({ id: 'gone' }) })).rejects.toThrow(NotFoundError)
  })
})

describe('provider forms', () => {
  it('add a provider, for signed-in users only', async () => {
    expect(await newMetadata()).toEqual({ title: 'New provider' })
    await renderServer(NewProviderPage())
    expect(requirePageUser).toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveProperty('value', '')
    // Renaming is explained only where there is a name to change.
    expect(screen.queryByText(/Renaming changes the name/)).toBeNull()
    await expectNoAxeViolations()
  })

  it('edit a provider with its current values, and refuse to delete one in use', async () => {
    const user = userEvent.setup()
    await renderServer(EditProviderPage({ params: params({ id: 'prov_vzor' }) }))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Edit Vzorový školicí ústav' })
    ).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /IČO/ })).toHaveProperty('value', '00216224')
    expect(screen.getByText(/Renaming changes the name/)).toBeTruthy()
    await expectNoAxeViolations()
    await user.click(screen.getByRole('button', { name: 'Delete provider' }))
    await user.click(
      within(
        await screen.findByRole('dialog', { name: 'Delete Vzorový školicí ústav?' })
      ).getByRole('button', { name: 'Delete' })
    )
    expect(removeProvider).toHaveBeenCalled()
    expect(
      await screen.findByText('Completions name this provider, so it cannot be deleted.')
    ).toBeTruthy()
    vi.mocked(getProviderForEdit).mockResolvedValue(null)
    await expect(EditProviderPage({ params: params({ id: 'gone' }) })).rejects.toThrow(
      NotFoundError
    )
  })
})
