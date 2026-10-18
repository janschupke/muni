-- Providers offer courses at a price, and hold sessions; a course owns what its sessions are.
--
-- 1. The course's own values: the app's override where one was set, else what the imports
--    derived. The derived/override pairs go.
-- 2. Offerings: every (provider, course) pair the completion history shows, at that pair's
--    latest price (0 without one).
-- 3. The default provider (holds the sessions an import names no provider for): "Interní
--    školitel" if there is one, else the provider with the most completions; created when
--    sessions exist and no provider does.
-- 4. The default offers every course that has sessions (at the course's latest session price,
--    else 0), and holds every existing session.

-- 1. Course values ------------------------------------------------------------------------
UPDATE "courses" SET
  "session_minutes" = COALESCE("session_minutes_override", "session_minutes"),
  "group_size" = COALESCE("group_size_override", "group_size"),
  "online_allowed" = COALESCE("online_allowed_override", "online_allowed");

ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "courses_session_minutes_override_check";
ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "courses_group_size_override_check";
ALTER TABLE "courses"
  DROP COLUMN "group_size_override",
  DROP COLUMN "online_allowed_override",
  DROP COLUMN "session_minutes_override";
ALTER TABLE "courses" RENAME COLUMN "group_size" TO "seats";
ALTER TABLE "courses" RENAME CONSTRAINT "courses_group_size_check" TO "courses_seats_check";

-- 2. Offerings ----------------------------------------------------------------------------
CREATE TABLE "provider_courses" (
    "provider_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "price_per_person" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_courses_pkey" PRIMARY KEY ("provider_id","course_id"),
    CONSTRAINT "provider_courses_price_check" CHECK ("price_per_person" >= 0)
);
CREATE INDEX "provider_courses_course_id_idx" ON "provider_courses"("course_id");
ALTER TABLE "provider_courses" ADD CONSTRAINT "provider_courses_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provider_courses" ADD CONSTRAINT "provider_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "provider_courses" ("provider_id", "course_id", "price_per_person", "updated_at")
SELECT DISTINCT ON (c."provider_id", c."course_id")
  c."provider_id", c."course_id", COALESCE(
    (SELECT p."price" FROM "course_completions" p
      WHERE p."provider_id" = c."provider_id" AND p."course_id" = c."course_id"
        AND p."price" IS NOT NULL AND p."archived_at" IS NULL
      ORDER BY p."completed_on" DESC, p."external_id" DESC LIMIT 1),
    0),
  CURRENT_TIMESTAMP
FROM "course_completions" c
WHERE c."provider_id" IS NOT NULL AND c."archived_at" IS NULL;

-- 3. The default provider -----------------------------------------------------------------
ALTER TABLE "providers" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "providers_default_key" ON "providers"("is_default") WHERE ("is_default" = true AND "archived_at" IS NULL);

INSERT INTO "providers" ("id", "name", "updated_at")
SELECT 'provider_default', 'Interní školitel', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "course_sessions")
  AND NOT EXISTS (SELECT 1 FROM "providers" WHERE "archived_at" IS NULL);

UPDATE "providers" SET "is_default" = true
WHERE "id" = (
  SELECT p."id" FROM "providers" p
  WHERE p."archived_at" IS NULL
  ORDER BY (lower(p."name") = lower('Interní školitel')) DESC,
    (SELECT count(*) FROM "course_completions" c WHERE c."provider_id" = p."id") DESC,
    p."name"
  LIMIT 1
);

-- 4. The default offers what has sessions, and holds them ---------------------------------
INSERT INTO "provider_courses" ("provider_id", "course_id", "price_per_person", "updated_at")
SELECT d."id", s."course_id", COALESCE(
    (SELECT x."price_per_person" FROM "course_sessions" x
      WHERE x."course_id" = s."course_id" AND x."price_per_person" IS NOT NULL
      ORDER BY x."starts_at" DESC LIMIT 1),
    0),
  CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "course_id" FROM "course_sessions") s
CROSS JOIN (SELECT "id" FROM "providers" WHERE "is_default") d
ON CONFLICT ("provider_id", "course_id") DO NOTHING;

ALTER TABLE "course_sessions" ADD COLUMN "provider_id" TEXT;
UPDATE "course_sessions" SET "provider_id" = (SELECT "id" FROM "providers" WHERE "is_default");
ALTER TABLE "course_sessions" ALTER COLUMN "provider_id" SET NOT NULL;
CREATE INDEX "course_sessions_provider_id_starts_at_idx" ON "course_sessions"("provider_id", "starts_at");
ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
