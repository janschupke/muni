# UI

The rules every screen follows: words, forms, writes, opened rows and layout. Colour is in [design.md](design.md).

## Glossary

One word per thing, in both locales. The message test fails on the words in the last column.

| Thing                                         | English          | Czech        | Not                     |
| --------------------------------------------- | ---------------- | ------------ | ----------------------- |
| A seat a person holds on a session            | booking          | rezervace    | přihláška               |
| A part of the organisation                    | department       | oddělení     | útvar                   |
| Who delivered a completion                    | provider         | poskytovatel | dodavatel               |
| A course a provider holds, at a price         | offering         | nabídka      | contract                |
| Where a session is held                       | room             | místnost     | location                |
| A catalogue entry (a table column naming one) | course           | kurz         | training                |
| A required course a person has valid          | held             | splněno      | valid trainings         |
| A provider's registration number              | Company ID (IČO) | IČO          | a bare "IČO" in English |
| Making a new record                           | Create …         | Vytvořit …   | Add …                   |

"Přihlásit se" is signing in, and stays.

## Forms

Forms put the page heading inside the form, with Cancel and Save on its right, and the
fields in one full-width card. Dates and times are typed or picked: `DatePicker` (a calendar
on Radix Popover, driven fully from the keyboard) and `TimePicker` (hour and minute lists),
both posting ISO dates and `HH:mm`. Forms pick records by id from selects, never by a typed
name: a new provider is named on purpose ("New provider…").

Forms check themselves as the user types, with the same reader and schema the server action
runs on save (`apps/web/src/lib/form/form-inputs.ts`), so the browser and the server cannot
disagree about what is valid:

- **When a field shows its error:** once it has been left. A required field that is emptied
  goes red at once, and after a save attempt every field shows its error. Once an error is
  showing, it updates on every keystroke.
- **Errors say what is wrong:** an email, phone, web address, birth number, course code,
  date or time each have their own message. Limits carry their number ("Enter at most 720").
- **A form with errors is not sent.** The first field with an error gets the focus, as it
  does after the server refuses a save. A server error stays on its field until that field
  changes, and a refused save keeps everything that was typed.
- **Field state for styles and tests:** each field marks whether it changed (`data-dirty`),
  was visited (`data-touched`) or is wrong (`data-invalid`).
- **Save on an edit form** stays off until something differs from what was loaded.
- **When the form opens,** the first field has the focus.
- **Placeholders** show example values (`jana.novakova@firma.cz`, `KURZ-01`, a date in the
  locale's order).
- **Checks the form makes on its own** (`clientErrors` on `FormShell`): the session form
  checks the room, seats, course and times as they change, and asks the server whether the
  room is free then; the employee form checks the position against the department and the
  lead against having one.
- **A field never changes another.** A choice at odds with another field marks every field
  that can settle it, with the same words on each, and the form is not sent until one does:
  a room too small marks the room and the seats, a room lacking what the course needs the
  room and the course, seats below the bookings the seats and the unnamed bookings, a
  department without the chosen position the department and the position (which stays
  listed, marked "not in this department").
- **Save and Cancel go back where the form was opened from,** filters included, from the
  per-tab history the back links use (`useOrigin`). A form opened directly (typed,
  bookmarked, reloaded, a new tab) has no origin: a save goes to the record, Cancel to its
  parent. Archiving from a record's page does the same, falling back to its list.

## Writes: confirmations and toasts

Every write says how it went, in a toast at the bottom right (`apps/web/src/components/shell/toasts.tsx`, Radix
Toast): "Course created", "Booked 3 people", "Booking cancelled". Toasts live in the root
layout, so a save that goes on to the record still shows on the page it lands on; a failure
stays until it is closed, the rest leave after six seconds. A form's button says what it does
("Schedule session", "Record completion", "Save changes"), never just "Save".

A write asks first (`apps/web/src/components/feedback/confirm-dialog.tsx`) when it cannot be undone, touches many
records, costs money or does more than its button shows: cancelling a booking, changing a role
(with what the new role can do, and what an admin loses), archiving and bringing back,
cancelling or reinstating a session, moving its bookings to another course (from the edit form), booking from
the advisor, resolving overbooking and creating from the planner. The dialog says exactly what
will change; its confirm button names the act and the other one keeps things as they are. A
refusal shows in the dialog, which stays open; a partial result lists what was refused.

## Opened rows

A table row that opens shows its details as panels (`DetailGrid`, `DetailPanel` in the UI kit),
each with a heading and its count: a session's facts (when, the room against what the course
needs, the seats by name and without, the price, the status) beside the people booked on it
with their department, position and how they were booked; a course's planned sessions, what a
session needs and compliance by department; a person's required trainings; a department's or
position's people; a planner offer's people and the other rooms free then.

## Layout

A top bar at every width carries the logo and name, the language and theme switches and the
account. From `lg` (1024px) the navigation is a sidebar below it, in groups (Register,
Training, Planning); it collapses to an icon rail with tooltips, and the choice is a cookie
the server reads, so the first paint is right. Below `lg` the bar's menu opens the same
navigation in a drawer, which closes on any route change and when the screen widens to `lg`.
On a phone the bar keeps the logo without the name. Content runs full width up to 1920px
(`max-w-page`). Tooltips are
Radix (`Tooltip`, `IconButton`); a lint rule bans native `title` attributes on DOM elements
(an iframe's stays: it names the frame) and on the components that pass them through.

Errors: `error.tsx` logs the error, shows its digest as a reference and retries with fresh
data; `global-error.tsx` draws its own page when the root layout fails. Every record route
has its own not-found page naming the missing record.

The compliance matrix opens each department into one row per person, under the course
columns, and each cell into a dialog listing its people, most urgent first. The department
and position lists open each row to its people's records: position or department,
employment, the share held, and every training that needs attention with its booking, or the
way to book it. Their "Upcoming bookings" count links to the bookings it counts
(`/departments/[id]/bookings`, `/positions/[id]/bookings`): its people's named bookings on
sessions still ahead, a page at a time.

A detail page has its facts card beside the main section (`SplitLayout`). Long tables follow it
at full width: the people of a department or position, a course's sessions and completions,
a room's course fit, a provider's latest completions.

Motion is centralised in `packages/ui/src/styles/tokens.css`: three durations, the easings,
the named animations (`animate-fade-in`, `animate-pop-in`, …), and the default for every
`transition-*` utility. `prefers-reduced-motion: reduce` turns all of it off in one rule.

Every session has a public page (`/sessions/T016`) with its seats and who is booked by name,
and every room links to the sessions held there (`/sessions?room=<room id>`).

Providers (`/providers`) list who holds sessions and who delivered the completions on record:

- **Each provider shows:** its IČO, its completions, people and courses, what was spent and the last completion.
- **Its page adds:** contact details, whether it is the default for imported sessions, the
  courses it offers (price, sessions ahead, a Schedule button that opens the session form
  with the provider chosen), its upcoming sessions, and its completions by course, each a page
  at a time; the employee's completion history links to it.
- **Offerings:** edited on the provider form as rows (course, price per person), each course
  once. Dropping a course its upcoming sessions use is refused with their number. A new price
  reaches sessions scheduled from then on.
- **Scheduling, the same everywhere:** the course list's rows, the course page, a room's
  course fit and a provider's offerings each have one Schedule button. It opens the course's
  session form with what the place knows (the room, the provider), or is disabled and says why:
  the course has no length, no provider offers it, or the room does not suit it.
- **Records:** imports create a provider by name (matched ignoring case and accents); the completion form picks one, or names a new one on purpose and is refused if that name is taken. Its details (IČO with its check digit, email, phone, website, note) are entered in the app, and imports leave them alone.
- **Rename and archive:** renaming changes the name on every completion. An archived provider stays on its completions, shown muted.
- **Prices:** the spend follows the `completion.price` policy. A viewer who may not see prices sees no sums of them either.

Back links ("← Employees") name the page the visitor actually came from, filters included,
from a per-tab history in `sessionStorage`; forms are skipped, and a page opened directly
links to its parent list. Forms go back the same way after saving (see Forms).
