// Imports nothing the mock replaces: the factory runs while the mocked module loads.
import { vi } from 'vitest'

/** The repositories as the server tests mock them: every write a spy. */
export const repositoriesMock = () => ({
  isPrismaCode: (error: unknown, code: string) =>
    (error as { code?: unknown } | null)?.code === code,
  applyAssignments: vi.fn(),
  archiveImpact: vi.fn(),
  cancelSession: vi.fn(),
  reinstateSession: vi.fn(),
  archiveRecord: vi.fn(),
  unarchiveRecord: vi.fn(),
  revertUserRole: vi.fn(),
  setUserRole: vi.fn(),
  createCourse: vi.fn(),
  createEmployee: vi.fn(),
  saveDepartment: vi.fn(),
  savePosition: vi.fn(),
  checkSessionSlot: vi.fn(),
  updateCompletion: vi.fn(),
  createCompletion: vi.fn(),
  createProvider: vi.fn(),
  createRoom: vi.fn(),
  createSession: vi.fn(),
  findUserByClerkId: vi.fn(),
  updateProvider: vi.fn(),
  updateRoom: vi.fn(),
  moveSeatsMany: vi.fn(),
  raiseCapacity: vi.fn(),
  createSessionWithBookings: vi.fn(),
  removeAssignment: vi.fn(),
  updateCourse: vi.fn(),
  updateEmployee: vi.fn(),
  updateSession: vi.fn(),
  upsertUserFromClerk: vi.fn(),
})
