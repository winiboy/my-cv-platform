// eslint-disable-next-line @typescript-eslint/no-require-imports
const { execSync } = require("child_process");

/**
 * Get the current Git branch name at build time.
 * Prioritizes Vercel's environment variable for deployed environments.
 */
function getGitBranch() {
  // Vercel provides this environment variable during builds
  if (process.env.VERCEL_GIT_COMMIT_REF) {
    return process.env.VERCEL_GIT_COMMIT_REF;
  }

  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return branch || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Get the package version from package.json at build time.
 * Returns "unknown" if reading fails.
 */
function getPackageVersion() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./package.json").version;
  } catch {
    return "unknown";
  }
}

/**
 * Origins the browser is actually allowed to reach, resolved at build time.
 *
 * Keep this list derived from code, not from guesswork: an over-broad policy
 * buys nothing and an over-narrow one breaks the product. Each entry below
 * names the file that needs it.
 */

/**
 * The Supabase project origin. The browser client talks to PostgREST and
 * /auth/v1 directly (src/lib/supabase/client.ts), so its origin must be in
 * connect-src. Falls back to the *.supabase.co wildcard when the variable is
 * absent from the build environment, which keeps the policy useful in CI
 * instead of silently dropping the directive.
 */
function getSupabaseOrigin() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) {
    return "https://*.supabase.co";
  }
  try {
    return new URL(raw).origin;
  } catch {
    return "https://*.supabase.co";
  }
}

// Sentry ingest host for the browser SDK. The DSN itself lives in
// src/instrumentation-client.ts; a next.config.js cannot import that module, so
// the host is repeated here. Change both together if the DSN ever changes.
const SENTRY_INGEST_ORIGIN = "https://o4510522193412096.ingest.de.sentry.io";

// @imgly/background-removal downloads its ONNX model chunks from this CDN at
// runtime (src/lib/image/remove-background.ts, dynamic import).
const IMGLY_ASSET_ORIGIN = "https://staticimgly.com";

/**
 * Build the Content-Security-Policy value.
 *
 * Shipped in report-only mode (see securityHeaders below). BEFORE SWITCHING TO
 * ENFORCED, verify all of the following in a browser with the report-only
 * header active and the console open:
 *
 *   1. script-src still carries 'unsafe-inline'. Next's App Router streams the
 *      RSC payload through inline <script>self.__next_f.push(...)</script> tags
 *      with no nonce. Removing 'unsafe-inline' requires a nonce minted in
 *      src/middleware.ts and threaded through, which is a separate change.
 *      Until then script-src is advisory only - the value of enforcing this
 *      policy is in img-src / font-src / connect-src / frame-ancestors, which
 *      is exactly what turns the M1 sanitiser escape from "beacon fires" into
 *      "beacon blocked".
 *   2. The resume print path. Templates render inline style="..." attributes
 *      server-side and the profile photo is a base64 data: URL, so style-src
 *      needs 'unsafe-inline' and img-src needs data:. Exercise window.print()
 *      on every one of the five templates.
 *   3. The cover-letter PDF export (html2pdf.js -> html2canvas + jsPDF).
 *      html2canvas clones the document into an about:blank iframe and jsPDF
 *      hands back a blob: URL; confirm frame-src and img-src cover it.
 *   4. Profile-photo background removal. onnxruntime-web compiles WASM and
 *      spawns a worker from a blob: URL, and pulls model chunks from
 *      staticimgly.com. Confirm 'wasm-unsafe-eval' is sufficient and that no
 *      violation asks for 'unsafe-eval' in a production build.
 *   5. Google OAuth sign-in, then the dashboard user menu: profiles.avatar_url
 *      is populated from the provider's raw_user_meta_data and renders as a
 *      lh3.googleusercontent.com <img>.
 *
 * Then add upgrade-insecure-requests (ignored in report-only mode) and rename
 * the header to Content-Security-Policy.
 */
function buildContentSecurityPolicy(isDev) {
  const directives = [
    // Floor for anything not named below (media, manifest, prefetch).
    "default-src 'self'",

    // Nothing in the app emits <base>; an injected one would rewrite every
    // relative URL on the page.
    "base-uri 'none'",

    // No <object>/<embed> anywhere.
    "object-src 'none'",

    // The app is never legitimately framed. This is the modern replacement for
    // X-Frame-Options, which is sent alongside for older agents.
    "frame-ancestors 'none'",

    // Every form posts back to the app's own route handlers. Supabase OAuth
    // leaves by navigation, not by form submission, so it is unaffected.
    "form-action 'self'",

    // 'unsafe-inline': Next's inline RSC bootstrap - see note 1 above.
    // 'wasm-unsafe-eval' + blob:: onnxruntime-web behind
    //   @imgly/background-removal compiles WASM and starts a blob: worker.
    // 'unsafe-eval' in development only: React Refresh / HMR.
    [
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
      isDev ? " 'unsafe-eval'" : "",
    ].join(""),

    // 'unsafe-inline': the resume templates render style="..." attributes
    //   server-side; removing it would break every template.
    // fonts.googleapis.com: the font-picker stylesheet in src/app/layout.tsx.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

    // next/font self-hosts Inter; fonts.gstatic.com serves the picker families;
    // data: covers fonts inlined into the PDF/print path.
    "font-src 'self' data: https://fonts.gstatic.com",

    // data:: the profile photo is persisted as a base64 data URL in the resume
    //   layout settings. blob:: background-removal output and html2canvas.
    // lh3.googleusercontent.com: Google OAuth avatar (profiles.avatar_url).
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",

    // Browser fetches: the app's own routes, Supabase, Sentry, and the
    // background-removal model CDN. ws:/localhost added for the dev overlay.
    [
      "connect-src 'self'",
      getSupabaseOrigin(),
      SENTRY_INGEST_ORIGIN,
      IMGLY_ASSET_ORIGIN,
      isDev ? "ws://localhost:* http://localhost:*" : "",
    ]
      .filter(Boolean)
      .join(" "),

    // onnxruntime-web starts its worker from a blob: URL. child-src repeats it
    // for agents that do not implement worker-src.
    "worker-src 'self' blob:",
    "child-src 'self' blob:",

    // html2canvas clones the page into an iframe during PDF export.
    "frame-src 'self' blob:",
  ];

  // Optional collector, so report-only mode is not silent in production. Set
  // CSP_REPORT_URI to a Sentry security endpoint or equivalent.
  if (process.env.CSP_REPORT_URI) {
    directives.push(`report-uri ${process.env.CSP_REPORT_URI}`);
  }

  return directives.join("; ");
}

/**
 * Browser features the app does not use. Denying them limits what an injected
 * script or a compromised dependency can ask the user for.
 */
const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "camera=()",
  "display-capture=()",
  "encrypted-media=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "picture-in-picture=()",
  "publickey-credentials-get=()",
  "screen-wake-lock=()",
  "serial=()",
  "usb=()",
  "xr-spatial-tracking=()",
].join(", ");

/**
 * Security response headers applied to every route, page and API alike.
 * Closes Phase 30 finding M3 (no security response headers).
 */
function buildSecurityHeaders() {
  const isDev = process.env.NODE_ENV !== "production";

  const headers = [
    // Report-only for now: a policy that breaks the print path or the PDF
    // export would take the core product down. See buildContentSecurityPolicy
    // for the checklist that has to pass before this becomes enforcing.
    {
      key: "Content-Security-Policy-Report-Only",
      value: buildContentSecurityPolicy(isDev),
    },
    // Enforced today, and independent of the CSP rollout above.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  ];

  // HSTS only in production. Browsers apply HSTS to https://localhost too, and
  // a two-year pin there would break plain-http local development for anyone
  // who once ran the local-ssl-proxy dev setup.
  //
  // 'preload' is deliberately omitted: it commits the apex domain and every
  // subdomain to HTTPS-only in browser binaries, and removal takes months. Add
  // it - and submit to hstspreload.org - only once the owner confirms no
  // subdomain of the production apex needs plain HTTP.
  if (!isDev) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }

  return headers;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build output directory. Overridable so the E2E suite can build into
  // .next-e2e instead of sharing .next with a dev server the developer may
  // already have running - a shared cache between two Next processes produced
  // intermittent "Unexpected end of JSON input" 500s. Defaults to .next, so
  // normal builds and deploys are unaffected.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // NOTE: `swcMinify: false` used to sit here. Next 15 removed the option
  // entirely - it is now an unrecognized key that Next warns about and ignores,
  // so keeping it would have been dead config that merely looked load-bearing.
  //
  // It existed because onnxruntime-web (via @imgly/background-removal) uses
  // `new URL("file.mjs", import.meta.url)`, which makes webpack emit .mjs files
  // as separate assets, and the Next 14 SWC minifier mangled them: it did not
  // set `module: true` for a .mjs asset, so top-level ESM syntax and
  // `import.meta` did not survive minification. Terser detected the extension
  // and did.
  //
  // Verified on Next 15.5.26 that the defect no longer reproduces. The two
  // emitted assets (ort.bundle.min.*.mjs and ort.webgpu.bundle.min.*.mjs) are
  // still reprocessed by the minifier - 399,902 bytes in, 390,680 out - and
  // both pass `node --check` as ES modules with their four `import.meta`
  // references intact. If a future Next regresses this, the replacement is an
  // `optimization.minimizer` override in the webpack hook below, not this key.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'onnxruntime-node': false,
      };
      config.resolve.fallback = {
        ...config.resolve.fallback,
        module: false,
      };
    }
    return config;
  },
  env: {
    NEXT_PUBLIC_GIT_BRANCH: getGitBranch(),
    NEXT_PUBLIC_APP_VERSION: getPackageVersion(),
  },

  // `next build` does not lint. `pnpm lint` does, at full strictness, and it is
  // the only thing that does - which is exactly the arrangement that existed
  // before Next 15 and that docs/engineering/quality-contract.md describes:
  // lint is "Reported, not required", the CI lint job is deliberately
  // non-blocking, and the ~235 `@typescript-eslint/no-explicit-any` errors in
  // src/app/api are tracked debt awaiting their own phase.
  //
  // Next 14 already printed "Linting and checking validity of types" during a
  // build, but it could not read this repo's ESLint 9 flat config, so it
  // silently linted nothing and the debt never reached the build. Next 15 added
  // flat-config support, which turned that same untouched debt into a hard
  // build failure overnight.
  //
  // Nothing is being weakened here: no rule is downgraded, no file is excluded,
  // and the error count is unchanged and still reported. This only stops the
  // build from duplicating a gate the project deliberately keeps separate.
  // Delete this once the lint-debt phase brings the error count to zero.
  eslint: {
    ignoreDuringBuilds: true,
  },

  async headers() {
    return [
      {
        // Every route: pages, static assets and API handlers alike.
        source: "/:path*",
        headers: buildSecurityHeaders(),
      },
    ];
  },
};

module.exports = nextConfig;


// Injected content via Sentry wizard below

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(
  module.exports,
  {
    // For all available options, see:
    // https://www.npmjs.com/package/@sentry/webpack-plugin#options

    org: "cv-website",
    project: "javascript-nextjs",

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    // tunnelRoute: "/monitoring",

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,
  }
);
