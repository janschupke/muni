import { describe, expect, it } from 'vitest'

import { renderClient } from '@/test/render'

import { useField } from './form-context'

function Probe() {
  const field = useField('name')
  field.changed()
  return <p>{JSON.stringify({ error: field.error, dirty: field.dirty, touched: field.touched })}</p>
}

// @vitest-environment jsdom

describe('useField', () => {
  it('outside a form, a field has no error and was neither changed nor visited', () => {
    const { container } = renderClient(<Probe />)
    expect(container.textContent).toBe('{"dirty":false,"touched":false}')
  })
})
