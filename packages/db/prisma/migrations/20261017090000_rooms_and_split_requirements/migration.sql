-- Rooms become an entity (sessions point at one), course requirements split into one table
-- per audience, and courses gain what a session needs. Existing rows are carried over.

-- CreateEnum
CREATE TYPE "RoomKind" AS ENUM ('CLASSROOM', 'LAB', 'ONLINE', 'EXTERNAL', 'OUTDOOR');

-- CreateEnum
CREATE TYPE "Capability" AS ENUM ('PROJECTOR', 'COMPUTERS', 'LAB_EQUIPMENT', 'VEHICLE', 'PRACTICAL_AREA', 'VIDEO_CONFERENCE', 'WHEELCHAIR_ACCESS');

-- ---- Rooms ------------------------------------------------------------------------------

CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "RoomKind" NOT NULL,
    "capacity" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rooms_capacity_check" CHECK ("capacity" IS NULL OR "capacity" >= 0)
);

CREATE UNIQUE INDEX "rooms_name_key" ON "rooms"("name");

CREATE TABLE "room_capabilities" (
    "room_id" TEXT NOT NULL,
    "capability" "Capability" NOT NULL,

    CONSTRAINT "room_capabilities_pkey" PRIMARY KEY ("room_id","capability")
);

ALTER TABLE "room_capabilities" ADD CONSTRAINT "room_capabilities_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One room per distinct session location: online if any session there was, sized by the
-- largest session held there.
INSERT INTO "rooms" ("id", "name", "kind", "capacity", "updated_at")
SELECT 'room_' || md5("location"),
       "location",
       CASE WHEN bool_or("is_online") THEN 'ONLINE'::"RoomKind" ELSE 'CLASSROOM'::"RoomKind" END,
       max("capacity"),
       CURRENT_TIMESTAMP
FROM "course_sessions"
GROUP BY "location";

ALTER TABLE "course_sessions" ADD COLUMN "room_id" TEXT;
UPDATE "course_sessions" s SET "room_id" = r."id" FROM "rooms" r WHERE r."name" = s."location";
ALTER TABLE "course_sessions" ALTER COLUMN "room_id" SET NOT NULL;
ALTER TABLE "course_sessions" DROP COLUMN "is_online", DROP COLUMN "location";

CREATE INDEX "course_sessions_room_id_starts_at_idx" ON "course_sessions"("room_id", "starts_at");
ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- Course audience --------------------------------------------------------------------

ALTER TABLE "courses" ADD COLUMN "group_size" INTEGER,
ADD COLUMN "online_allowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "required_for_all" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "session_minutes" INTEGER,
ADD CONSTRAINT "courses_group_size_check" CHECK ("group_size" IS NULL OR "group_size" > 0),
ADD CONSTRAINT "courses_session_minutes_check" CHECK ("session_minutes" IS NULL OR "session_minutes" > 0);

CREATE TABLE "course_department_requirements" (
    "course_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,

    CONSTRAINT "course_department_requirements_pkey" PRIMARY KEY ("course_id","department_id")
);

CREATE TABLE "course_position_requirements" (
    "course_id" TEXT NOT NULL,
    "position_id" TEXT NOT NULL,

    CONSTRAINT "course_position_requirements_pkey" PRIMARY KEY ("course_id","position_id")
);

CREATE INDEX "course_department_requirements_department_id_idx" ON "course_department_requirements"("department_id");
CREATE INDEX "course_position_requirements_position_id_idx" ON "course_position_requirements"("position_id");

ALTER TABLE "course_department_requirements" ADD CONSTRAINT "course_department_requirements_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_department_requirements" ADD CONSTRAINT "course_department_requirements_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_position_requirements" ADD CONSTRAINT "course_position_requirements_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_position_requirements" ADD CONSTRAINT "course_position_requirements_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "courses" c SET "required_for_all" = true
WHERE EXISTS (SELECT 1 FROM "course_requirements" q WHERE q."course_id" = c."id" AND q."scope" = 'ALL');

INSERT INTO "course_department_requirements" ("course_id", "department_id")
SELECT DISTINCT "course_id", "department_id" FROM "course_requirements"
WHERE "scope" = 'DEPARTMENT' AND "department_id" IS NOT NULL;

INSERT INTO "course_position_requirements" ("course_id", "position_id")
SELECT DISTINCT "course_id", "position_id" FROM "course_requirements"
WHERE "scope" = 'POSITION' AND "position_id" IS NOT NULL;

DROP TABLE "course_requirements";
DROP TYPE "RequirementScope";

-- ---- What a session of each course needs -------------------------------------------------

CREATE TABLE "course_capabilities" (
    "course_id" TEXT NOT NULL,
    "capability" "Capability" NOT NULL,

    CONSTRAINT "course_capabilities_pkey" PRIMARY KEY ("course_id","capability")
);

ALTER TABLE "course_capabilities" ADD CONSTRAINT "course_capabilities_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Derived from the sessions held so far: the usual length, the median group, online or not.
UPDATE "courses" c SET
  "session_minutes" = d."minutes",
  "group_size" = d."size",
  "online_allowed" = d."online"
FROM (
  SELECT s."course_id",
         mode() WITHIN GROUP (ORDER BY (EXTRACT(EPOCH FROM s."ends_at" - s."starts_at") / 60)::int) AS "minutes",
         (percentile_disc(0.5) WITHIN GROUP (ORDER BY s."capacity")) AS "size",
         bool_or(r."kind" = 'ONLINE') AS "online"
  FROM "course_sessions" s JOIN "rooms" r ON r."id" = s."room_id"
  WHERE s."status" = 'PLANNED' AND s."capacity" > 0
  GROUP BY s."course_id"
) d
WHERE d."course_id" = c."id";
