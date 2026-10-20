# Data model

The schema (`packages/db/prisma/schema.prisma`), the rules the database and the server enforce, and archiving.

## Models

`Department`, `Position`, `Employee` (with a manager self-relation), `Course`,
`CourseSession`, `CourseCompletion`, `Provider` (a name plus IČO and contact details),
`ProviderCourse` (an offering), `Room` and `User` (mirrored from Clerk, see [access](features/access.md)), all
normalised:

- **Who must hold a course:** `Course.requiredForAll`, plus one link table per audience
  (`course_department_requirements`, `course_position_requirements`). No flag and no links
  means optional.
- **Rooms:** a session points at a `Room` (kind: classroom, lab, online, external, outdoor;
  seats; note). What a room offers and what a course needs are link tables of one
  `Capability` enum (projector, computers, lab equipment, vehicle, practice area, video
  conferencing, wheelchair access). "Online" is the room's kind, not a session flag; an
  online room has no seat limit and every other room has seats (a CHECK). A room's
  utilisation is its booked hours over the next 30 days from tomorrow, against Czech working
  days (weekends and public holidays, Easter included, are out) of 8 hours.
- **Room fit:** `roomFit` in `@muni/domain/rooms` is the one judgement of whether a room can
  hold a session of a course, and the planner, the server checks and the room page all use it.
  - **A physical room:** the result sets each need beside what the room provides (seats needed
    against seats there, each needed piece of equipment held or lacking), then the first reason
    it fails, in numbers ("Needs 100 seats, has 40").
  - **An online room:** judged only on whether the course may be held online.
- **What a course's sessions are:** `Course.sessionMinutes` (the length; none set, nothing
  can be scheduled), `seats` (what a new session opens; a session sets its own `capacity`),
  `onlineAllowed` and its equipment, one value each, set on the course form. An import
  fills them only where they are still unset (the first import of a course's sessions: usual
  length, median seats, online if ever held online) and never overwrites them.
- **Offerings:** `provider_courses` says which provider offers which course, at a price per
  person (CHECK ≥ 0; 0 for internal training), edited as rows on the provider form. An
  offering upcoming sessions of the provider still use cannot be dropped. One active provider
  is the **default** (a partial unique index): imported sessions that name no provider go to
  it, and it cannot be archived. A provider with sessions ahead cannot be archived either.
- **A session derives from its course and provider:** it is held by a provider
  (`CourseSession.providerId`, required) that offers its course; it ends its course's length
  after it starts (`sessionEnd`); its price is the offering's, copied when it is scheduled or
  its course or provider changes, so later price changes reach new sessions only. Imported
  sessions keep their exported times and price until moved or given another course or
  provider. The form shows the end and the price; it never types them.
- **Sessions** are checked on the server, under the sessions lock and the session's row lock:
  the provider must offer the course and the course must have a length, the room must suit
  the course (online allowed, its equipment, a seat for every place the session opens), no
  other planned session may hold it then (online rooms never clash), and the seats never drop
  below the bookings (unnamed plus named). `sessionIssues` in
  `@muni/domain/sessions` holds the rules, and the session form runs it as the user types.
  A room or course edit that would leave upcoming sessions unfit is refused with the count.
- **Positions and departments:** a position is a title shared by departments ("Vedoucí" in
  every one), so `department_positions` lists the departments each position exists in, and a
  person's (department, position) pair must be one of them (a composite foreign key).
  Imports add the pairs their rows hold; the position form edits them, and refuses to drop a
  department where people still hold the position.
- **Department heads:** `Employee.leadsDepartment`, unique per department among active
  people (a partial index) and only for someone in one (a CHECK). Set on the department's
  form or the person's; moving or archiving the head leaves the department without one.
  Heads were filled once from the reporting lines (`fillDepartmentHeads`, which the seed
  runs too).
- **Leaving is a date:** `EmploymentStatus` is `ACTIVE` or `PARENTAL_LEAVE`; someone has
  left from their `leftOn` on (`stillEmployed`, `employmentState`), and stops counting then.
- **CHECKs** keep single-row rules whatever writes: sessions end after they start, nobody
  leaves before they were hired or manages themselves, validity never ends before the
  completion, prices (sessions', completions', offerings') are not negative, validity,
  lengths and seats are positive.
- **Names** of departments, positions, providers and rooms are `citext`: unique whatever the
  case. Imports match them ignoring case and accents too.

Source IDs (`E0001`,
`T001`, `Z000001`) are kept as `externalId`, and imports upsert on them, so re-importing a file
updates records instead of duplicating them. Records created in the app get their own prefix
(`S001` sessions, `A…` completions, `N0001` people), which imports refuse (`RESERVED_ID`), so
an export can never overwrite them. Date-only values are Postgres `date` columns;
session times are `timestamptz` converted from Europe/Prague wall-clock time.

Bookings: a session's seats are `unnamedBookings` (anonymous seats from the export) plus
`SessionAssignment` rows (a named person on a session, with FKs to both and to the `User` who
booked it). Only what a person needs is booked: a training required of them that they do not
hold, lapsed or lapsing soon, with nothing booked (`bookingState`). Admins book from every place
such a training shows, always through one **Book…** dialog that lists each training with the
session proposed for it (the advisor's plan) and up to five alternatives to choose from: the
advisor's two tables, a person's required trainings, the people of the employee list and of a
department or position (each person, or each training of an opened row), and a compliance
matrix cell (each person, or all who need it). Where a training needs booking but cannot be
booked (the person is on leave, no session of the course is scheduled, or every one is full),
**Book…** stays in its place, dimmed, and says why on hover and focus. Booked, the row shows
when and where, and the way to cancel the booking, in the same column. A session's page offers
only the people who need its course. The booked total is always derived, never stored twice. Saving a booking
locks the session row (`SELECT … FOR UPDATE`) and re-checks seats, status, clashes and need,
so two people can never take the last seat and nobody is booked on a training that is not
required of them or that they hold past the advisor's forecast.
`capacity >= 0` and `unnamed_bookings >= 0` are CHECK constraints in the migration SQL.
Re-importing a session stores `max(0, exported total − named bookings)` as unnamed seats.

Compliance is derived, not stored: for each active employee and each course a requirement
applies to, the best completion decides `VALID`, `EXPIRING` (within `MUNI_EXPIRING_DAYS`,
default 30), `EXPIRED` or `MISSING` (`packages/domain/src/compliance.ts`).

## Archiving

Nothing that carries history is deleted. Employees, courses, sessions, completions,
departments, positions, rooms, providers and users are **archived** (`archived_at`,
`archived_by_id`); only bookings and the join rows (requirements, equipment) are deleted. Every
foreign key is `ON DELETE RESTRICT`, and a lint rule in `@muni/db` refuses any other delete.

- **Hidden, not gone:** archived records leave every list, count, compliance rate, the advisor
  and the planner. Records that still point to one (a past session's room, a completion's
  provider) show it muted and unlinked.
- **People are anonymised:** an archived employee or user appears as "Archived employee
  #a1b2c3" everywhere, to every role. Only an admin opening that record's archived page sees
  who it was. `packages/db/src/integration/archive.integration.test.ts` reads every repository as each role and finds no
  name, email or ID of an archived person.
- **Unique keys are free again:** names, codes, source IDs, emails, IČO and Clerk IDs are
  unique among active rows only (partial indexes, `WHERE archived_at IS NULL`), so a new
  record can take an archived one's name. Bringing the old one back is then refused, as it
  is while something it belongs to is archived.
- **What may be archived:** a person's bookings on sessions ahead go with them (the dialog
  says how many). A course or room with sessions ahead, or a department or position with
  people in it, is refused, with the count. A session still to start is **cancelled**, not
  archived (its page and row offer Cancel in Archive's place; its bookings stay as the record
  of who was to come, and those people need a session again); once cancelled or over it can be
  archived. A cancelled session still to start can be reinstated if its room and people are
  still free then. The edit form never changes a session's status. An admin cannot
  archive themselves or the last admin.
- **Imports** never revive an archived record or create an active twin of one: a row whose
  ID, code or name (or anything it refers to) only an archived record holds is skipped
  (`ARCHIVED`). The browser sends its files' keys and the server answers with the archived
  ones only.

Admins reach each kind's archived records from its list (`/rooms/archived`, …) and bring
them back from there.
