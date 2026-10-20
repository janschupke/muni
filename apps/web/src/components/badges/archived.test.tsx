import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { advisorInput } from '@/test/fixtures'
import { renderClient } from '@/test/render'

import { PersonLink, RecordLink, UserName } from './archived'

// @vitest-environment jsdom

vi.mock('@/server/actions/assignments', () => ({ removeAssignmentAction: vi.fn() }))

vi.mock('@/server/actions/archive', () => ({ unarchiveAction: vi.fn() }))

afterEach(() => {
  vi.clearAllMocks()
})

const [T016, T018] = advisorInput().sessions
if (!T016 || !T018) throw new Error('fixture')

describe('archived names', () => {
  it('name an archived person or user by their tag, without a link', () => {
    renderClient(
      <>
        <PersonLink person={{ archived: true, tag: 'ab12cd' }} />
        <PersonLink person={{ archived: false, externalId: 'E1', name: 'Novák Jan' }} emphasis />
        <UserName user={{ archived: true, tag: 'ff00aa' }} />
        <p>
          <UserName user={{ archived: false, id: 'u', name: null, email: 'a@b.cz' }} />
        </p>
        <p>
          <UserName user={{ archived: false, id: 'u', name: null, email: null }} />
        </p>
        <RecordLink href="/rooms/r" archived>
          Stará aula
        </RecordLink>
      </>
    )
    expect(screen.getByText('Archived employee #ab12cd').closest('a')).toBeNull()
    expect(screen.getByRole('link', { name: 'Novák Jan' }).getAttribute('href')).toBe(
      '/employees/E1'
    )
    expect(screen.getByText('Archived user #ff00aa')).toBeTruthy()
    expect(screen.getByText('a@b.cz')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText('Stará aula').closest('a')).toBeNull()
  })
})
