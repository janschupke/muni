import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderClient } from '@/test/render'

import {
  AdvisorSkeleton,
  ArchivedRecordSkeleton,
  DashboardSkeleton,
  DetailSkeleton,
  FormSkeleton,
  ImportSkeleton,
  ListSkeleton,
  LoadingRegion,
  PlannerSkeleton,
} from './skeletons'

// @vitest-environment jsdom

vi.mock('@/server/actions/sessions', () => ({ checkSessionSlotAction: vi.fn() }))

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('skeletons', () => {
  it('stand in for each page in its shape, saying it is loading', () => {
    for (const skeleton of [
      <AdvisorSkeleton key="advisor" />,
      <PlannerSkeleton key="planner" />,
      <ImportSkeleton key="import" />,
      <ArchivedRecordSkeleton key="archived" />,
      <DashboardSkeleton key="dashboard" />,
      <DetailSkeleton key="detail" />,
      <FormSkeleton key="form" />,
      <ListSkeleton key="list" />,
    ]) {
      const { unmount } = renderClient(<LoadingRegion>{skeleton}</LoadingRegion>)
      expect(screen.getByRole('status').textContent).toBe('Loading…')
      unmount()
    }
  })
})
