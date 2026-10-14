# Resume PDF export: production runtime

How `POST /api/resumes/[id]/download-pdf` runs its headless Chromium on
Vercel, and what that runtime changes compared with a developer machine.
The route itself, its checks and its network policy are described in the
route and in `src/lib/pdf/*.ts`; this page covers only the runtime.

PRD: `tasks/prds/resume-pdf-direct-download.md`, US-003.

## Which Chromium runs

`src/lib/pdf/browser.ts` is the only place that launches the browser.
`pdfBrowserRuntime(process.env)` chooses one of two binaries:

| Runtime | Detected by | Binary | Sandbox |
| --- | --- | --- | --- |
| serverless | `VERCEL` or `AWS_LAMBDA_FUNCTION_NAME` set (platform-provided) | `@sparticuz/chromium` (headless shell for Amazon Linux 2023, brotli-packed, inflated into `/tmp` on first use) | off |
| local | neither set: developer machines, CI | the Chromium Playwright installs for the e2e suite, through `playwright-core` | on |

On the local runtime nothing changed from US-001: same launch options, no
executable path, no extra flag.

### Version pin

`@sparticuz/chromium` is pinned exactly (no `^`) to the release whose Chromium
major matches the browser `playwright-core` drives
(`node_modules/playwright-core/browsers.json`, `chromium.browserVersion`).
Playwright speaks the DevTools protocol of its own Chromium revision; a far
older or newer binary can fail at launch or misbehave in `page.pdf()`.
`@sparticuz/chromium` versions follow the Chromium major they ship.

**When `playwright-core` / `@playwright/test` are upgraded, upgrade
`@sparticuz/chromium` to the matching major in the same change.**

`@sparticuz/chromium` requires Node `^22.17.0 || >=24.0.0`. CI uses `.nvmrc`
(22). The Vercel project's Node.js version must be 22.x or 24.x.

### Serverless launch options

`serverlessLaunchOptions` uses the package's executable and its recommended
flags, headless, with `chromiumSandbox: false`, except:

- **Flags that weaken page isolation are removed** (`hardenServerlessArgs`).
  They are meant for scraping, and the renderer loads one page of its own
  origin:
  - dropped whole (`DROPPED_SERVERLESS_ARGS`): `--disable-web-security`,
    `--allow-running-insecure-content`, `--disable-site-isolation-trials`;
  - removed from the feature lists (`DROPPED_SERVERLESS_FEATURES`):
    `IsolateOrigins` and `site-per-process` from `--disable-features`, and
    `SharedArrayBuffer` from `--enable-features`.
    `AudioServiceOutOfProcess` stays disabled.
  - Everything else is kept, because it may be what lets the build start in a
    function: `--single-process`, `--no-zygote`, `--no-sandbox`,
    `--disable-setuid-sandbox`, `--in-process-gpu`, `--ignore-gpu-blocklist`.
    No Linux launch was possible to prove otherwise.
  - A unit test pins the package's flag list and the hardened result, so an
    upgrade that changes the flags fails until reviewed.
- **WebGL off** (`setGraphicsMode = false`): a CV draws no WebGL, so the build
  does not switch to its SwiftShader software GPU.
- **Sandbox off:** a Vercel or Lambda function cannot provide Chromium's
  process sandbox (no user namespaces, no setuid helper), and the build runs
  `--single-process --no-sandbox`. In one process, site isolation separates
  nothing either. Removing the flags above restores Chromium's default web
  security; it does not provide process isolation.

**Residual risk, stated plainly.** Suppose a Chromium bug in HTML, CSS, font
or image handling is reached by the page. The code it runs then runs as the
function's own user, with no sandbox between it and the function.

- The environment allowlist (`CHROMIUM_ENV_ALLOWLIST`) limits what Chromium
  inherits. It does not limit what such code can reach: the same user can
  read the Node process's environment (`/proc/<ppid>/environ`), and with it
  every deployment secret.
- The compensating controls make such a bug hard to reach, not harmless:
  - **Input:** the page renders only this app's own content: the stored
    resume, or a draft for the same resume, through the Preview's own
    sanitizer. Client-supplied script never runs.
  - **Egress:** the request policy and redirect refusal (`render-policy.ts`,
    `route-guard.ts`) allow reads of the app's own origin and the Google Fonts
    endpoints only. No attacker-hosted content is loaded, and there is no
    channel to send anything out.
  - **What is left** is Chromium's parsers and decoders, fed by that content.
    Keep `@sparticuz/chromium` and `playwright-core` current, together (see
    "Version pin").
  - A fresh browser per request, always closed, and the function's own
    isolation from other deployments.
- **Inflated once per instance:** the inflation is shared as a single promise,
  so two cold-start renders do not write the same `/tmp` file at once. A failed
  inflation is retried on the next request.

Importing `@sparticuz/chromium` on a Vercel or Lambda host sets
`LD_LIBRARY_PATH`, `FONTCONFIG_PATH` and `HOME` in `process.env`
(`build/helper.js`, `setupLambdaEnvironment`). All three are on the
environment allowlist, and the allowlist is read after the import. The
package is imported lazily, only on the serverless runtime, so a local server's
environment is never touched.

## Bundling

- `@sparticuz/chromium` and `playwright-core` are both in Next's built-in
  `serverExternalPackages` list (`node_modules/next/dist/lib/server-external-packages.json`),
  so they are not bundled and need no config entry.
- Output tracing follows the package's JavaScript, but not its `bin/*.br`
  archives, which it opens by a computed path. `next.config.js`
  `outputFileTracingIncludes` adds that folder to this route only, at its real
  path in pnpm's store, which is where the traced JavaScript looks for it.
  - The key is the picomatch glob `/api/resumes/*/download-pdf`. A literal
    `[id]` would be read as a character class and match nothing.
- To check after a build: `.next/server/app/api/resumes/[id]/download-pdf/route.js.nft.json`
  must list `chromium.br`, `fonts.tar.br`, `swiftshader.tar.br` and
  `al2023.tar.br`, plus the substitute fonts' stylesheets and WOFF2 files
  under `node_modules/@fontsource/` (see "Substitutes" below). The route's
  function size is the sum of the files it
  lists plus `route.js`. Vercel's limit is 250 MB uncompressed. No other route's
  trace includes the archives.

## Function limits (Vercel)

| Limit | Setting | Source |
| --- | --- | --- |
| Runtime | `export const runtime = 'nodejs'` in the route | route |
| Duration | `export const maxDuration = 60` in the route; the render's own deadline is 30 s | route |
| Memory | Vercel default, no `vercel.json` | plan |
| Request body | 4.5 MB, enforced by Vercel before the route runs | platform |
| `/tmp` | the inflated browser and fonts are written there | platform |

- **Duration:** 60 s is accepted on every plan. Without Fluid compute it is
  the Hobby maximum; with Fluid compute every plan allows more.
- **Memory:** the default (2 GB with Fluid compute) is assumed to be enough for
  the route's two concurrent renders per instance
  (`MAX_CONCURRENT_RENDERS`). It has not been measured on Vercel.
  - Hobby cannot change memory; Pro can, in the project's Functions settings.
  - No `vercel.json` is added, because with Fluid compute memory is a
    dashboard setting.
- **Request body:** the route accepts larger bodies than Vercel does. A draft
  plus a large photo over 4.5 MB is refused by Vercel with a plain-text 413.
  The client shows `resumes.pdfPhotoTooLarge` for any 413 when a photo was
  sent (US-002). Without a photo, the generic error is shown.

The plan figures above are from Vercel's documentation as known at the time of
writing. They were not re-checked against the live docs, and the owner should
confirm them for this project's plan.

## Which origin the renderer opens

`resolveRenderOrigin` (`render-policy.ts`), first match wins:

1. On a preview deployment (`VERCEL_ENV=preview` with `VERCEL_URL` set):
   `https://${VERCEL_URL}`. This is the deployment's own URL, set by the
   platform at runtime, not taken from a request.
   - Not `NEXT_PUBLIC_APP_URL`: it is inlined at build time and may name
     production, so a preview would otherwise send its user's session to
     production and print production's code.
   - Not the branch alias, which can move to a newer deployment during a render.
   - A `VERCEL_URL` that is not a bare host fails closed (503); it never falls
     back.
2. `NEXT_PUBLIC_APP_URL`, then `NEXTAUTH_URL`: http(s), no credentials, origin
   only.
3. Neither: 503.

`VERCEL_ENV` and `VERCEL_URL` are Vercel system environment variables. They
reach the function when the project exposes system environment variables,
which is Vercel's default.

## Deployment Protection

If preview deployments are protected (Vercel Authentication or password), the
renderer is an unauthenticated browser. Its request for the Preview page gets
Vercel's login wall, and the render fails at `navigate`.

The route supports Vercel's **Protection Bypass for Automation**:

- **Owner action:** enable it in the Vercel project (Settings → Deployment
  Protection). Vercel then provides `VERCEL_AUTOMATION_BYPASS_SECRET` to the
  deployment.
- When that variable is set, `route-guard.ts` adds `x-vercel-protection-bypass`
  to the server-side fetch of requests to the trusted app origin only. It is
  never added for the font hosts.
- It is not set through `extraHTTPHeaders`, which would send it to every host.
  The page's scripts never see it.
- The value is removed from render-failure logs, as session cookie values are.
- It is kept out of Sentry. The renderer's request for the Preview page is an
  ordinary server request, and `@sentry/nextjs` copies every request header
  into a sampled transaction. It does this in `request.headers`, and again as
  `http.request.header.*` span attributes, masked only for names containing
  `auth`, `token`, `secret`, `cookie`, `key` and a few others. This header's
  name matches none of them.
  - `sentry.server.config.ts` and `sentry.edge.config.ts` (the middleware
    sees the request too) therefore strip headers, cookies, payload, user and
    every `http.request.header.*` attribute from errors and transactions
    (`src/lib/sentry-server-scrub.ts`).
- Unset, requests go out exactly as before.

## Fonts on the server

The serverless Chromium has one system font: Open Sans, from the package's
`fonts.tar.br`. Three kinds of font reach a printed resume there:

- Google Fonts families load over the network, as in the user's browser (the
  renderer's one network exception).
- The app's own `next/font` Inter is served from the app's origin.
- **Metric-compatible substitutes** stand in for the system fonts the server
  lacks (owner decision, 2026-10-13). Metric-compatible means the same
  advance width for every glyph, so the text breaks into the same lines and
  pages. They are listed below.

### Substitutes

`src/lib/pdf/font-substitutes.ts`, `FONT_SUBSTITUTES`:

| Replaced font | Stand-in | npm package (OFL-1.1) |
| --- | --- | --- |
| Arial | Arimo | `@fontsource/arimo` |
| Calibri | Carlito | `@fontsource/carlito` |
| Georgia | Gelasio | `@fontsource/gelasio` |

- **Where:** on the serverless runtime only. A font registered by the page
  wins over an installed font of the same name. On a developer machine the
  real Arial, Calibri and Georgia print, exactly as before.
- **How:** each stand-in is registered in the headless page under the
  replaced font's name, as a `FontFace` added to `document.fonts` by an init
  script. That init script runs on the app's own origin only.
  - Sources are inline `data:` WOFF2 URLs: no request leaves the page, and
    `font-src` already allows `data:`.
  - Each script subset carries its `unicode-range`, so only the subsets a CV
    uses are decoded.
  - No `<style>` element is added, so the document React hydrates is
    untouched.
- **Not fontconfig:** the packages ship WOFF2 and WOFF only. Chromium's own
  web-font decoder reads those (the Google Fonts already take that path), and
  it can be checked on any machine. Whether the serverless build's FreeType
  reads WOFF2 as a system font could not be checked.
- **Faces:** 400 and 700, regular and italic. Those are the faces the
  replaced fonts have. Medium (500) resolves to regular and semibold (600) to
  bold, as it does with the real font.
- **Failures fail loudly:**
  - the faces are read once per instance, and a failed read fails the render
    at stage `fonts`;
  - a registered face that fails to load fails it at `settle`.
- **Files:** read from `node_modules/@fontsource/<package>` under
  `process.cwd()`. `next.config.js` `outputFileTracingIncludes` lists the
  four stylesheets and their WOFF2 files for this route, at that same path. A
  unit test keeps that list equal to `FONT_SUBSTITUTES`.
- **Not added:** Tinos (Times New Roman), Caladea (Cambria) and Cousine
  (Courier New). Times New Roman and Cambria come after Georgia in
  `font-serif`, so they are never reached. Monospace text appears only in the
  layout controls, which do not print.

### Evidence

`e2e/pdf-font-substitutes.spec.ts` prints one deterministic, CV-shaped,
multi-page document twice in the same Chromium:

1. with the real installed font;
2. with the production registration of its stand-in under the same name.

It then requires the same page count, and the same lines of text in each
column of every page, at the same heights.

- It runs only on Windows or macOS where the real font is installed. On Linux,
  fontconfig answers for these names with a look-alike, so the cases are
  skipped. CI runs on Linux, so this evidence is local.
- Registering Arimo under "Georgia" makes it fail, so the comparison does
  catch a font that is not metric-compatible.

### What the server prints, compared with a Windows user's own print

| Resume font | Windows print | Server print | Result |
| --- | --- | --- | --- |
| No font chosen (body) | `next/font` Inter | same | same |
| Source Sans, IBM Plex Sans, Roboto, Lato, Open Sans, PT Sans, Noto Sans | Google Fonts | same | same |
| Arial | Arial | Arimo | same lines and pages |
| Helvetica (`'Helvetica Neue', Helvetica, Arial`) | Arial, since Windows has no Helvetica | Arimo | same lines and pages |
| Calibri | Calibri | Carlito | same lines and pages, except text in `font-light`: Calibri Light on Windows, Carlito Regular on the server |
| Classic's default title and headings (`font-serif`) | Georgia | Gelasio | same lines and pages; a baseline can sit up to 1 pt higher or lower inside an unchanged line box |
| Avenir (`'Avenir Next', Avenir, 'Nunito Sans'`) | Nunito Sans, since Windows has no Avenir | same | same |
| Segoe UI (`'Segoe UI', 'Open Sans'`) | Segoe UI | Open Sans | **differs**: no free metric-compatible Segoe UI |
| Verdana | Verdana | Open Sans | **differs**: no free metric-compatible Verdana |
| Inter (picker entry, `'Inter', sans-serif`) | the system Inter if installed, else Arial (Windows' `sans-serif`) | Open Sans | **differs**: `'Inter'` is not the name `next/font` registers, and a page cannot redefine the generic `sans-serif` |

On macOS the picture differs where macOS has a font Windows lacks. Helvetica
Neue and Avenir print in their real faces there and as their stand-ins on the
server.

Gelasio's vertical metrics are close to Georgia's but not identical. Every
template sets a fixed line height (Tailwind's 1.5 base, its text sizes' line
heights, `leading-relaxed`), so line boxes, and therefore pages, are
unchanged. Under `line-height: normal`, which no template uses, Gelasio's
lines are slightly shorter and the difference accumulates.

Chromium on Linux also hints and positions glyphs differently from Windows
(`--font-render-hinting=none` is one of the package's flags). The parity
suite already records a Linux-only difference for Professional.

## CI

The E2E job (`.github/workflows/ci.yml`) renders real PDFs through the route
on an `ubuntu-latest` runner, with the local runtime's sandboxed Chromium.

- Ubuntu 24.04 sets `kernel.apparmor_restrict_unprivileged_userns=1`. That
  denies the user namespace Chromium's sandbox needs to any binary without an
  AppArmor profile, and Playwright's Chromium has none.
- On PR #108 every render therefore failed at `launch`, with Playwright's
  `Target page, context or browser has been closed`.
- The test runner's own browsers were unaffected because Playwright launches
  them with the sandbox off.
- The job lifts that restriction on its throwaway runner (`sysctl`, only if
  the key exists) before the tests. A smoke step then launches a sandboxed
  Chromium, and fails with Chromium's full message if it still cannot start.
  The route logs only the first line of a launch error.
- The product keeps the sandbox on and fails closed. A Linux server outside
  Vercel/Lambda needs the same host setting, or an AppArmor profile for its
  Chromium.
- No other CI job calls the route. Parity renders from `e2e/parity` only.
- `e2e/pdf-font-substitutes.spec.ts` is skipped on the Linux runner (see
  "Evidence" above).

## Measuring generation time

Locally: a production build (`pnpm build && pnpm start`, as the e2e
`webServer` does). Time the route's POST from the client:

- **cold:** the first PDF request after the server starts;
- **warm:** the requests after it.

A fresh Chromium is launched for every request, so warm means only that the
server process and the OS file cache are warm. On Vercel, a cold request
also includes inflating the browser into `/tmp`. The results are recorded per
story in `tasks/ralph/progress.txt`, not here.
