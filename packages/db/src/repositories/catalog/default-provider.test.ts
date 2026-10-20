import { describe, expect, it } from 'vitest'

import type { Tx } from '../../client'
import { chooseDefaultProvider } from './default-provider'

const txWith = (providers: { id: string; name: string; completions: number }[]) =>
  ({
    provider: {
      findMany: () =>
        Promise.resolve(
          providers.map(p => ({ id: p.id, name: p.name, _count: { completions: p.completions } }))
        ),
    },
  }) as unknown as Tx

describe('chooseDefaultProvider', () => {
  it('takes the internal provider, however it is written, over any number of completions', async () => {
    expect(
      await chooseDefaultProvider(
        txWith([
          { id: 'busy', name: 'Externí lektor', completions: 900 },
          { id: 'own', name: 'INTERNI SKOLITEL', completions: 1 },
        ])
      )
    ).toBe('own')
  })

  it('else the one with the most completions, ties by name; none without providers', async () => {
    expect(
      await chooseDefaultProvider(
        txWith([
          { id: 'few', name: 'Alfa', completions: 3 },
          { id: 'zeta', name: 'Žeton', completions: 8 },
          { id: 'cesta', name: 'Čestmír', completions: 8 },
        ])
      )
    ).toBe('cesta')
    expect(await chooseDefaultProvider(txWith([]))).toBeNull()
  })
})
