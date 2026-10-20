import { describe, expect, it } from 'vitest'

import { isLocalHref } from './local-href'

describe('isLocalHref', () => {
  it('takes a path in the app', () => {
    for (const href of ['/', '/employees', '/sessions/S001?tab=past', '/rooms#seats'])
      expect(isLocalHref(href), href).toBe(true)
  })

  it('refuses anything a browser could take to another origin', () => {
    for (const href of [
      '//evil.example',
      '/\\evil.example',
      '\\\\evil.example',
      'https://evil.example',
      'javascript:alert(1)',
      'employees',
      '/\tevil',
      '/\nnext',
      '',
    ])
      expect(isLocalHref(href), JSON.stringify(href)).toBe(false)
  })
})
