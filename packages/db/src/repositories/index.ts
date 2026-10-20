// Read and write access for the web app. Every function returns plain, serialisable DTOs;
// personal fields have already been passed through the sanitisation policy for the role.
import 'server-only'

export type { PersonRef, UserRef } from './archive/archive'
export {
  type ArchivedField,
  type ArchivedItem,
  type ArchivedRecord,
  getArchivedRecord,
  listArchived,
} from './archive/archived-records'
export {
  type ArchiveImpact,
  archiveImpact,
  archiveRecord,
  type ArchiveRefusal,
  type UnarchiveOutcome,
  unarchiveRecord,
  type UniqueField,
} from './archive/archiving'
export {
  type CourseDetail,
  type CourseListItem,
  type CourseOption,
  getCourse,
  getCourseForEdit,
  listCourseOptions,
  listCourses,
  type RequirementView,
  type SessionBooking,
  type SessionListItem,
} from './catalog/courses'
export {
  createProvider,
  getProvider,
  getProviderForEdit,
  listProviders,
  type ProviderDetail,
  type ProviderList,
  type ProviderListItem,
  type ProviderTotals,
  type ProviderWrite,
  updateProvider,
} from './catalog/providers'
export { getPolicy, type RepoOptions } from './core/context'
export { type ComplianceSnapshot, loadCompliance } from './core/context'
export { isPrismaCode } from './core/errors'
export { recordExists } from './core/exists'
export {
  getPersonName,
  listDepartments,
  listEmployeeOptions,
  listPositions,
  listProviderOptions,
  listRoomOptions,
  type PersonOption,
  type RoomOption,
} from './core/lookups'
export { type ListQuery, type Page, pageOf, type SortValue } from './core/paging'
export { hitRateLimit } from './core/rate-limits'
export {
  getDepartmentForEdit,
  getPositionForEdit,
  type GroupKind,
  type GroupProblem,
  type GroupWrite,
  listDepartmentHeads,
  listDepartmentPositions,
  listGroupOptions,
  saveDepartment,
  savePosition,
} from './org/groups'
export {
  type CourseCompliance,
  type DepartmentDetail,
  type DepartmentSummary,
  getDepartment,
  getGroupName,
  getPosition,
  listDepartmentSummaries,
  listGroupMembers,
  listPositionSummaries,
  type PositionDetail,
  type PositionSummary,
} from './org/org'
export {
  type ComplianceMatrix,
  type ComplianceMatrixPerson,
  type ComplianceMatrixRow,
  type DashboardData,
  getComplianceMatrix,
  getDashboard,
} from './overview/dashboard'
export { pageEmployees } from './people/employee-sort'
export {
  type EmployeeDetail,
  type EmployeeFilters,
  type EmployeeListItem,
  type EmployeeListRequirement,
  getEmployee,
  getEmployeeForEdit,
  listEmployees,
  type TeamMember,
} from './people/employees'
export {
  type ClerkUserSync,
  findUserByClerkId,
  getUser,
  listUsers,
  revertUserRole,
  type RoleChange,
  setUserRole,
  upsertUserFromClerk,
  type UserDetail,
  type UserListItem,
  type UserRecord,
} from './people/users'
export { getAdvisorInput } from './planning/advisor'
export { getPlannerInput } from './planning/planner'
export {
  cancelSession,
  checkSessionSlot,
  createRoom,
  createSession,
  createSessionWithBookings,
  type PlannedSessionWrite,
  raiseCapacity,
  type RaiseProblem,
  reinstateSession,
  type RoomWrite,
  type SessionProblem,
  type SessionStatusRefusal,
  type SessionStatusWrite,
  type SessionWrite,
  updateRoom,
  updateSession,
} from './records/mutations'
export {
  createCompletion,
  createCourse,
  createEmployee,
  getCompletionForEdit,
  type RecordProblem,
  type RecordWrite,
  updateCompletion,
  updateCourse,
  updateEmployee,
} from './records/records'
export {
  applyAssignments,
  ASSIGNMENT_FAILURES,
  type AssignmentFailure,
  type AssignmentOutcome,
  type AssignmentRequest,
  type BookingsOf,
  type EmployeeBooking,
  listUpcomingBookings,
  type MoveFailure,
  type MoveOutcome,
  moveSeatsMany,
  removeAssignment,
  type SeatMoveRequest,
  type UpcomingBooking,
} from './scheduling/assignments'
export {
  getRoom,
  getRoomForEdit,
  listRooms,
  type RoomDetail,
  type RoomListItem,
} from './scheduling/rooms'
export { countSessions, getSession, listSessions, type SessionWindow } from './scheduling/sessions'
