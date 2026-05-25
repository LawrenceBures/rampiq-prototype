# RampIQ Phase 2 — Migration Failure & Recovery

**Date**: 2026-05-25
**Incident**: Lifecycle tables migration silent rollback
**Resolution**: Idempotent safe migration applied successfully
**Status**: Resolved — all tables verified in production

---

## 1. What Failed

The Phase 2 lifecycle migration (`20260525100000_lifecycle_tables.sql`) was executed via the Supabase SQL Editor. The editor reported success. However, when the application attempted to read from `rampiq_incidents` and `rampiq_recovery_actions`, both tables did not exist.

**Observed state after "successful" migration:**

| Table | Expected | Actual |
|-------|----------|--------|
| `rampiq_events` | Exists | Exists (unaffected — created in prior migration) |
| `rampiq_incidents` | Exists | **Does not exist** |
| `rampiq_recovery_actions` | Exists | **Does not exist** |

The migration contained `CREATE TABLE`, `CREATE INDEX`, `ALTER PUBLICATION`, `ALTER TABLE ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, `CREATE FUNCTION`, and `CREATE TRIGGER` statements. All were rolled back despite the SQL Editor indicating completion.

---

## 2. Root Cause

The Supabase SQL Editor executes the full SQL input as **one implicit transaction**. If any statement fails, the entire transaction rolls back — including statements that succeeded earlier in the script.

The failure point was:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE rampiq_incidents;
```

This statement throws a `duplicate_object` error if the table is already registered with the publication. In this case, a prior partial attempt (or Supabase internal behavior) had already registered the table name, causing the `ALTER PUBLICATION` to fail.

**Failure chain:**

```
CREATE TABLE rampiq_incidents          ← succeeds (within transaction)
CREATE INDEX ... (8 indexes)           ← succeeds
ALTER PUBLICATION ... ADD TABLE        ← FAILS: duplicate_object
  → entire transaction rolls back
  → CREATE TABLE is undone
  → indexes are undone
  → rampiq_incidents does not persist
  → rampiq_recovery_actions never reached
```

The SQL Editor showed "success" because it reported the query execution completed — it did not distinguish between a committed transaction and a rolled-back one with no explicit error surfaced to the user.

---

## 3. Symptoms Observed

### PostgREST PGRST205 Errors

Every query to `rampiq_incidents` or `rampiq_recovery_actions` via the Supabase JS client returned:

```json
{
  "code": "PGRST205",
  "message": "Could not find the table 'public.rampiq_incidents' in the schema cache",
  "hint": "Perhaps you meant the table 'public.rampiq_events'"
}
```

This was initially attributed to PostgREST schema cache staleness, not to the tables being absent.

### Schema Reload Attempts Failed

Multiple `NOTIFY pgrst, 'reload schema'` commands were executed. PostgREST confirmed it processed the notification, but the tables remained invisible. This was because the tables genuinely did not exist — there was nothing for PostgREST to cache.

### information_schema Confirmed Absence

The definitive verification:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'rampiq_%';
```

Returned only `rampiq_events`. This confirmed the tables were never committed — the issue was not cache-related.

### API Still Functional

`rampiq_events` continued to work correctly throughout. The `/api/rampiq/events` endpoint returned valid JSON. The dashboard rendered normally. The failure was isolated to the new tables — no existing functionality was affected.

---

## 4. Debugging Sequence

### Phase 1: Cache Attribution (incorrect)

1. First verification query returned `PGRST205` for both new tables
2. Assumed PostgREST schema cache had not reloaded after DDL changes
3. Attempted `NOTIFY pgrst, 'reload schema'` via Supabase JS client RPC — failed (function not exposed to anon role)
4. Waited and retried — still `PGRST205`
5. Asked user to run `NOTIFY pgrst, 'reload schema'` in SQL Editor
6. User confirmed execution
7. Retried — still `PGRST205`
8. Attempted to read PostgREST OpenAPI spec to list known tables — endpoint requires service role key

### Phase 2: Existence Verification (correct diagnosis)

9. Queried `information_schema.tables` — only `rampiq_events` returned
10. Concluded: **tables do not exist at the Postgres level**. This is not a cache problem.

### Phase 3: Migration Audit

11. Re-read the full migration SQL line by line
12. Identified `ALTER PUBLICATION supabase_realtime ADD TABLE` as the high-risk statement
13. Recognized that Supabase SQL Editor uses implicit transactions
14. Concluded: publication `ADD TABLE` threw `duplicate_object`, rolling back the entire script

### Phase 4: Safe Migration

15. Wrote idempotent version with `IF NOT EXISTS`, exception handlers, and `DROP TRIGGER IF EXISTS`
16. Wrapped publication changes in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
17. Added `NOTIFY pgrst, 'reload schema'` at end
18. Added verification `SELECT` at end
19. User applied safe migration — tables created successfully
20. Re-ran full verification: insert, FK, trigger, constraint, cleanup — all passed

---

## 5. Architectural Lessons Learned

### Never Trust "Success" Without Verification

The SQL Editor reported success. The tables did not exist. The only reliable verification is querying the database directly:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'rampiq_%';
```

Every future migration must end with a verification query. "It ran without errors" is not the same as "the changes persisted."

### Always Verify via information_schema

PostgREST errors (`PGRST205`) are ambiguous — they can mean "table doesn't exist" or "table exists but isn't cached." `information_schema.tables` is the ground truth. Start there.

### Realtime Publication Changes Are High-Risk

`ALTER PUBLICATION ... ADD TABLE` is not idempotent. It fails with `duplicate_object` if the table is already registered. Inside an implicit transaction, this rolls back everything. This is the single most dangerous statement in a Supabase migration.

**Rule**: Always wrap publication changes in exception handlers:

```sql
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE some_table;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
```

### Use Idempotent Migration Patterns

Every DDL statement in a migration should be safe to run multiple times:

| Statement | Idempotent Version |
|-----------|-------------------|
| `CREATE TABLE` | `CREATE TABLE IF NOT EXISTS` |
| `CREATE INDEX` | `CREATE INDEX IF NOT EXISTS` |
| `CREATE POLICY` | Check `pg_policies` first |
| `ALTER PUBLICATION ADD TABLE` | Wrap in exception handler |
| `CREATE TRIGGER` | `DROP TRIGGER IF EXISTS` then `CREATE TRIGGER` |
| `CREATE FUNCTION` | `CREATE OR REPLACE FUNCTION` |

### Separate Verification from Assumptions

The debugging sequence spent 8 steps (cache reload attempts, waits, retries) on a wrong assumption before checking the ground truth. The correct first step when PostgREST returns `PGRST205` is:

1. Check `information_schema.tables` — does the table exist?
2. If yes → cache problem. Reload PostgREST.
3. If no → migration didn't apply. Re-examine the SQL.

### Verify Persistence Before Deployment Continuation

The commit, push, and deploy proceeded before tables were verified. This was benign (no code depends on the tables yet), but could have been worse if UI wiring had been included in the same step. 

**Rule**: Migration verification must complete before any commit that depends on the new schema.

---

## 6. Safe Migration Strategy Adopted

The safe migration file (`20260525100000_lifecycle_tables_safe.sql`) establishes the pattern for all future RampIQ migrations:

### Table Creation

```sql
CREATE TABLE IF NOT EXISTS rampiq_incidents (
  ...
);
```

Safe to re-run. Does nothing if table already exists.

### Index Creation

```sql
CREATE INDEX IF NOT EXISTS idx_incidents_status ON rampiq_incidents (...);
```

Safe to re-run. Does nothing if index already exists.

### RLS Policy Creation

```sql
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rampiq_incidents'
    AND policyname = 'anon_read_incidents'
  ) THEN
    CREATE POLICY "anon_read_incidents" ON rampiq_incidents FOR SELECT USING (true);
  END IF;
END $$;
```

Checks `pg_policies` catalog before creating. Safe to re-run.

### Publication Changes

```sql
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE rampiq_incidents;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
```

Catches the `duplicate_object` error silently. Safe to re-run.

### Trigger Replacement

```sql
DROP TRIGGER IF EXISTS trg_incidents_updated_at ON rampiq_incidents;
CREATE TRIGGER trg_incidents_updated_at
  BEFORE UPDATE ON rampiq_incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Drops first, then creates. Safe to re-run.

### Function Creation

```sql
CREATE OR REPLACE FUNCTION set_updated_at() ...
```

Replaces if exists. Safe to re-run.

### Schema Cache Reload

```sql
NOTIFY pgrst, 'reload schema';
```

Included at the end of every migration. PostgREST picks up new tables without waiting for the automatic reload interval.

### Verification Query

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'rampiq_%'
ORDER BY table_name;
```

Included at the end of every migration. The result must show all expected tables before the migration is considered complete.

---

## 7. Current Verified Production State

### Tables

| Table | Status | Verified By |
|-------|--------|-------------|
| `rampiq_events` | EXISTS | `SELECT` via Supabase JS client |
| `rampiq_incidents` | EXISTS | `SELECT` + `INSERT` + `UPDATE` + `DELETE` |
| `rampiq_recovery_actions` | EXISTS | `SELECT` + `INSERT` + `DELETE` |

### Defaults

| Field | Expected | Verified |
|-------|----------|----------|
| `rampiq_incidents.status` | `'DETECTED'` | YES |
| `rampiq_incidents.correlation_id` | Auto-generated UUID | YES |
| `rampiq_incidents.opened_at` | `now()` | YES |
| `rampiq_incidents.updated_at` | `now()` | YES |
| `rampiq_recovery_actions.status` | `'PROPOSED'` | YES |
| `rampiq_recovery_actions.proposed_at` | `now()` | YES |

### Constraints

| Constraint | Verified |
|-----------|----------|
| `rampiq_recovery_actions.incident_id` FK → `rampiq_incidents.id` | YES — orphan insert rejected |
| `rampiq_incidents.created_by` NOT NULL | YES (part of INSERT test) |
| `rampiq_incidents.title` NOT NULL | YES (part of INSERT test) |

### Triggers

| Trigger | Table | Verified |
|---------|-------|----------|
| `trg_incidents_updated_at` | `rampiq_incidents` | YES — `updated_at` advances on UPDATE |
| `trg_recovery_actions_updated_at` | `rampiq_recovery_actions` | YES (inferred from trigger creation) |

### Deployment

| Check | Status |
|-------|--------|
| Production URL | `https://rampiq-prototype.vercel.app` |
| Dashboard renders | All KPIs, filters, tabs present |
| API responds | `/api/rampiq/events` returns valid JSON |
| Hydration errors | None |
| Console errors | None |

---

## 8. Operational Philosophy Reinforcement

### "Build Aggressive, Harden Early"

The migration failure occurred because the original SQL was written for correctness but not for resilience. The safe version adds resilience without changing functionality. The cost of the safe patterns (IF NOT EXISTS, exception handlers, verification queries) is near zero. The cost of not having them was a failed migration, 45 minutes of debugging, and a complete rewrite.

**Going forward**: Every migration is written safe-first. Idempotency is not optional.

### Verification Over Assumptions

The initial debugging spent significant time on the wrong hypothesis (PostgREST cache) because the verification step (`information_schema` query) was not the first thing tried. 

**Going forward**: When something doesn't work after a migration, the first query is always:

```sql
SELECT table_name FROM information_schema.tables WHERE ...
```

Not "try reloading the cache." Not "wait and retry." Verify existence first.

### Infrastructure Correctness Before Feature Expansion

The lifecycle commands, types, and documentation were all committed and pushed before the tables were verified. The code was correct but had nothing to talk to. If UI wiring had been included in the same step, the deployment would have been broken.

**Going forward**: Schema changes are verified as a separate step before any code that depends on them is committed. The verification gate is:

1. Migration applied
2. `information_schema` confirms table existence
3. Insert/read/update/delete round-trip succeeds
4. Then — and only then — commit dependent code

### Operational Memory Matters More Than Velocity

This incident took longer to resolve than the migration took to write. The safe migration pattern and this document exist so that the same failure mode never costs time again. Documenting the failure path is as important as documenting the success path.
