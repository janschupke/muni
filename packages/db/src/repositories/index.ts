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
  type EmployeeBooking,
  listEmployeeBookings,
  MOVE_FAILURES,
  type MoveFailure,
  moveSeats,
  removeAssignment,
} from './assignments'
export { getPolicy, type RepoOptions } from './context'
export {
  type CourseDetail,
  type CourseListItem,
  type CourseOption,
  getCourse,
  getCourseForEdit,
  listCourseOptions,
  listCourses,
  type RequirementView,
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
export { EMPLOYEE_SORT_KEYS, type EmployeeSortKey } from './employee-sort'
export {
  type EmployeeDetail,
  type EmployeeFilters,
  type EmployeeListItem,
  type EmployeeListRequirement,
  getEmployee,
  getEmployeeForEdit,
  listEmployees,
  type Page,
  type TeamMember,
} from './employees'
export { recordExists } from './exists'
export {
  fillDepartmentHeads,
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
  listBookableSessions,
  listDepartments,
  listEmployeeOptions,
  listPositions,
  listProviderOptions,
  listRoomOptions,
  type PersonOption,
  type RoomOption,
  type SessionOption,
} from './lookups'
export {
  checkSessionSlot,
  createRoom,
  createSession,
  type RoomWrite,
  type SessionProblem,
  type SessionWrite,
  updateRoom,
  updateSession,
} from './mutations'
export {
  type CourseCompliance,
  type DepartmentDetail,
  type DepartmentSummary,
  getDepartment,
  getPosition,
  listDepartmentSummaries,
  listPositionSummaries,
  type PositionDetail,
  type PositionSummary,
} from './org'
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
export { getSession, listSessions, type SessionWindow } from './sessions'
export {
  canSetUserRole,
  type ClerkUserSync,
  findUserByClerkId,
  getUser,
  listUsers,
  type RoleChange,
  setUserRole,
  upsertUserFromClerk,
  type UserDetail,
  type UserListItem,
  type UserRecord,
} from './users'
