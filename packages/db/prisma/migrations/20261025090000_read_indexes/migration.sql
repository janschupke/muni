-- Indexes for what every page reads: the signed-in user by Clerk ID (archived rows too),
-- a manager's reports, and upcoming sessions (planned, not yet ended).
-- CreateIndex
CREATE INDEX "course_sessions_status_ends_at_idx" ON "course_sessions"("status", "ends_at");

-- CreateIndex
CREATE INDEX "employees_manager_id_idx" ON "employees"("manager_id");

-- CreateIndex
CREATE INDEX "users_clerk_id_idx" ON "users"("clerk_id");

