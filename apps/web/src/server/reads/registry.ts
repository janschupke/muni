import 'server-only'

import type * as z from 'zod'

import { archivedList, archivedRecord } from './archive'
import { course, courseForm, coursesList } from './courses'
import { completionForm, employee, employeeForm, employeesList } from './employees'
import {
  department,
  departmentForm,
  departmentsList,
  groupBookings,
  groupMembers,
  position,
  positionForm,
  positionsList,
} from './org'
import {
  provider,
  providerForm,
  providersList,
  room,
  roomForm,
  roomsList,
  user,
  usersList,
} from './places'
import {
  advisor,
  bookingChoices,
  compliance,
  dashboard,
  importReference,
  planner,
} from './planning'
import { session, sessionCandidates, sessionForm, sessionsList } from './sessions'

/** Every read a page can make, by the name in its address (`/api/read/<name>`). */
export const reads = {
  'employees-list': employeesList,
  employee,
  'employee-form': employeeForm,
  'completion-form': completionForm,
  'courses-list': coursesList,
  course,
  'course-form': courseForm,
  'sessions-list': sessionsList,
  session,
  'session-form': sessionForm,
  'session-candidates': sessionCandidates,
  'departments-list': departmentsList,
  'positions-list': positionsList,
  'group-members': groupMembers,
  'group-bookings': groupBookings,
  department,
  position,
  'department-form': departmentForm,
  'position-form': positionForm,
  'providers-list': providersList,
  provider,
  'provider-form': providerForm,
  'rooms-list': roomsList,
  room,
  'room-form': roomForm,
  'users-list': usersList,
  user,
  dashboard,
  advisor,
  'booking-choices': bookingChoices,
  planner,
  compliance,
  'import-reference': importReference,
  'archived-list': archivedList,
  'archived-record': archivedRecord,
}

type Reads = typeof reads
export type ReadName = keyof Reads
/** What a read takes, as its page passes it (and its address carries it). */
export type ReadInput<N extends ReadName> = z.input<Reads[N]['input']>
/** What a read answers with, when the record is there. */
export type ReadOutput<N extends ReadName> = NonNullable<Awaited<ReturnType<Reads[N]['load']>>>
