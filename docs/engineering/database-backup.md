# Database backup and restore

The schema of this project is reproducible from `supabase/migrations/`. The data
is not. Every resume, cover letter, job application and user account exists in
exactly one place — the hosted Supabase project — and until `scripts/db-backup.mjs`
existed, nothing in this repository copied it.

This document covers the backup script, how to schedule it, how to restore, and
what goes wrong.

> **A backup on this machine is not a backup.** The script writes to a local
> directory. One disk failure, one ransomware event, one stolen laptop and the
> copy is gone with the original. [Getting the files off this machine](#getting-the-files-off-this-machine)
> is a required step, not a nice-to-have.

---

## 1. Quick start

The script never reads `.env` and contains no credentials. Supply the
connection string through the environment at run time.

```powershell
# PowerShell. Get the URI from the Supabase dashboard:
#   Project Settings -> Database -> Connection string -> URI
$env:SUPABASE_DB_URL = 'postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres'
pnpm db:backup
```

A successful run prints the dump path and `verified restorable`, and exits `0`.
Anything else is a failure with a non-zero exit code — there is no
"succeeded with problems" state.

To exercise the script itself against the local stack, build the URI from
Supabase's published local defaults — host `127.0.0.1`, the `[db] port` in
`supabase/config.toml`, user/password/database all `postgres`:

```powershell
$env:SUPABASE_DB_URL = "postgresql://postgres:postgres@127.0.0.1:$port/postgres"
$env:BACKUP_DIR = 'E:\tmp\backup-test'
pnpm db:backup
```

No connection string is committed anywhere in this repository, not even a local
one, so that no grep for a URI ever returns a false positive here.

### Toolchain

There is no native `pg_dump` on this machine. The script runs the Postgres
client binaries from the Supabase Postgres image the local stack already
pulls, so **Docker Desktop must be running**. No new dependency was added.

The client image major version must be greater than or equal to the server's;
`pg_dump` refuses to dump a newer server than itself. If Supabase upgrades the
hosted project's Postgres major version, bump `BACKUP_PG_IMAGE` (or the
`DEFAULT_PG_IMAGE` constant) to match.

---

## 2. Configuration

Connection — one of these is **required**:

| Variable | Notes |
| --- | --- |
| `SUPABASE_DB_URL` | Full URI. `DATABASE_URL` is accepted as a fallback. |
| `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` | Standard libpq variables, if you prefer them split. |

Everything else is optional:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BACKUP_DIR` | `<repo>/../my-cv-platform-backups` | Where dumps go. Deliberately **outside the checkout** so a backup can never be committed. |
| `BACKUP_RETAIN` | `7` | Keep the newest N dumps, delete the rest. |
| `BACKUP_SCHEMAS` | `public,storage,supabase_migrations` | Schemas to dump. `auth` is appended automatically when readable. |
| `BACKUP_INCLUDE_AUTH` | `auto` | `0` to exclude `auth`; `1` to fail if it cannot be read. |
| `BACKUP_VERIFY` | `1` | `0` skips the restore check. Do not. |
| `BACKUP_VERIFY_CONTAINER` | `supabase_db_my-cv-platform` | Local container used as the restore target. |
| `BACKUP_PG_IMAGE` | pinned Supabase Postgres image | Source of `pg_dump` / `pg_restore` / `psql`. |

### Credential handling

- Nothing is read from `.env`, and no connection string, password or token
  exists anywhere in this repository.
- The password is **never placed on a command line**. It is forwarded to the
  container by name (`docker run -e PGPASSWORD`), so it appears in neither the
  process list nor Docker's own argument logging.
- Logs print `user@host:port/database` only. The manifest records host, port
  and database name — never the user or the password.
- A malformed `SUPABASE_DB_URL` is reported without echoing the value, because
  the value contains the password.

---

## 3. What is backed up

| Schema | Contents | In the dump |
| --- | --- | --- |
| `public` | Resumes, cover letters, job applications, profiles, analyses, AI suggestions, career goals, generation logs — plus RLS policies, grants, constraints and defaults | Structure **and** data |
| `auth` | User accounts, password hashes, OAuth identities, sessions | Structure and data, when the role can read it |
| `storage` | Bucket definitions and object **metadata rows** | Structure and data |
| `supabase_migrations` | Which migrations the project has applied | Structure and data |

### What is NOT backed up — read this list

1. **Files in Supabase Storage.** `storage.objects` holds metadata; the actual
   uploaded bytes (profile photos, imported CVs) live in Supabase's object
   store and are not in this dump. Restoring gives you rows pointing at objects
   that do not exist. Back these up separately if they matter.
2. **The `vault` schema.** Excluded on purpose. It holds Supabase's encrypted
   secrets, and copying it would write secrets into an unencrypted file on a
   developer machine.
3. **Platform-managed schemas** — `extensions`, `graphql`, `graphql_public`,
   `realtime`, `_realtime`, `supabase_functions`, `pgbouncer`. A fresh Supabase
   project recreates these. Restoring them fights the platform.
4. **Project configuration.** Auth providers and their secrets, redirect URLs,
   SMTP settings, API keys, Edge Function code and secrets, custom domains.
   These live in the Supabase dashboard, not in Postgres. A restore brings back
   data, not a configured project.
5. **Roles and their passwords.** Cluster-level objects, not per-database.
6. **Point-in-time recovery.** This is a periodic snapshot. Anything written
   between the last run and a disaster is lost. If the window matters, enable
   Supabase PITR on a paid plan — that is a different and better guarantee.

### Row-level security

RLS policies, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, and grants to `anon`
and `authenticated` are all part of the dump and were confirmed present after
the restore drill in §6. This matters: a restore that brought back rows but
dropped the policies would silently expose every user's data to every other
user. Verify policies after any real restore.

---

## 4. Verification — why this is a backup and not a hope

A dump that has never been restored is an untested assumption. `pg_dump` can
exit `0` and still produce something `pg_restore` cannot load — a missing
extension, an object ordering problem, a truncated write.

So every run, by default:

1. Counts rows in every table in the selected schemas, on the source.
2. Takes the dump.
3. Counts the source again.
4. Creates a throwaway database in the **local** container, drops its stock
   `public` schema, then reinstalls **the source's own extensions into the
   source's own schemas** — read from `pg_extension`, not assumed. `pg_dump
   --schema` omits `CREATE EXTENSION` but still emits column defaults that
   call into one, so the target has to match: a project built through the
   dashboard has `uuid-ossp` in `public` and defaults reading
   `public.uuid_generate_v4()`, while one on Supabase's current template has
   it in `extensions`. Hardcoding either breaks against the other. Where an
   extension forces `public` back into existence, the dump's own
   `CREATE SCHEMA public` is dropped from the restore list, since that
   statement has already been executed.
5. Restores the dump into it.
6. Compares every table's restored row count against the source.
7. Drops the throwaway database.

The scratch database is always created locally, never on the source server.
Verification must not write to production.

**Why the source is counted twice.** `pg_dump` is internally consistent — it
reads from a single repeatable-read snapshot — but a count taken from a
*different* transaction is not inside that snapshot. On a live database, a row
written during the backup would look like data loss. So:

- counts equal before and after → the table was quiescent, and any difference
  in the restored copy is real: **FAIL**.
- counts differ → the table was being written during the backup. The restored
  value must fall inside that window; outside it is still **FAIL**. Inside, it
  is reported as a warning and recorded in the manifest under
  `writtenDuringBackup`.

A missing table, an extra table, or any `pg_restore` error is a FAIL
unconditionally.

This check earned its place immediately: the first run failed with
`schema "public" already exists`, a real defect in the restore path that a
size-greater-than-zero check would have passed.

### The manifest

Each dump gets a sibling `.json`:

```json
{
  "file": "my-cv-platform-20260927T081050Z.dump",
  "createdAt": "2026-09-27T08:10:50.000Z",
  "source": { "host": "...", "port": "5432", "database": "postgres" },
  "schemas": ["public", "storage", "supabase_migrations", "auth"],
  "bytes": 1372297,
  "tables": 42,
  "rows": 24326,
  "rowCounts": { "public.resumes": 9, "auth.users": 3, "...": 0 },
  "verified": true,
  "verification": "restored into a scratch database; row counts reconciled",
  "writtenDuringBackup": []
}
```

`"verified": true` is the only value that means the file has been restored.
Retention deletes a manifest with its dump.

### Checking a backup you already have

The manifest records the verdict from the time of writing. To re-verify an
older file — for example before relying on it — restore it using §6 and compare
against `rowCounts` in its manifest.

### Exit codes

| Code | Meaning | Action |
| --- | --- | --- |
| `0` | Dump written and verified restorable | none |
| `2` | Configuration or precondition error (no credentials, bad `BACKUP_RETAIN`, Docker not running) | needs a human |
| `3` | Could not connect, or `pg_dump` failed. No file written. | check the project and the password |
| `4` | Dump written but did **not** restore cleanly. **Treat the file as unusable.** | investigate before trusting any backup |
| `5` | Retention could not delete an old file | check permissions / file locks |

---

## 5. Retention and where the files go

Dumps are named `my-cv-platform-<YYYYMMDD>T<HHMMSS>Z.dump` — UTC, so they sort
chronologically as strings.

The default location is **`<repo>/../my-cv-platform-backups`**, a sibling of the
checkout. Outside the repository by design: a database dump must never become a
commit. The script prints the absolute path on every run.

After each successful dump the script keeps the newest `BACKUP_RETAIN` files
and deletes the rest, along with their manifests. Deletion is restricted to
names matching the pattern above, so nothing else in the directory is ever a
candidate — and in-progress `.dump.part` files are excluded, so a concurrent run
cannot have its output pruned.

Dumps are written to `<name>.dump.part` and renamed only after `pg_dump`
succeeds. A truncated file — which is what a full disk or a killed process
produces — can therefore never be mistaken for a backup, and retention will
never discard a good backup in favour of one.

### Getting the files off this machine

The script deliberately does not do this. Pick one:

1. **Enable Supabase's own backups first.** Daily backups, and PITR on the Pro
   plan, are managed by the platform and stored off your infrastructure. That
   is the primary protection; this script is an independent second copy that
   survives losing access to the Supabase account itself.
2. **Sync the backup directory to cloud storage.** Point OneDrive/Dropbox at
   `BACKUP_DIR`, or add an `rclone`/`restic` step to the scheduled task
   targeting Backblaze B2 or S3. `restic` gives encryption and deduplication
   and is the better answer for dumps containing personal data.
3. **At minimum, a second physical disk**, then an external drive kept
   elsewhere.

Whatever you choose: **these dumps contain personal data and password hashes.**
Encrypt them at rest, keep them out of shared folders, and give them the same
retention discipline as the database itself.

---

## 6. Restore procedure

This is the procedure drilled locally against a simulated fresh project. Run it
from PowerShell.

> **Git Bash mangles container paths.** `docker exec ... /tmp/x.dump` becomes
> `C:/.../tmp/x.dump` and fails with "could not open input file". Use PowerShell,
> or prefix with `MSYS_NO_PATHCONV=1`. (The script itself is immune — it spawns
> Docker without a shell.)

Set `$Dump` and `$Target` first:

```powershell
$Dump   = 'E:\website\cv-website\my-cv-platform-backups\my-cv-platform-20260927T081050Z.dump'
$Target = 'postgresql://postgres:<password>@db.<newref>.supabase.co:5432/postgres'
$Image  = 'public.ecr.aws/supabase/postgres:17.6.1.165'
```

### Step 0 — create the project and apply migrations

Create the new Supabase project. It arrives with `public`, `auth`, `storage`,
`supabase_migrations` and `extensions` already present, which the next steps
depend on: **`pg_restore -n <schema>` does not emit `CREATE SCHEMA`**, so the
target schemas must already exist.

Recreate the extensions **in the schemas the dump's source had them in**, not
in the schemas this new project came with. `pg_dump` did not put
`CREATE EXTENSION` in the dump, but it did emit schema-qualified defaults such
as `public.uuid_generate_v4()`, and those resolve against a literal schema
name. Get the list from the backup's manifest — the `.json` beside the
`.dump` records it:

```json
"extensions": [{ "name": "uuid-ossp", "schema": "public" }]
```

Then, for each entry (creating the schema first if it does not exist):

```sql
create extension if not exists "uuid-ossp" with schema public;
```

Using `extensions` here because a new project happens to have that schema is
the mistake that broke the first verified backup run: every `create table`
with a `public.uuid_generate_v4()` default fails, and every `copy` after it
fails too.

Do **not** apply the migrations if you are restoring `public` structure from the
dump in step 2 — you would collide with yourself. Either restore the structure
or migrate it, not both.

### Step 1 — restore user accounts, in dependency order

`auth` structure already exists in the new project, so restore data only. Two
passes, in this order, because `auth.identities` has a foreign key to
`auth.users`:

```powershell
docker run --rm -e PGPASSWORD --entrypoint pg_restore -v "${PWD}:/w" $Image `
  --dbname=$Target --data-only -n auth -t users --no-owner /w/$(Split-Path $Dump -Leaf)
docker run --rm -e PGPASSWORD --entrypoint pg_restore -v "${PWD}:/w" $Image `
  --dbname=$Target --data-only -n auth -t identities --no-owner /w/$(Split-Path $Dump -Leaf)
```

**Order matters and the failure is silent-ish.** Restoring the whole `auth`
schema in one pass loads tables in catalogue order, `identities` before `users`,
and the COPY fails on the foreign key — leaving `auth.users` populated and
`auth.identities` **empty**, which breaks every OAuth login while looking like a
successful restore. The obvious fix, `--disable-triggers`, requires superuser,
which `postgres` is **not** on hosted Supabase (nor in the local container).
Two ordered passes need no special privilege.

Restore only these two tables. `sessions`, `refresh_tokens`, `mfa_*`,
`flow_state` and `one_time_tokens` are ephemeral and will not be valid against
a new project anyway.

**What survives:** email addresses, bcrypt password hashes (so existing
passwords keep working) and OAuth provider linkage. **What does not:** active
sessions. Every user must log in again.

### Step 2 — restore the application schemas

```powershell
docker run --rm -e PGPASSWORD --entrypoint pg_restore -v "${PWD}:/w" $Image `
  --dbname=$Target -n public -n storage -n supabase_migrations `
  --no-owner /w/$(Split-Path $Dump -Leaf)
```

This brings structure, data, RLS policies, grants and constraints.

`--no-owner` is required: objects are owned by `supabase_admin` in the dump and
the restoring `postgres` role cannot assign ownership to it. Ownership in the
new project falls to `postgres`, which is what a migration-created schema would
give you anyway.

### Step 3 — verify before pointing the app at it

```sql
select count(*) from public.resumes;
select count(*) from public.cover_letters;
select count(*) from auth.users;
select count(*) from auth.identities;

-- RLS must be back, or every user can read every other user's data
select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity;
select count(*) from pg_policies where schemaname = 'public';

-- defaults, foreign keys and triggers actually work
insert into public.resumes (user_id, title)
  select id, 'restore check' from auth.users limit 1;
```

Compare the counts against `rowCounts` in the dump's manifest. Then delete the
check row.

### Step 4 — reconnect the application

Update `NEXT_PUBLIC_SUPABASE_URL`, the anon key and the service-role key in the
deployment environment. Re-enter auth provider configuration, redirect URLs and
SMTP settings in the dashboard — none of that is in the dump (§3).

### Expected, harmless errors

These appear during a restore and do not indicate a problem:

- `permission denied to change default privileges` — `ALTER DEFAULT PRIVILEGES`
  for roles the restoring user is not a member of.
- `schema "..." already exists` — only if you restore without `-n` filters.
- `role "supabase_admin" does not exist` — only if you omit `--no-owner`.

Anything mentioning `COPY failed`, a foreign key violation, or a missing
relation is **not** harmless. Stop and read it.

### Restoring into the local stack instead

To inspect a dump without touching any hosted project, point the restore at a
scratch database in the local container:

```powershell
docker cp $Dump supabase_db_my-cv-platform:/tmp/r.dump
docker exec -i supabase_db_my-cv-platform psql -U postgres -d postgres -c 'create database scratch template template0'
docker exec -i supabase_db_my-cv-platform psql -U postgres -d scratch -c 'drop schema if exists public cascade'
# Then, per the manifest's "extensions" list, recreating each schema first.
# For a dashboard-built source that means public, not extensions:
docker exec -i supabase_db_my-cv-platform psql -U postgres -d scratch -c 'create schema if not exists public; create extension "uuid-ossp" with schema public;'
docker exec supabase_db_my-cv-platform pg_restore -U postgres -d scratch --no-owner --no-privileges /tmp/r.dump
# ... inspect ...
docker exec -i supabase_db_my-cv-platform psql -U postgres -d postgres -c 'drop database scratch with (force)'
docker exec supabase_db_my-cv-platform rm -f /tmp/r.dump
```

Here the stock `public` schema must be dropped first, because with no `-n`
filter the dump carries its own `CREATE SCHEMA public`. This is exactly what the
script's automatic verification does.

If an extension has to go back into `public`, that `CREATE SCHEMA public` will
now collide with the schema you just recreated for it. Drop that one statement
from the restore rather than ignoring the error — again, what the script does:

```powershell
docker exec supabase_db_my-cv-platform sh -c "pg_restore -l /tmp/r.dump | grep -v 'SCHEMA - public ' > /tmp/r.list"
docker exec supabase_db_my-cv-platform pg_restore -U postgres -d scratch --no-owner --no-privileges -L /tmp/r.list /tmp/r.dump
```

---

## 7. Scheduling on Windows Task Scheduler

### Storing the connection string

Task Scheduler does not inherit a shell's environment. Set the variable at user
scope once:

```powershell
setx SUPABASE_DB_URL "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
```

This writes plaintext to `HKCU\Environment`: it is only as protected as the
Windows account, and any process running as you can read it. Acceptable for a
single-owner developer machine; if that is not good enough, store a
DPAPI-encrypted file outside the repository and have a wrapper script decrypt it
into the environment for the duration of the run. Either way the value must
never enter this repository.

### Registering the task

Daily at 02:00, from an elevated PowerShell:

```powershell
$node   = (Get-Command node).Source
$script = 'E:\website\cv-website\my-cv-platform\scripts\db-backup.mjs'
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$script`"" `
  -WorkingDirectory 'E:\website\cv-website\my-cv-platform'
$trigger = New-ScheduledTaskTrigger -Daily -At 02:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'my-cv-platform database backup' `
  -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Verified logical backup of the hosted Supabase database.'
```

Notes that matter:

- `-StartWhenAvailable` runs a missed backup after the machine was asleep.
  Without it an overnight shutdown silently skips a day.
- Run the task **as your own user, logged on or not**, with stored credentials —
  otherwise `setx` variables and Docker are not available.
- **Docker Desktop must be running.** It usually does not start before login.
  If the machine is normally logged in, this is fine; if not, either enable
  Docker's start-on-boot or accept that the task fails loudly with exit `2`
  (which is the correct behaviour — it does not write a fake backup).
- The task's **Last Run Result** is the script's exit code, so §4's table reads
  directly in Task Scheduler. Treat anything non-zero as a failed backup.
- Verification needs the local Supabase stack running. If it is not, the dump is
  still written but the run exits `4`. Either keep the stack up for the
  scheduled window or set `BACKUP_VERIFY=0` and accept unverified backups —
  the first option is strongly preferred.

### Confirm it actually runs

A schedule nobody checks is not a schedule. Once registered:

```powershell
Start-ScheduledTask -TaskName 'my-cv-platform database backup'
Get-ScheduledTaskInfo -TaskName 'my-cv-platform database backup' |
  Select-Object LastRunTime, LastTaskResult, NextRunTime
```

`LastTaskResult` of `0` plus a new `.dump` and `"verified": true` in its
manifest is the only green. Re-check monthly, and check that the newest file is
newer than `BACKUP_RETAIN` days.

---

## 8. Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Exit `2`, "No database connection details in the environment" | Variable not set, or Task Scheduler not inheriting it | `setx` at user scope; run the task as your user with stored credentials |
| Exit `2`, "could not start docker" | Docker Desktop not running. There is no native `pg_dump` here. | Start Docker; consider start-on-boot for scheduled runs |
| Exit `3`, "password authentication failed" | **Rotated password.** Resetting the database password in the dashboard invalidates the stored URI, and every scheduled backup fails from then on. | Take a fresh URI from the dashboard, `setx` it again, run once by hand to confirm |
| Exit `3`, "Connection refused" / timeout | **Paused project.** Free-tier projects pause after inactivity and refuse connections — a paused project cannot be backed up at all. | Resume it in the dashboard, then run immediately. If this keeps happening, that is the strongest possible argument for a paid plan |
| Exit `3` on port `6543` | Transaction-mode pooler cannot serve `pg_dump` | Use the direct connection or the session-mode pooler on `5432` |
| Exit `3`, "No space left on device" | **Full disk.** The partial file is deleted, so no truncated dump is left to mistake for a backup. | Free space or move `BACKUP_DIR`; lower `BACKUP_RETAIN` |
| Exit `3`, "no tables found ... refusing to write an empty backup" | Pointed at the wrong database, or the role sees nothing | Check the URI names the right project and database |
| Exit `4`, "restore target container is not running" | Local Supabase stack down, so the dump cannot be checked. The dump is kept but **unverified**. | `pnpm supabase start`, re-run |
| Exit `4` with count mismatches or `pg_restore error:` lines | The dump did not restore cleanly. **Do not rely on it.** | Read the listed discrepancies; check the client image major version against the server's |
| Warning: "auth schema is not readable by this role" | The role cannot read `auth`. Application rows will restore, but **the users that own them will not.** | Use a role that can read `auth`. Set `BACKUP_INCLUDE_AUTH=1` to make this fatal rather than a warning |
| Exit `5` | Could not delete an old dump | File locked or permissions; check `BACKUP_DIR` |
| `pg_dump: server version mismatch` | Server upgraded past the pinned client | Raise `BACKUP_PG_IMAGE` to a matching or newer tag |
| Restore: `COPY failed ... identities_user_id_fkey` | `auth` restored in one pass instead of ordered passes | Follow §6 step 1 exactly: `users`, then `identities` |
| Restore: "could not open input file" in Git Bash | MSYS path conversion | Use PowerShell, or `MSYS_NO_PATHCONV=1` |

### The failure mode with no error message

The dangerous one is a backup that runs for months and is never restored. That
is what §4 exists to prevent on every run, and what the monthly check in §7
exists to prevent at the schedule level. A dump nobody has restored is a hope.
