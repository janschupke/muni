// Read and write access for the web app. Every function returns plain, serialisable DTOs;
// personal fields have already been passed through the sanitisation policy for the viewer.
import 'server-only'

export { getAdvisorInput } from './advisor'
export {
  applyAssignments,
  ASSIGNMENT_FAILURES,
  listEmployeeBookings,
  MOVE_FAILURES,
  moveSeats,
  removeAssignment,
  type AssignmentFailure,
  type AssignmentOutcome,
  type AssignmentRequest,
  type EmployeeBooking,
  type MoveFailure,
} from './assignments'
export { getPolicy, type RepoOptions } from './context'
export {
  getCourse,
  getCourseForEdit,
  listCourseOptions,
  listCourses,
  type CourseDetail,
  type CourseListItem,
  type RequirementView,
  type SessionListItem,
} from './courses'
export {
  getComplianceMatrix,
  getDashboard,
  type ComplianceMatrix,
  type ComplianceMatrixPerson,
  type ComplianceMatrixRow,
  type DashboardData,
} from './dashboard'
export {
  getEmployee,
  getEmployeeForEdit,
  listEmployees,
  type EmployeeDetail,
  type EmployeeFilters,
  type EmployeeListItem,
  type EmployeeListRequirement,
  type Page,
} from './employees'
export { EMPLOYEE_SORT_KEYS, type EmployeeSortKey } from './employee-sort'
export { listDepartments, listPositions, listProviders } from './lookups'
export { createCompletion, updateCourse, updateEmployee, updateSession } from './mutations'
export { getSession, listSessions, type SessionWindow } from './sessions'
