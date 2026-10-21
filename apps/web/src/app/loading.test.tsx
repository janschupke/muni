// @vitest-environment jsdom
import { readdirSync } from 'node:fs'
import path from 'node:path'

import { screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { describe, expect, it } from 'vitest'

import { renderClient } from '@/test/render'

// Every page has its loading state beside it: a click shows it at once (Next prefetches it),
// while the page reads its data on the server. Without one, the click waits on the old page.
// A loading state covers every route below its folder too, so none sits above another route:
// a page with routes below it keeps its page and loading state in an `(index)` route group.

const APP = import.meta.dirname

function pagesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory()
      ? pagesIn(path.join(dir, entry.name))
      : entry.name === 'page.tsx'
        ? [path.relative(APP, dir)]
        : []
  )
}

const loadings = import.meta.glob<{ default: ComponentType }>('./**/loading.tsx', { eager: true })
const routeOf = (file: string) => path.dirname(file).replace(/^\.\/?/, '')

describe('loading states', () => {
  it('every page has one beside it', () => {
    const covered = new Set(Object.keys(loadings).map(routeOf))
    expect(pagesIn(APP).filter(route => !covered.has(route))).toEqual([])
  })

  it('none sits above another route, where it would stand in for that route’s own', () => {
    const pages = pagesIn(APP)
    const above = Object.keys(loadings)
      .map(routeOf)
      .filter(route =>
        pages.some(page => page !== route && page.startsWith(route ? `${route}/` : ''))
      )
    expect(above).toEqual([])
  })

  it.each(Object.keys(loadings))('%s says it is loading', file => {
    const Loading = loadings[file]?.default
    if (!Loading) throw new Error(`${file}: no default export`)
    renderClient(<Loading />)
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
  })
})
