# Performance Baseline

Phase 31 of the roadmap: *measure before optimizing*. This file records what
the build, the test suites and the export path actually cost today, so that a
later change can be shown to have made something faster or slower rather than
asserted to have done so.

**Nothing here is a recommendation.** No product code was changed to produce
these numbers and none of them is a target. They are a starting point.

## Where these numbers come from

| | |
|---|---|
| Commit | `84b08c7` (`ralph/milestone-c-part-3-parity-defects`) |
| Measured | 2026-09-25 |
| Machine | Intel Core i7-13700 (16 cores / 24 threads), 63.7 GB RAM, Windows 11 Home N 10.0.26200 |
| Node / pnpm | Node v24.21.0, pnpm 10.25.0 |
| Next.js | 14.2.33 |

**The working tree was not clean throughout.** `src/` was clean at `84b08c7`
when the build in §1 ran (20:45:15–20:46:47); another agent then began editing
the five DOCX generators at 20:47:11, so the DOCX timings in §3, taken at
~20:49, measured those files with a few uncommitted lines each (3–5 added per
generator). The edits are parity fixes, not performance work, and a difference
of that size will not move a 9 ms figure — but §3 is `84b08c7` *plus* that
work in progress, not `84b08c7`. Everything else predates the edits.

Every number below is a **single-machine, single-run wall clock on a developer
workstation**, not a CI figure and not a production figure. Windows antivirus,
a warm or cold webpack cache and any other agent running a server on the same
box all move these by more than the differences worth arguing about. Treat a
change of less than ~20% as noise unless it reproduces.

## 1. Production build

| Measurement | Value |
|---|---|
| `pnpm build:verify` wall clock | **92 s** |
| Static pages generated | 108 / 108 |
| Route entries in the printed table | 60 (22 SSG × 4 locales, 38 dynamic/server) |
| First Load JS shared by all routes | **161 kB** (103 kB + 54.1 kB + 3.61 kB other) |
| Middleware | 139 kB |
| Exit code | 0 |

Reproduce:

```powershell
Measure-Command { pnpm build:verify }
```

`build:verify` rather than `build` because other agents share this checkout and
a plain `pnpm build` writes into the `.next` a dev server reads — see
`docs/engineering/quality-contract.md` and `scripts/build-verify.mjs`. The two
compile the same thing.

**The 92 s is a warm-cache build.** `.next-verify/cache` held 1.7 GB of prior
webpack packs when it ran. A first build on a clean checkout, or the build
inside a Playwright `webServer`, is materially slower and is not measured here.

Raw log: `<scratchpad>/perf-build.log`.

## 2. Test suites

Taken from the logs of the US-007 verification rounds on 2026-09-24, the runs
that produced this commit. Not re-run — re-running them would measure the same
code on the same machine a day later.

| Suite | Command | Tests | Wall clock |
|---|---|---|---|
| Unit | `pnpm test` | 1132 in 27 files | **1.20 s** |
| Integration | `pnpm test:integration` | 27 in 3 files | **1.21 s** |
| Typecheck | `pnpm typecheck` | — | not timed (0 errors) |
| E2E | `pnpm test:e2e` | 116 | **2.6 m** |
| Visual | `pnpm test:visual` | 10 | **1.2 m** |
| Parity | `pnpm test:parity` | 243 | **1.8 m** |

Sources: `<scratchpad>/p3us007/` — `r3-unit.log`, `r2-integration.log`,
`r2-e2e.log`, `r2-visual.log`, `r3-parity-2.log`.

**The three Playwright figures exclude their own build.** Each config runs
`pnpm build && pnpm start` into its own dist directory before the first test,
and Playwright's reported total starts after that. End-to-end cost of
`pnpm test:e2e` from a cold prompt is therefore roughly *build + 2.6 m*, and
the same for the other two. The reported total *does* include browser launch
and per-test login: the visual suite's ten tests sum to ~14 s of test time
inside a 1.2 m run.

The parity suite additionally requires a local Supabase stack
(`pnpm supabase start`) and is not a CI gate.

## 3. The export path

### DOCX generation (server CPU work)

Direct measurement of `generate<Template>Docx()` — document construction plus
`Packer.toBuffer()`, which is everything
`/api/resumes/[id]/download-docx` does apart from auth and the database read.
Seven runs per template against the fixed capture fixture; the first run of
each is reported separately because module and font warm-up lands on it.

| Template | Cold | Median (warm) | Min–max (warm) | Output |
|---|---|---|---|---|
| professional | 30 ms | **9 ms** | 8–14 ms | 10.0 kB |
| modern | 13 ms | **9 ms** | 8–12 ms | 10.8 kB |
| classic | 7 ms | **6 ms** | 6–7 ms | 10.0 kB |
| minimal | 8 ms | **7 ms** | 6–9 ms | 10.0 kB |
| creative | 28 ms | **10 ms** | 9–13 ms | 16.0 kB |

**The DOCX generators are not slow.** Single-digit milliseconds for a
one-page resume. Whatever a user experiences as a slow export is auth, the
database read, the HTTP round trip or the download — not document
construction. That is the finding, and it is the reason this section carries no
recommendation.

Reproduce: the harness is a throwaway Vitest file in the session scratchpad
(`<scratchpad>/perf-docx/perf.test.ts` + `perf.config.mts`), run with

```powershell
pnpm exec vitest run --config <scratchpad>/perf-docx/perf.config.mts
```

It imports the five generators through the `@` alias and reuses
`<scratchpad>/docx-capture/fixture.ts`. **It is not in the repository**, so this
row is not reproducible from a clean checkout — see *Not measured*, below.

### Preview + print + DOCX over HTTP

The parity harness's `collect` test logs in, opens the Preview, takes a
`page.pdf()` print render and requests the DOCX, once per fixture × template.
Across 27 collect rows in `r3-parity-2.log`: **1.9 s – 2.4 s per row**, most
rows 2.0–2.2 s. That is the closest recorded figure for the whole export path
including login and navigation, but it does not separate the three surfaces.

### PDF / print render

The resume PDF is **not server work**: it is the browser's own print of the
print stylesheet (`page.emulateMedia({ media: 'print' })` +
`page.pdf()` in `e2e/parity/surfaces.ts`). Cover letters use client-side
`html2pdf.js` / `jspdf`.

Closest measurement, from the visual suite's per-test durations
(`r2-visual.log`), each a navigation plus a print-media render plus a
screenshot comparison:

| Template | `renders as approved` | `prints as approved` |
|---|---|---|
| professional | 1.5 s | 1.3 s |
| modern | 1.5 s | 1.5 s |
| classic | 1.6 s | 2.0 s |
| minimal | 1.6 s | 1.3 s |
| creative | 1.3 s | 1.2 s |

These are test-harness durations, not a user-perceived export time.

## 4. Page weight of the main authenticated surfaces

From the route table of the build in §1 — no server or login needed.

| Route | Page JS | First Load JS |
|---|---|---|
| `/[locale]/dashboard/job-applications` | 59.7 kB | **309 kB** |
| `/[locale]/dashboard/resumes/[id]/edit` | 352 B | **305 kB** |
| `/[locale]/resumes/[id]/edit` | 353 B | **305 kB** |
| `/[locale]/login` | 3.02 kB | 290 kB |
| `/[locale]/signup` | 2.92 kB | 290 kB |
| `/[locale]/dashboard/jobs` | 12.4 kB | 246 kB |
| `/[locale]/dashboard/resumes/[id]/preview` | 2.17 kB | 244 kB |
| `/[locale]/resumes/[id]/preview` | 1.18 kB | 243 kB |
| `/[locale]` (landing) | 3.72 kB | 240 kB |

Heaviest non-authenticated pages are the AI tools: `resume-job-match` 263 kB,
`resume-reviewer` 262 kB, `resume-grammar-checker` 258 kB.

First Load JS is a transfer-size estimate Next.js prints; it is not a measured
network payload and says nothing about parse or hydration time.

## Not measured, and why

- **Cold-cache build.** Would mean deleting 1.7 GB of shared webpack cache in a
  checkout other agents are building in. Only the warm number is recorded.
- **Runtime page timings — TTFB, LCP, hydration, INP.** These need a running
  server and an authenticated session, and the brief scoped that out. Nothing
  here describes what a page feels like.
- **DOCX endpoint end-to-end, isolated.** Only the generator (§3) and the
  combined three-surface parity row are measured. Auth and the Supabase read
  are inside the 2 s row and have no number of their own.
- **PDF export as the user triggers it.** Measured only as the harness's print
  render. The real path is a client-side print dialog or `html2pdf.js`, neither
  of which is instrumented.
- **AI endpoints** (`/api/ai/*`, `/api/tools/*`). Dominated by the Groq round
  trip, which varies by orders of magnitude with the model and the prompt, and
  measuring it would spend tokens and credits. A baseline here would be noise.
- **Database query times / RLS overhead.** Needs the local Supabase stack and
  realistic row counts; neither was in scope.
- **Production or CI numbers.** Everything here is one developer workstation.
  Vercel cold starts, edge middleware latency and CI runner speed are all
  unmeasured and will not resemble these figures.
- **A repository-resident DOCX benchmark.** The §3 harness lives in the session
  scratchpad. Making it reproducible would mean adding a Vitest entry point
  under `scripts/`, which is more than a measurement pass should land.

## What to watch

Three numbers, with the threshold at which they stop being noise.

1. **First Load JS shared by all — 161 kB.**
   Every route pays it. A jump above **~190 kB** means something landed in a
   module the whole app imports; find it before it is load-bearing.
   Visible in any `pnpm build` output, no extra tooling.

2. **Build wall clock — 92 s warm.**
   Past **~2.5 minutes** warm, every Playwright suite gets slower too, because
   each one builds first. That is the number developers and CI feel.

3. **DOCX generation median — 6–10 ms per template.**
   Anything over **~50 ms** means the generators stopped being cheap, and the
   export path's cost profile — currently auth and I/O, not document
   construction — has changed shape. Re-derive the profile before tuning
   anything.

The two authenticated editor routes at 305 kB are worth a glance whenever the
editor gains a dependency, but they are not on the watch list: no runtime
measurement exists to say whether 305 kB is currently a problem.
