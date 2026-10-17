// Read and write access for the web app. Every function returns plain, serialisable DTOs;
// personal fields have already been passed through the sanitisation policy for the role.
import 'server-only'

export { getAdvisorInput } from './advisor'
export type { PersonRef, UserRef } from './archive'
export {
  type ArchivedField,
  type ArchivedItem,
  type ArchivedRecord,
  type ArchiveImpact,
  archiveImpact,
  archiveRecord,
  type ArchiveRefusal,
  getArchivedRecord,
  listArchived,
  type UnarchiveOutcome,
  unarchiveRecord,
  type UniqueField,
} from './archiving'
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
} from './assignments'
export { getPolicy, type RepoOptions } from './context'
export { type ComplianceSnapshot, loadCompliance } from './context'
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
} from './courses'
export {
  type ComplianceMatrix,
  type ComplianceMatrixPerson,
  type ComplianceMatrixRow,
  type DashboardData,
  getComplianceMatrix,
  getDashboard,
} from './dashboard'
export { pageEmployees } from './employee-sort'
export {
  type EmployeeDetail,
  type EmployeeFilters,
  type EmployeeListItem,
  type EmployeeListRequirement,
  getEmployee,
  getEmployeeForEdit,
  listEmployees,
  type TeamMember,
} from './employees'
export { isPrismaCode } from './errors'
export { recordExists } from './exists'
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
} from './groups'
export {
  getPersonName,
  listDepartments,
  listEmployeeOptions,
  listPositions,
  listProviderOptions,
  listRoomOptions,
  type PersonOption,
  type RoomOption,
} from './lookups'
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
} from './mutations'
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
} from './org'
export { type ListQuery, type Page, pageOf, type SortValue } from './paging'
export { getPlannerInput } from './planner'
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
} from './providers'
export { hitRateLimit } from './rate-limits'
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
} from './records'
export { getRoom, getRoomForEdit, listRooms, type RoomDetail, type RoomListItem } from './rooms'
export { countSessions, getSession, listSessions, type SessionWindow } from './sessions'
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
} from './users'
