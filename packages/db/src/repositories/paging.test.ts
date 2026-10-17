import { describe, expect, it } from 'vitest'

import { pageBounds, pageOf } from './paging'

const rows = [
  { name: 'Černá', seats: 3, price: null },
  { name: 'Adámek', seats: 10, price: 450 },
  { name: 'Chvátal', seats: 1, price: 120 },
  { name: 'Hájek', seats: 3, price: 900 },
  { name: 'Bílá', seats: 7, price: null },
]
const keys = {
  name: (r: (typeof rows)[number]) => r.name,
  seats: (r: (typeof rows)[number]) => r.seats,
  price: (r: (typeof rows)[number]) => r.price,
}

describe('pageOf', () => {
  it('keeps the order it is given without a sort, and pages it', () => {
    const page = pageOf(rows, { page: 2, pageSize: 2 }, keys)
    expect(page).toMatchObject({ total: 5, page: 2, pageSize: 2, pageCount: 3 })
    expect(page.items.map(r => r.name)).toEqual(['Chvátal', 'Hájek'])
  })

  it('sorts text the Czech way (ch after h), numbers as numbers, either way', () => {
    const byName = pageOf(rows, { sort: { by: 'name', desc: false } }, keys)
    expect(byName.items.map(r => r.name)).toEqual(['Adámek', 'Bílá', 'Černá', 'Hájek', 'Chvátal'])
    const bySeats = pageOf(rows, { sort: { by: 'seats', desc: true } }, keys)
    expect(bySeats.items.map(r => r.seats)).toEqual([10, 7, 3, 3, 1])
    // Ties keep the order they came in.
    expect(bySeats.items.slice(2, 4).map(r => r.name)).toEqual(['Černá', 'Hájek'])
  })

  it('puts missing values last in both directions', () => {
    for (const desc of [false, true]) {
      const page = pageOf(rows, { sort: { by: 'price', desc } }, keys)
      expect(page.items.slice(-2).map(r => r.price)).toEqual([null, null])
    }
  })

  it('gives the last page for a page past the end, and page 1 of an empty list', () => {
    expect(pageOf(rows, { page: 99, pageSize: 2 }, keys).page).toBe(3)
    expect(pageOf([], { page: 4 }, keys)).toMatchObject({
      items: [],
      total: 0,
      page: 1,
      pageCount: 1,
    })
  })
})

describe('pageBounds', () => {
  it('holds the size to 1–100, 25 when not asked', () => {
    expect(pageBounds(10, {}).pageSize).toBe(25)
    expect(pageBounds(10, { pageSize: 0 }).pageSize).toBe(1)
    expect(pageBounds(10, { pageSize: 500 }).pageSize).toBe(100)
  })
})
