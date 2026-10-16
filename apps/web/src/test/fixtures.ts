import type {
  ComplianceMatrix,
  CourseDetail,
  CourseListItem,
  DashboardData,
  EmployeeBooking,
  EmployeeDetail,
  EmployeeListItem,
  EmployeeListRequirement,
  Page,
  RoomDetail,
  RoomListItem,
  SessionListItem,
} from '@muni/db/repositories'
import type { getCourseForEdit } from '@muni/db/repositories'
import type { AdvisorInput } from '@muni/domain/advisor'
import type { RoomRef } from '@muni/domain/rooms'
import type { ComplianceCounts } from '@muni/domain/compliance'

// Typed builders for repository results, shaped like the seeded register (asOf 2026-10-16).
// Each takes overrides, so a test states only what it is about.

const AS_OF = '2026-10-16'

export const AULA_A: RoomRef = { id: 'room_aula_a', name: 'Aula A', kind: 'CLASSROOM' }
export const ONLINE: RoomRef = { id: 'room_online', name: 'Online', kind: 'ONLINE' }

export const counts = (c: Partial<ComplianceCounts> = {}): ComplianceCounts => {
  const base = { VALID: 6, EXPIRING: 1, EXPIRED: 1, MISSING: 2, ...c }
  return { ...base, total: base.VALID + base.EXPIRING + base.EXPIRED + base.MISSING }
}

export const session = (over: Partial<SessionListItem> = {}): SessionListItem => ({
  externalId: 'T016',
  courseCode: 'BOZP-Z',
  courseName: 'BOZP – základní školení',
  startsAt: '2026-11-04T07:00:00.000Z',
  endsAt: '2026-11-04T10:00:00.000Z',
  room: AULA_A,
  capacity: 30,
  unnamedBookings: 29,
  assigned: [{ externalId: 'E0153', name: 'Černá Marie' }],
  bookedCount: 30,
  pricePerPerson: 450,
  status: 'PLANNED',
  ...over,
})

export const employeeRow = (over: Partial<EmployeeListItem> = {}): EmployeeListItem => ({
  externalId: 'E0153',
  firstName: 'Marie',
  lastName: 'Černá',
  department: 'Laboratoře',
  position: 'Laborantka',
  status: 'ACTIVE',
  compliance: 'EXPIRED',
  counts: counts({ VALID: 2, EXPIRING: 0, EXPIRED: 1, MISSING: 0 }),
  requirements: [
    {
      courseCode: 'BOZP-Z',
      courseName: 'BOZP – základní školení',
      status: 'EXPIRED',
      completedOn: '2024-09-01',
      validUntil: '2026-09-01',
      daysLeft: -45,
      booked: { sessionExternalId: 'T016', startsAt: '2026-11-04T07:00:00.000Z' },
    },
    {
      courseCode: 'GDPR',
      courseName: 'Ochrana osobních údajů',
      status: 'VALID',
      completedOn: '2025-11-05',
      validUntil: '2027-11-05',
      daysLeft: 385,
      booked: null,
    },
    {
      courseCode: 'LEAD',
      courseName: 'Základy vedení lidí',
      status: 'VALID',
      completedOn: '2020-01-01',
      validUntil: null,
      daysLeft: null,
      booked: null,
    },
  ],
  ...over,
})

export const employeePage = (
  items: EmployeeListItem[] = [employeeRow()],
  over: Partial<Page<EmployeeListItem>> = {}
): Page<EmployeeListItem> => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 25,
  pageCount: 1,
  ...over,
})

export const employeeDetail = (over: Partial<EmployeeDetail> = {}): EmployeeDetail => ({
  externalId: 'E0153',
  firstName: 'Marie',
  lastName: 'Černá',
  email: 'm••••••••••@vzorova.example',
  department: 'Laboratoře',
  position: 'Laborantka',
  manager: { externalId: 'E0001', name: 'Tereza Urbanová' },
  hiredOn: '2019-03-01',
  leftOn: null,
  status: 'ACTIVE',
  requirements: [
    {
      courseCode: 'BOZP-Z',
      courseName: 'BOZP – základní školení',
      status: 'EXPIRED',
      completedOn: '2024-09-01',
      validUntil: '2026-09-01',
    },
    {
      courseCode: 'GDPR',
      courseName: 'Ochrana osobních údajů',
      status: 'VALID',
      completedOn: '2025-11-05',
      validUntil: '2027-11-05',
    },
  ],
  completionRate: 0.5,
  completions: [
    {
      externalId: 'Z000101',
      courseCode: 'GDPR',
      courseName: 'Ochrana osobních údajů',
      completedOn: '2025-11-05',
      validUntil: '2027-11-05',
      provider: 'Bezpečná firma s.r.o.',
    },
  ],
  ...over,
})

export const booking = (over: Partial<EmployeeBooking> = {}): EmployeeBooking => ({
  sessionExternalId: 'T018',
  courseCode: 'BOZP-Z',
  courseName: 'BOZP – základní školení',
  startsAt: '2027-02-03T07:00:00.000Z',
  endsAt: '2027-02-03T10:00:00.000Z',
  room: AULA_A,
  source: 'ADVISOR',
  ...over,
})

export const courseRow = (over: Partial<CourseListItem> = {}): CourseListItem => ({
  code: 'BOZP-Z',
  name: 'BOZP – základní školení',
  validityMonths: 24,
  requirements: [{ scope: 'ALL', target: null, targetId: null }],
  completionCount: 412,
  upcomingSessions: 2,
  counts: counts(),
  rate: 0.7,
  ...over,
})

export const courseDetail = (over: Partial<CourseDetail> = {}): CourseDetail => ({
  ...courseRow(),
  requirements: [
    { scope: 'ALL', target: null, targetId: null },
    { scope: 'DEPARTMENT', target: 'Laboratoře', targetId: 'dep_lab' },
    { scope: 'POSITION', target: 'Vedoucí oddělení', targetId: 'pos_head' },
  ],
  sessions: [session(), session({ externalId: 'T017', status: 'CANCELLED', assigned: [] })],
  recentCompletions: [
    {
      externalId: 'Z000101',
      employeeExternalId: 'E0153',
      employeeName: 'Černá Marie',
      completedOn: '2024-09-01',
      validUntil: '2026-09-01',
    },
  ],
  ...over,
})

export const dashboard = (over: Partial<DashboardData> = {}): DashboardData => ({
  asOf: AS_OF,
  expiringWithinDays: 30,
  activeEmployees: 160,
  parentalLeave: 6,
  counts: counts({ VALID: 500, EXPIRING: 47, EXPIRED: 30, MISSING: 65 }),
  people: { EXPIRING: 40, EXPIRED: 25, MISSING: 50 },
  rate: 0.85,
  byDepartment: [
    { department: 'Laboratoře', rate: 0.72, counts: counts() },
    { department: 'Knihovna', rate: 0.95, counts: counts({ MISSING: 0, EXPIRED: 0 }) },
  ],
  upcomingSessions: [session()],
  ...over,
})

const requirement = (over: Partial<EmployeeListRequirement> = {}): EmployeeListRequirement => ({
  courseCode: 'BOZP-Z',
  courseName: 'BOZP – základní školení',
  status: 'VALID',
  completedOn: '2025-05-01',
  validUntil: '2027-05-01',
  daysLeft: 197,
  booked: null,
  ...over,
})

const LAB_BEZ = { courseCode: 'LAB-BEZ', courseName: 'Bezpečná práce v laboratoři' }

export const matrix = (over: Partial<ComplianceMatrix> = {}): ComplianceMatrix => ({
  asOf: AS_OF,
  courses: [
    { code: 'BOZP-Z', name: 'BOZP – základní školení' },
    { code: 'LAB-BEZ', name: 'Bezpečná práce v laboratoři' },
  ],
  rows: [
    {
      department: 'Laboratoře',
      headcount: 3,
      cells: {
        'BOZP-Z': {
          counts: counts({ VALID: 1, EXPIRING: 1, EXPIRED: 1, MISSING: 0 }),
          rate: 2 / 3,
        },
        'LAB-BEZ': { counts: counts({ VALID: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 2 }), rate: 0 },
      },
      people: [
        {
          externalId: 'E0002',
          name: 'Adámek Petr',
          position: 'Laborant',
          cells: {
            'BOZP-Z': requirement(),
            'LAB-BEZ': requirement({
              ...LAB_BEZ,
              status: 'MISSING',
              completedOn: null,
              validUntil: null,
              daysLeft: null,
            }),
          },
        },
        {
          externalId: 'E0153',
          name: 'Černá Marie',
          position: 'Laborantka',
          cells: {
            'BOZP-Z': requirement({
              status: 'EXPIRED',
              completedOn: '2024-09-01',
              validUntil: '2026-09-01',
              daysLeft: -45,
              booked: { sessionExternalId: 'T016', startsAt: '2026-11-04T07:00:00.000Z' },
            }),
            'LAB-BEZ': requirement({
              ...LAB_BEZ,
              status: 'MISSING',
              completedOn: null,
              validUntil: null,
              daysLeft: null,
            }),
          },
        },
        {
          externalId: 'E0160',
          name: 'Dvořák Tomáš',
          position: null,
          cells: {
            'BOZP-Z': requirement({
              status: 'EXPIRING',
              completedOn: '2024-11-01',
              validUntil: '2026-11-01',
              daysLeft: 16,
            }),
            'LAB-BEZ': null,
          },
        },
      ],
    },
    {
      department: 'Knihovna',
      headcount: 1,
      cells: {
        'BOZP-Z': { counts: counts({ VALID: 1, EXPIRING: 0, EXPIRED: 0, MISSING: 0 }), rate: 1 },
        'LAB-BEZ': null,
      },
      people: [
        {
          externalId: 'E0007',
          name: 'Novák Jan',
          position: 'Knihovník',
          cells: {
            'BOZP-Z': requirement({ validUntil: null, daysLeft: null }),
            'LAB-BEZ': null,
          },
        },
      ],
    },
  ],
  ...over,
})

export const advisorInput = (over: Partial<AdvisorInput> = {}): AdvisorInput => ({
  asOf: AS_OF,
  needs: [
    {
      employee: {
        externalId: 'E0153',
        name: 'Černá Marie',
        department: 'Laboratoře',
        status: 'ACTIVE',
      },
      course: { code: 'BOZP-Z', name: 'BOZP – základní školení' },
      status: 'EXPIRED',
      validUntil: '2026-09-01',
    },
    {
      employee: {
        externalId: 'E0002',
        name: 'Adámek Petr',
        department: 'Knihovna',
        status: 'ACTIVE',
      },
      course: { code: 'POZ-OCH', name: 'Požární ochrana' },
      status: 'MISSING',
      validUntil: null,
    },
  ],
  sessions: [
    {
      externalId: 'T016',
      courseCode: 'BOZP-Z',
      courseName: 'BOZP – základní školení',
      room: AULA_A,
      startsAt: '2026-11-04T07:00:00.000Z',
      endsAt: '2026-11-04T10:00:00.000Z',
      capacity: 30,
      unnamedBookings: 31,
      assigned: [],
      pricePerPerson: 450,
      status: 'PLANNED',
    },
    {
      externalId: 'T018',
      courseCode: 'BOZP-Z',
      courseName: 'BOZP – základní školení',
      room: AULA_A,
      startsAt: '2027-02-03T07:00:00.000Z',
      endsAt: '2027-02-03T10:00:00.000Z',
      capacity: 30,
      unnamedBookings: 0,
      assigned: [],
      pricePerPerson: 450,
      status: 'PLANNED',
    },
  ],
  ...over,
})

/** What the course edit loader returns for BOZP-Z. */
export const courseForEdit = (over: Partial<CourseForEdit> = {}): CourseForEdit => ({
  code: 'BOZP-Z',
  name: 'BOZP – základní školení',
  validityMonths: 24,
  sessionMinutes: 180,
  groupSize: 30,
  onlineAllowed: false,
  capabilities: [],
  ...over,
})
type CourseForEdit = NonNullable<Awaited<ReturnType<typeof getCourseForEdit>>>

export const roomRow = (over: Partial<RoomListItem> = {}): RoomListItem => ({
  ...AULA_A,
  capacity: 40,
  capabilities: ['PROJECTOR', 'WHEELCHAIR_ACCESS'],
  upcomingSessions: 3,
  utilisation: 0.25,
  ...over,
})

export const roomDetail = (over: Partial<RoomDetail> = {}): RoomDetail => ({
  ...roomRow(),
  note: 'Přízemí, vchod B',
  upcoming: [session()],
  pastCount: 4,
  courses: [
    { code: 'BOZP-Z', name: 'BOZP – základní školení', groupSize: 30, mismatch: null },
    {
      code: 'LAB-BEZ',
      name: 'Bezpečná práce v laboratoři',
      groupSize: 20,
      mismatch: { kind: 'MISSING_CAPABILITIES', missing: ['LAB_EQUIPMENT'] },
    },
    {
      code: 'GDPR',
      name: 'Ochrana osobních údajů',
      groupSize: 100,
      mismatch: { kind: 'TOO_SMALL', capacity: 40 },
    },
    {
      code: 'KYBER',
      name: 'Kybernetická bezpečnost',
      groupSize: 30,
      mismatch: { kind: 'ONLINE_NOT_ALLOWED' },
    },
  ],
  ...over,
})
