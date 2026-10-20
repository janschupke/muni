# Session planner

The `/planner` page: new sessions for the training the advisor cannot place.

`/planner` proposes new sessions for training the advisor cannot place (no session of the
course ahead, or every one full), with one fixed rule (`packages/domain/src/planner/`):

- Demand is grouped by course and due date: everything already lapsed is due within two
  weeks; the rest is due the day before the first of a month's trainings lapses.
- A group needs `ceil(people ÷ seats)` sessions, earliest lapse first. A course without
  seats set fills the largest room that suits it (online: everyone at once). A course with no
  length or no provider offering it is not planned; the offer says which.
- Each offer is held by the default provider if it offers the course, else by the cheapest
  offering (ties by name), at that offering's price.
- Each session takes the first working day (weekends and Czech public holidays are not) from
  tomorrow on which a valid room is free at the course's usual start time, for its
  length. Valid: online if the course allows it, otherwise every capability the course needs
  and enough seats. Rooms the course used before come first, then the smallest that fits.
  Planned sessions and earlier offers both block a physical room; an online room is never
  taken.
- A slot after the due date is offered and marked late. Otherwise the offer says why: what
  even the best-equipped room lacks, that the equipped rooms are too small, that a session
  would end after midnight, or that no slot is free in 120 days.
- An offer is not created as it stands. **Review…** opens it for editing: day, start (the end
  follows from the course's length), provider (the course's offerings, each with its price),
  room (every room, each labelled with its seats and whether it suits the course), capacity,
  and the people to book (all ticked; untick to leave someone out). The dialog checks as
  the user types: the room taken then, a room that does not suit, fewer seats than people,
  a start that would end the session after midnight; a weekend, a holiday or a date after the due date is a warning.
  **Check** runs the real transaction on the server and undoes it (`dryRun`), answering what
  would be refused and why; the review then shows exactly what will be created and what the
  bookings cost. Only **Create session and book N people** writes, all or nothing
  (`createSessionWithBookings`): one person who cannot be booked stops the session too.
