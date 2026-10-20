// @vitest-environment jsdom
import type { ArchivedItem } from '@muni/db/repositories'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderClient } from '@/test/render'

import { ArchivedTable } from './archived-table'

vi.mock('@/server/actions/archive', () => ({ unarchiveAction: vi.fn() }))

const sessionItem = (id: string, label: string, startsAt: string | null): ArchivedItem => ({
  id,
  label,
  detail: 'BOZP – základní školení',
  when: startsAt === null ? null : { key: 'startsAt', value: startsAt, type: 'datetime' },
  tag: id,
  archivedAt: '2026-10-20T08:00:00.000Z',
  archivedBy: null,
})

const names = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map(row => within(row).getAllByRole('link')[0]?.textContent)

describe('ArchivedTable', () => {
  it('sorts archived sessions by when they were held, those without a date last', async () => {
    const user = userEvent.setup()
    renderClient(
      <ArchivedTable
        kind="session"
        paging={{ local: 'a test of the table' }}
        items={[
          sessionItem('s1', 'T030', '2026-12-01T07:00:00.000Z'),
          sessionItem('s2', 'T010', null),
          sessionItem('s3', 'T020', '2026-11-01T07:00:00.000Z'),
        ]}
      />
    )
    expect(names()).toEqual(['T030', 'T010', 'T020'])
    await user.click(screen.getByRole('button', { name: 'Date' }))
    expect(names()).toEqual(['T020', 'T030', 'T010'])
    await user.click(screen.getByRole('button', { name: 'Date' }))
    expect(names()).toEqual(['T030', 'T020', 'T010'])
  })
})
