// Read and write access for the web app. Every function returns plain, serialisable DTOs;
// personal fields have already been passed through the sanitisation policy for the viewer.
import 'server-only'

export { getAdvisorInput } from './advisor'
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
export {
  getPersonName,
  listDepartments,
  listPositions,
  listProviderNames,
  listRoomOptions,
  type RoomOption,
} from './lookups'
export {
  createCompletion,
  createRoom,
  createSession,
  deleteRoom,
  type SessionProblem,
  type SessionWrite,
  updateCourse,
  updateEmployee,
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
  type PersonRef,
  type PositionDetail,
  type PositionSummary,
} from './org'
export { getPlannerInput } from './planner'
export {
  createProvider,
  deleteProvider,
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
export { getRoom, getRoomForEdit, listRooms, type RoomDetail, type RoomListItem } from './rooms'
export { getSession, listSessions, type SessionWindow } from './sessions'
