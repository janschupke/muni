# UI

The web app is server-guarded pages over client views reading through TanStack Query, built
from `@muni/ui`. Deep reference: [README § UI](../../README.md#ui).

## Rules

- **A field never changes another field.** A conflict marks every field that can settle it, with
  the same words, and the form is not sent until one does.
- **Worked-out values are not inputs.** A value the form derives (a session's end, its price) is
  a `FieldValue` (`<output>`), never a read-only `<input>`.
- **Save and Cancel go back where the form was opened from** (`useOrigin`); opened directly, a
  save goes to the record and Cancel to its parent.
- **Every write names its act, asks when it cannot be undone or does more than it shows, and
  toasts the outcome.** `ConfirmDialog` bodies say exactly what will change; a refusal stays in
  the open dialog.
- **One way to do a thing, everywhere.** Booking is one Book… dialog (`features/bookings`);
  scheduling is one `ScheduleSessionButton`; a session's bookings are one `SessionBookings`
  block on its page and in its opened row. An opened row shows the same block, with the same
  actions, as the matching section of the record's page.
- **An unavailable action stays in place, dimmed, and says why** (`UnavailableButton`), never a
  bare dash. Playwright treats `aria-disabled` as disabled: press it from the keyboard.
- **Buttons:** one primary per group, last; the rest secondary; ghost only for a way back
  (`CancelButton`); every destructive act is red.
- **Links** are `TextLink`, underlined on hover only, never inside a sentence.
- **Every list pages and sorts on the server** (`pageOf`, `listInput`, `parseList`,
  `useListUrl`); a table that holds every row says why (`paging={{ local: '…' }}`).
- **Tables on a record's page that need width go full width** below the split, without the
  column every row would repeat (`showRoom`, `showProvider`).
- **Navigate after a write from an effect** (`useWhenWritten`), never inside the action.
- **A route file cannot call a function from a `'use client'` module**; keep factories in a
  plain module.
- **Look at it.** A UI change is checked in the rendered app, both themes, before it is done.
