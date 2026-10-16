-- A course's session needs set in the app are marked, so sessions imports stop deriving them.
ALTER TABLE "courses" ADD COLUMN "needs_manual" BOOLEAN NOT NULL DEFAULT false;

-- An online room has no seat limit; every other room has seats.
UPDATE "rooms" SET "capacity" = NULL WHERE "kind" = 'ONLINE';
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_capacity_check";
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_capacity_check"
  CHECK (("kind" = 'ONLINE') = ("capacity" IS NULL) AND ("capacity" IS NULL OR "capacity" > 0));
