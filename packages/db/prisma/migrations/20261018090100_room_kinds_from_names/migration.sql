-- Rooms the previous migration derived from session places (ids 'room_' || md5) became
-- classrooms unless online. Give them the kind their name implies, as imports now do
-- (roomKindOfName in @muni/domain/rooms; its words, with and without diacritics).
UPDATE "rooms" SET "kind" = 'LAB'
  WHERE "id" LIKE 'room\_%' AND lower("name") ~ '\m(laboratoř|laborator|lab)\M';
UPDATE "rooms" SET "kind" = 'EXTERNAL'
  WHERE "id" LIKE 'room\_%' AND lower("name") ~ '\m(externí|externi|external)\M';
UPDATE "rooms" SET "kind" = 'OUTDOOR'
  WHERE "id" LIKE 'room\_%' AND lower("name") ~ '\m(venkovní|venkovni|venku|outdoor)\M';
