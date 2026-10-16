// Read and write access for the web app. Every function returns plain, serialisable DTOs;
// personal fields have already been passed through the sanitisation policy for the viewer.
import 'server-only'

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
  type DashboardData,
} from './dashboard'
export {
  getEmployee,
  getEmployeeForEdit,
  listEmployees,
  type EmployeeDetail,
  type EmployeeFilters,
  type EmployeeListItem,
  type Page,
} from './employees'
export { listDepartments, listPositions, listProviders } from './lookups'
export { createCompletion, updateCourse, updateEmployee, updateSession } from './mutations'
export { getSession, listSessions, toWallClock, type SessionWindow } from './sessions'
