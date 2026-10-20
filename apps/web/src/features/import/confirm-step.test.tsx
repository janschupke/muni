// @vitest-environment jsdom
import { EMPTY_REFERENCE, type ImportBatch, parseFile, validateBatch } from '@muni/importer'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderClient } from '@/test/render'

import { ConfirmStep } from './confirm-step'

/** The courses of a catalogue export, validated as the wizard does. */
function courses(lines: string[]): ImportBatch {
  const file = parseFile(
    'katalog.csv',
    new TextEncoder().encode(['kod,nazev,platnost_mesicu,povinne_pro', ...lines].join('\n')),
    { today: '2026-10-16' }
  )
  // Only the courses: the other datasets are not in this batch at all.
  return {
    courses: validateBatch({ courses: file.rows } as ImportBatch, EMPTY_REFERENCE).courses ?? [],
  }
}

describe('ConfirmStep', () => {
  it('counts what will be written and how many invalid rows are skipped', async () => {
    const user = userEvent.setup()
    const onStart = vi.fn()
    const onBack = vi.fn()
    renderClient(
      <ConfirmStep
        batch={courses([
          'BOZP-Z,BOZP – základní školení,24,VSICHNI',
          'GDPR,Ochrana osobních údajů,24,VSICHNI',
          'XX,,24,VSICHNI',
        ])}
        onBack={onBack}
        onStart={onStart}
      />
    )
    expect(screen.getByText('Courses: 2 records will be written')).toBeTruthy()
    expect(screen.getByText('1 invalid row is skipped.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Import 2 records' }))
    expect(onStart).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Back to review' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('cannot start when no row would be written', () => {
    renderClient(
      <ConfirmStep batch={courses(['XX,,24,VSICHNI'])} onBack={vi.fn()} onStart={vi.fn()} />
    )
    expect(screen.getByText('Courses: 0 records will be written')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Import 0 records' })).toHaveProperty(
      'disabled',
      true
    )
  })

  it('says nothing about skipped rows when every row is written', () => {
    renderClient(
      <ConfirmStep
        batch={courses(['GDPR,Ochrana osobních údajů,24,VSICHNI'])}
        onBack={vi.fn()}
        onStart={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Import 1 record' })).toHaveProperty(
      'disabled',
      false
    )
    expect(screen.queryByText(/skipped/)).toBeNull()
  })
})
