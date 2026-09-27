/**
 * Logical backup of the Supabase Postgres database, with a restore proof.
 *
 * Until this script existed, nothing in the repository copied the database.
 * The schema is reproducible from `supabase/migrations/`, but every resume,
 * cover letter and job application row existed in exactly one place. A paused
 * project, a mistaken `delete`, or a bad migration would have been final.
 *
 * Two things make this a backup rather than a file:
 *
 * 1. It is verified by restoring it. The dump is loaded into a throwaway
 *    database and the per-table row counts are compared against the source.
 *    A dump that is merely non-empty proves nothing: pg_dump can succeed and
 *    still produce something pg_restore chokes on (a missing extension, an
 *    object ordering problem). The only evidence that a backup is restorable
 *    is a restore.
 * 2. It fails loudly. A silent no-op backup is worse than no backup, because
 *    it buys false confidence. Missing connection details, an unreachable
 *    host, a wrong password, a dump with zero tables and a count mismatch are
 *    all non-zero exits with a distinct code, never a warning.
 *
 * Credentials come from the environment at run time and are never written to
 * this repository, never placed on a command line (where they would be visible
 * in the process list and in Docker's own argument logging) and never printed.
 * They are passed to the child process as inherited environment variables, by
 * name only: `docker run -e PGPASSWORD` forwards the value without putting it
 * in argv. See `redactedTarget()` for what is safe to log.
 *
 * Toolchain: this machine has no native `pg_dump`, so the Postgres client
 * binaries come from the Supabase Postgres image that the local stack already
 * runs. No new dependency, and the client major version is pinned to match the
 * server (pg_dump refuses to dump a server newer than itself).
 *
 * Usage, exit codes and the restore procedure: docs/engineering/database-backup.md
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/**
 * Exit codes are distinct so that a scheduled run can be alerted on
 * differently: a configuration mistake needs a human, a transient network
 * failure may just need the next run.
 */
const EXIT = {
  OK: 0,
  CONFIG: 2,
  DUMP_FAILED: 3,
  VERIFY_FAILED: 4,
  RETENTION_FAILED: 5,
}

/**
 * Client image. Pinned, and must be >= the server's major version.
 * Already present locally because the Supabase stack runs it.
 */
const DEFAULT_PG_IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.165'

/** The local stack's database container, used only as the restore target. */
const DEFAULT_VERIFY_CONTAINER = 'supabase_db_my-cv-platform'

/**
 * Schemas the application owns and that a restore must reproduce.
 *
 * Excluded on purpose:
 * - `vault` holds Supabase's encrypted secrets. Copying it would put secrets
 *   into an unencrypted file on a developer machine.
 * - `extensions`, `graphql`, `graphql_public`, `realtime`, `_realtime`,
 *   `supabase_functions`, `pgbouncer` are platform-managed and are recreated
 *   by any fresh Supabase project. Restoring them fights the platform.
 * `auth` is appended at run time, only when it can actually be read.
 */
const DEFAULT_SCHEMAS = ['public', 'storage', 'supabase_migrations']

const DEFAULT_RETAIN = 7

/** Local hostnames a container cannot reach without a gateway rewrite. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])

/** A Postgres identifier we are willing to interpolate into SQL. */
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/

const log = (msg) => console.log(`[db-backup] ${msg}`)
const warn = (msg) => console.warn(`[db-backup] WARNING: ${msg}`)

/**
 * Aborts with a message and an exit code. Every failure path goes through
 * here, so no failure can be mistaken for success by a caller reading `$?`.
 *
 * @param {number} code one of EXIT
 * @param {string} msg operator-facing explanation
 * @param {string[]} [hints] concrete next steps
 * @returns {never}
 */
function fail(code, msg, hints = []) {
  console.error(`\n[db-backup] FAILED: ${msg}`)
  for (const hint of hints) console.error(`[db-backup]   - ${hint}`)
  process.exit(code)
}

/**
 * Resolves the target database from the environment.
 *
 * Accepts either a single `SUPABASE_DB_URL` connection URI or the standard
 * libpq `PG*` variables. Nothing is defaulted: guessing a host would risk
 * dumping the wrong database, and defaulting a password would mean shipping
 * one in the repository.
 *
 * @returns {{pg: Record<string,string>, host: string, port: string, database: string, user: string}}
 */
function resolveTarget() {
  const url = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? ''

  /** @type {Record<string,string>} */
  const pg = {}

  if (url.trim()) {
    let parsed
    try {
      parsed = new URL(url.trim())
    } catch {
      // Deliberately does not echo the value: it contains the password.
      fail(
        EXIT.CONFIG,
        'SUPABASE_DB_URL is set but is not a valid connection URI (value not shown).',
        ['Expected form: postgresql://USER:PASSWORD@HOST:PORT/DATABASE'],
      )
    }
    if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
      fail(EXIT.CONFIG, `SUPABASE_DB_URL has protocol "${parsed.protocol}", expected postgresql:`)
    }
    pg.PGHOST = decodeURIComponent(parsed.hostname)
    pg.PGPORT = parsed.port || '5432'
    pg.PGUSER = decodeURIComponent(parsed.username) || 'postgres'
    pg.PGDATABASE = decodeURIComponent(parsed.pathname.replace(/^\//, '')) || 'postgres'
    if (parsed.password) pg.PGPASSWORD = decodeURIComponent(parsed.password)
    const sslmode = parsed.searchParams.get('sslmode')
    if (sslmode) pg.PGSSLMODE = sslmode
  } else {
    for (const key of ['PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGPASSWORD', 'PGSSLMODE']) {
      const value = process.env[key]
      if (value) pg[key] = value
    }
    pg.PGPORT ??= '5432'
    pg.PGUSER ??= 'postgres'
    pg.PGDATABASE ??= 'postgres'
  }

  if (!pg.PGHOST) {
    fail(EXIT.CONFIG, 'No database connection details in the environment.', [
      'Set SUPABASE_DB_URL to the project connection string, or set PGHOST/PGUSER/PGPASSWORD/PGDATABASE.',
      'Supabase dashboard: Project Settings -> Database -> Connection string -> URI.',
      'Use the direct connection or the session-mode pooler (port 5432).',
      'The transaction-mode pooler (port 6543) cannot serve pg_dump.',
      'Never add the value to a file in this repository.',
    ])
  }
  if (!pg.PGPASSWORD) {
    // Not fatal: a .pgpass or a trust-auth host is legitimate. But on a
    // scheduled run an unexpectedly missing password would otherwise surface
    // as a confusing authentication error, so name it now.
    warn('No password in the environment; relying on the server accepting this user without one.')
  }

  // A remote Postgres must not be dialled in the clear. Local stacks have no
  // TLS listener at all, so requiring it there would break the common case.
  pg.PGSSLMODE ??= LOCAL_HOSTS.has(pg.PGHOST) ? 'prefer' : 'require'

  // A hung connection must not hang a scheduled task until the next run.
  pg.PGCONNECT_TIMEOUT ??= '30'

  return { pg, host: pg.PGHOST, port: pg.PGPORT, database: pg.PGDATABASE, user: pg.PGUSER }
}

/** Host:port/db with the password structurally absent. Safe to log. */
const redactedTarget = (t) => `${t.user}@${t.host}:${t.port}/${t.database} (sslmode=${t.pg.PGSSLMODE})`

/**
 * Builds the `docker run` argv that fronts a Postgres client binary.
 *
 * `-e NAME` (no `=value`) forwards the current value from this process without
 * placing the secret in the Docker command line. Local hostnames are rewritten
 * to the Docker host gateway, because inside a container `127.0.0.1` is the
 * container itself.
 *
 * @param {{pg: Record<string,string>}} target
 * @param {string} image
 * @param {string} binary pg_dump | psql
 * @param {string[]} args arguments for the binary
 * @param {string|null} mountDir host directory to expose at /backup
 * @returns {{dockerArgs: string[], env: Record<string,string>}}
 */
function dockerPgArgs(target, image, binary, args, mountDir) {
  const env = { ...target.pg }
  const dockerArgs = ['run', '--rm', '-i']

  if (LOCAL_HOSTS.has(env.PGHOST)) {
    env.PGHOST = 'host.docker.internal'
    dockerArgs.push('--add-host', 'host.docker.internal:host-gateway')
  }

  // Forwarded by name; values stay out of argv.
  for (const key of Object.keys(env)) dockerArgs.push('-e', key)

  if (mountDir) dockerArgs.push('-v', `${mountDir.replace(/\\/g, '/')}:/backup`)

  dockerArgs.push('--entrypoint', binary, image, ...args)
  return { dockerArgs, env }
}

/**
 * Runs a Postgres client binary in a container.
 *
 * @returns {{status: number, stdout: string, stderr: string}}
 */
function runPg(target, image, binary, args, mountDir = null) {
  const { dockerArgs, env } = dockerPgArgs(target, image, binary, args, mountDir)
  const result = spawnSync('docker', dockerArgs, {
    // shell:false — the connection URI and SQL are argv elements, so no shell
    // quoting or injection is possible.
    shell: false,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 32 * 1024 * 1024,
  })
  if (result.error) {
    fail(EXIT.CONFIG, `could not start docker: ${result.error.message}`, [
      'Docker Desktop must be running; this machine has no native pg_dump.',
    ])
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/** Runs a command in the already-running local database container. */
function runInVerifyContainer(container, args) {
  const result = spawnSync('docker', ['exec', '-i', container, ...args], {
    shell: false,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (result.error) fail(EXIT.CONFIG, `could not start docker: ${result.error.message}`)
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/**
 * Exact per-table row counts for the given schemas.
 *
 * `pg_stat_user_tables.n_live_tup` is an estimate and would make the
 * verification meaningless, so this counts rows. `query_to_xml` runs the
 * per-table count inside one round trip, which matters over a remote link.
 *
 * @returns {Map<string, number>} "schema.table" -> row count
 */
function tableCounts(runner, schemas) {
  for (const schema of schemas) {
    // Interpolated into SQL below, so it must be a plain identifier.
    if (!SAFE_IDENTIFIER.test(schema)) {
      fail(EXIT.CONFIG, `refusing to use "${schema}" as a schema name: not a plain lowercase identifier`)
    }
  }
  const list = schemas.map((s) => `'${s}'`).join(',')
  const sql = `
    SELECT n.nspname || '.' || c.relname AS rel,
           (xpath('/row/c/text()',
                  query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname),
                               false, true, '')))[1]::text::bigint AS n
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname IN (${list})
    ORDER BY 1;`

  const { status, stdout, stderr } = runner(['-X', '-w', '-A', '-t', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-c', sql])
  if (status !== 0) {
    fail(EXIT.DUMP_FAILED, 'could not read row counts from the database.', [
      stderr.trim() || 'psql produced no diagnostic output.',
    ])
  }
  const counts = new Map()
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    const [rel, n] = line.split('|')
    counts.set(rel, Number(n))
  }
  return counts
}

/**
 * Proves the database answers before anything else is attempted.
 *
 * Without this, the first thing to touch the network is the `auth` probe, and
 * a wrong password or a paused project surfaces as "auth schema is not
 * readable" — which would tell an operator their user accounts were skipped
 * when in fact nothing was reachable at all. A misleading diagnostic on a
 * backup failure is its own kind of data-loss risk.
 */
function assertReachable(target, image) {
  const { status, stderr } = runPg(target, image, 'psql', [
    '-X', '-w', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', 'select 1',
  ])
  if (status !== 0) {
    fail(EXIT.DUMP_FAILED, `cannot connect to ${redactedTarget(target)}`, [
      stderr.trim() || 'psql produced no diagnostic output.',
      'Paused project: resume it in the Supabase dashboard, then re-run.',
      'Rotated password: take a fresh connection string from the dashboard and update the environment.',
      'Wrong port: pg_dump needs the direct connection or session-mode pooler (5432), not 6543.',
    ])
  }
}

/**
 * Decides whether `auth` goes into the dump.
 *
 * On hosted Supabase the `auth` schema is owned by `supabase_auth_admin`, and
 * whether the connecting role can read it depends on the project. Probing with
 * a cheap read is better than discovering it after a long dump has failed.
 */
function authIsReadable(target, image) {
  const { status } = runPg(target, image, 'psql', [
    '-X', '-w', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
    '-c', 'select 1 from auth.users limit 1',
  ])
  return status === 0
}

/** Sorted list of existing backups, newest first. */
function listBackups(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => /^my-cv-platform-\d{8}T\d{6}Z\.dump$/.test(name))
    .sort()
    .reverse()
    .map((name) => ({ name, path: join(dir, name) }))
}

/**
 * Deletes all but the newest `retain` backups, and each one's manifest.
 *
 * Deliberately pattern-matched: an unrelated file in the backup directory is
 * never a deletion candidate. In-progress `.dump.part` files are excluded by
 * the same pattern, so a concurrent run cannot have its output pruned.
 */
function applyRetention(dir, retain) {
  const backups = listBackups(dir)
  const doomed = backups.slice(retain)
  if (doomed.length === 0) {
    log(`retention: ${backups.length} backup(s) on disk, keeping ${retain} — nothing to delete`)
    return { kept: backups.length, deleted: [] }
  }
  const deleted = []
  for (const { name, path } of doomed) {
    try {
      rmSync(path)
      const manifest = path.replace(/\.dump$/, '.json')
      if (existsSync(manifest)) rmSync(manifest)
      deleted.push(name)
      log(`retention: deleted ${name}`)
    } catch (err) {
      fail(EXIT.RETENTION_FAILED, `could not delete old backup ${name}: ${err.message}`)
    }
  }
  log(`retention: kept ${backups.length - deleted.length} of ${backups.length}, deleted ${deleted.length}`)
  return { kept: backups.length - deleted.length, deleted }
}

/**
 * Restores the dump into a throwaway database and compares row counts.
 *
 * The scratch database is created in the local Supabase container, never on
 * the source server: verification must not write to production. `docker exec`
 * reaches that container's Postgres over its local socket, so verification
 * needs no credentials of its own.
 *
 * The scratch database is pre-loaded with `uuid-ossp` in an `extensions`
 * schema because `public.resumes.id` and friends default to
 * `extensions.uuid_generate_v4()`. A fresh Supabase project has that
 * extension; a bare database does not, and without it the restore would fail
 * for a reason that says nothing about the dump.
 *
 * Comparing against a single source count would be unsound on a live
 * database. `pg_dump` is internally consistent — it dumps from one repeatable
 * read snapshot — but a count taken from a *different* transaction is not in
 * that snapshot, so a row written during the backup would look like data loss.
 * The source is therefore counted twice, before and after the dump:
 *
 * - counts equal before and after -> the table was quiescent, so any
 *   difference in the restored copy is real data loss: FAIL.
 * - counts differ -> the table was being written during the backup. The
 *   restored value must land inside that window; outside it is still FAIL.
 *
 * A missing table, an extra table, or any pg_restore error is a FAIL
 * unconditionally.
 *
 * @returns {{ok: boolean, scratch: string, mismatches: string[], drift: string[], sourceTables: number, restoredTables: number}}
 */
function verifyByRestore(dumpPath, container, countsBefore, countsAfter, schemas) {
  const probe = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', container], {
    shell: false,
    encoding: 'utf8',
  })
  if (probe.error || (probe.stdout ?? '').trim() !== 'true') {
    fail(EXIT.VERIFY_FAILED, `restore target container "${container}" is not running.`, [
      'Start the local stack (pnpm supabase start) so the dump can be restored and checked.',
      'The dump file has been written and kept, but it is UNVERIFIED.',
      'Set BACKUP_VERIFY=0 only if you accept an unverified backup.',
    ])
  }

  const scratch = `cv_backup_verify_${Date.now()}`
  const inContainerDump = `/tmp/${scratch}.dump`
  const psql = (db, sql, extra = []) =>
    runInVerifyContainer(container, [
      'psql', '-X', '-w', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-F', '|', ...extra, '-c', sql,
    ])

  /** Best-effort teardown; a leaked scratch database is a real cost. */
  const cleanup = () => {
    runInVerifyContainer(container, ['rm', '-f', inContainerDump])
    psql('postgres', `DROP DATABASE IF EXISTS "${scratch}" WITH (FORCE)`)
  }

  try {
    log(`verify: creating scratch database ${scratch} in ${container}`)
    let r = psql('postgres', `CREATE DATABASE "${scratch}" TEMPLATE template0`)
    if (r.status !== 0) fail(EXIT.VERIFY_FAILED, `could not create scratch database: ${r.stderr.trim()}`)

    // `DROP SCHEMA public`: the dump carries its own `CREATE SCHEMA public`
    // (pg_dump emits it for any schema named with --schema), which collides
    // with the one every new database is born with. Dropping it first is what
    // makes a clean restore possible — and it is the same step the documented
    // restore into a fresh Supabase project takes, for the same reason.
    r = psql(
      scratch,
      'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;',
    )
    if (r.status !== 0) {
      cleanup()
      fail(EXIT.VERIFY_FAILED, `could not prepare scratch database: ${r.stderr.trim()}`)
    }

    const cp = spawnSync('docker', ['cp', dumpPath, `${container}:${inContainerDump}`], { shell: false, encoding: 'utf8' })
    if ((cp.status ?? 1) !== 0) {
      cleanup()
      fail(EXIT.VERIFY_FAILED, `could not copy the dump into ${container}: ${(cp.stderr ?? '').trim()}`)
    }

    log('verify: restoring the dump')
    const restore = runInVerifyContainer(container, [
      'pg_restore', '-U', 'postgres', '-d', scratch,
      // Ownership and ACLs reference platform roles that exist in this
      // cluster, but re-asserting them proves nothing about the data and
      // makes the check brittle. Structure, policies and rows are what matter.
      '--no-owner', '--no-privileges',
      inContainerDump,
    ])
    // pg_restore without --exit-on-error reports errors on stderr and still
    // exits non-zero, so both signals are worth surfacing.
    const restoreErrors = restore.stderr
      .split(/\r?\n/)
      .filter((l) => /^pg_restore: error:/.test(l))

    const restoredCounts = tableCounts(
      (args) => runInVerifyContainer(container, ['psql', '-U', 'postgres', '-d', scratch, ...args]),
      schemas,
    )

    /** @type {string[]} */
    const mismatches = []
    /** Tables written to during the backup; explained, not failures. */
    const drift = []

    for (const [rel, after] of countsAfter) {
      if (!restoredCounts.has(rel)) {
        mismatches.push(`${rel}: MISSING after restore (source has ${after} row(s))`)
        continue
      }
      const restored = restoredCounts.get(rel)
      if (restored === after) continue

      const before = countsBefore.get(rel)
      if (before === undefined || before === after) {
        // The source did not move, so the difference is the dump's.
        mismatches.push(`${rel}: source ${after} row(s), restored ${restored}`)
      } else if (restored >= Math.min(before, after) && restored <= Math.max(before, after)) {
        drift.push(`${rel}: written during the backup (source ${before} -> ${after}, dump captured ${restored})`)
      } else {
        mismatches.push(
          `${rel}: restored ${restored} row(s) is outside the source's own range during the backup (${before} -> ${after})`,
        )
      }
    }
    for (const rel of restoredCounts.keys()) {
      if (!countsAfter.has(rel)) mismatches.push(`${rel}: present after restore but not in the source`)
    }
    for (const line of restoreErrors) mismatches.push(line.replace(/^pg_restore: error:\s*/, 'pg_restore error: '))

    const ok = mismatches.length === 0
    for (const d of drift) warn(`verify: ${d}`)
    log(
      ok
        ? `verify: PASS — ${restoredCounts.size} table(s) restored, all row counts reconcile with the source` +
          (drift.length ? ` (${drift.length} table(s) written to during the backup)` : '')
        : `verify: FAIL — ${mismatches.length} discrepancy/ies`,
    )
    return { ok, scratch, mismatches, drift, sourceTables: countsAfter.size, restoredTables: restoredCounts.size }
  } finally {
    log(`verify: dropping scratch database ${scratch}`)
    cleanup()
  }
}

function main() {
  const target = resolveTarget()
  const image = process.env.BACKUP_PG_IMAGE ?? DEFAULT_PG_IMAGE
  const container = process.env.BACKUP_VERIFY_CONTAINER ?? DEFAULT_VERIFY_CONTAINER
  const backupDir = resolve(process.env.BACKUP_DIR ?? join(REPO_ROOT, '..', 'my-cv-platform-backups'))
  const retainRaw = process.env.BACKUP_RETAIN ?? String(DEFAULT_RETAIN)
  const retain = Number(retainRaw)
  if (!Number.isInteger(retain) || retain < 1) {
    fail(EXIT.CONFIG, `BACKUP_RETAIN must be a positive integer, got "${retainRaw}"`)
  }
  const shouldVerify = (process.env.BACKUP_VERIFY ?? '1') !== '0'

  log(`target:     ${redactedTarget(target)}`)
  log(`backup dir: ${backupDir}`)
  log(`retention:  keep last ${retain}`)

  // Reachability first, so a connection problem is reported as one.
  assertReachable(target, image)

  // Resolve the schema list before doing anything expensive.
  const schemas = (process.env.BACKUP_SCHEMAS ?? DEFAULT_SCHEMAS.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const includeAuth = process.env.BACKUP_INCLUDE_AUTH ?? 'auto'
  if (includeAuth !== '0' && !schemas.includes('auth')) {
    if (authIsReadable(target, image)) {
      schemas.push('auth')
    } else if (includeAuth === '1') {
      fail(EXIT.CONFIG, 'BACKUP_INCLUDE_AUTH=1 but auth.users is not readable by this role.', [
        'Connect as a role that can read the auth schema, or unset BACKUP_INCLUDE_AUTH.',
      ])
    } else {
      warn('auth schema is not readable by this role — user accounts will NOT be in this backup.')
      warn('Application rows will restore, but their owning users will not. See the doc.')
    }
  }
  log(`schemas:    ${schemas.join(', ')}`)

  const psqlOnSource = (args) => runPg(target, image, 'psql', args)
  log('reading source row counts')
  const countsBefore = tableCounts(psqlOnSource, schemas)
  const sourceCounts = countsBefore
  if (sourceCounts.size === 0) {
    fail(EXIT.DUMP_FAILED, `no tables found in schema(s) ${schemas.join(', ')} — refusing to write an empty backup.`, [
      'Check that SUPABASE_DB_URL points at the intended project and database.',
    ])
  }
  const totalRows = [...sourceCounts.values()].reduce((a, b) => a + b, 0)
  log(`source:     ${sourceCounts.size} table(s), ${totalRows} row(s)`)

  mkdirSync(backupDir, { recursive: true })

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const name = `my-cv-platform-${stamp}.dump`
  const finalPath = join(backupDir, name)
  // Written under a name retention will not match and a restore will not pick
  // up, then renamed. A truncated file can therefore never be mistaken for a
  // backup — which is exactly what a full disk or a killed process produces.
  const partPath = `${finalPath}.part`

  log(`dumping to  ${name}`)
  const dumpArgs = [
    '--format=custom',
    '--compress=6',
    '--no-password', // never prompt: an interactive prompt would hang a scheduled task
    '--file', `/backup/${basename(partPath)}`,
    ...schemas.flatMap((s) => ['--schema', s]),
  ]
  const dump = runPg(target, image, 'pg_dump', dumpArgs, backupDir)
  if (dump.status !== 0) {
    if (existsSync(partPath)) rmSync(partPath)
    fail(EXIT.DUMP_FAILED, 'pg_dump failed; no backup was written.', [
      dump.stderr.trim() || 'pg_dump produced no diagnostic output.',
      'Common causes: wrong or rotated password, paused project, transaction-mode pooler (port 6543), full disk.',
    ])
  }
  if (!existsSync(partPath) || statSync(partPath).size === 0) {
    if (existsSync(partPath)) rmSync(partPath)
    fail(EXIT.DUMP_FAILED, 'pg_dump reported success but produced no output.')
  }
  renameSync(partPath, finalPath)
  const bytes = statSync(finalPath).size
  log(`wrote       ${finalPath} (${(bytes / 1024).toFixed(1)} KiB)`)

  /** @type {{ok: boolean, mismatches: string[], drift?: string[], restoredTables?: number}} */
  let verification = { ok: false, mismatches: ['verification skipped (BACKUP_VERIFY=0)'] }
  if (shouldVerify) {
    // Second reading: bounds the window the dump was taken in. See verifyByRestore.
    const countsAfter = tableCounts(psqlOnSource, schemas)
    verification = verifyByRestore(finalPath, container, countsBefore, countsAfter, schemas)
  } else {
    warn('BACKUP_VERIFY=0 — this dump has NOT been restored. It is a hope, not a backup.')
  }

  writeFileSync(
    finalPath.replace(/\.dump$/, '.json'),
    `${JSON.stringify(
      {
        file: name,
        createdAt: new Date().toISOString(),
        // Host and database only. No user, no password, by construction.
        source: { host: target.host, port: target.port, database: target.database },
        schemas,
        bytes,
        tables: sourceCounts.size,
        rows: totalRows,
        rowCounts: Object.fromEntries(sourceCounts),
        verified: verification.ok,
        verification: verification.ok ? 'restored into a scratch database; row counts reconciled' : verification.mismatches,
        writtenDuringBackup: verification.drift ?? [],
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  applyRetention(backupDir, retain)

  if (!verification.ok && shouldVerify) {
    fail(EXIT.VERIFY_FAILED, 'the dump was written but did not restore cleanly. Treat it as unusable.', verification.mismatches)
  }

  log('')
  log(`DONE — ${name} is ${verification.ok ? 'verified restorable' : 'UNVERIFIED'}.`)
  log(`Reminder: ${backupDir} is on this machine only. One disk failure and it is worthless.`)
  log('Copy backups off-machine — see docs/engineering/database-backup.md.')
  process.exit(EXIT.OK)
}

main()
