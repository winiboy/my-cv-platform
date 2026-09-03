import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktrees hold a full duplicate copy of src/. Linting them double
    // counted every problem locally (623 instead of 311) and made local lint
    // disagree with CI, where these untracked directories do not exist.
    ".claude/**",
    // The E2E suite's build output. ESLint's ignore list is separate from
    // .gitignore, and the default only knows about ".next" - so the first E2E
    // run took lint from 311 problems to 46,067 by linting compiled bundles.
    ".next-e2e/**",
    ".next-verify/**",
    "test-results/**",
    "playwright-report/**",
  ]),
  {
    // Playwright specs are not React, and two rules misfire on them.
    //
    // react-hooks/rules-of-hooks reads Playwright's fixture callback -
    // `async ({ page }, use) => { ... await use(value) }` - as React's `use`
    // hook, and reports calling it inside try/catch. The try/finally is what
    // guarantees the test user is deleted even when a test fails, so the code
    // is right and the rule is wrong about what it is looking at.
    //
    // no-unused-vars flags a requested-but-unused fixture, e.g.
    // `async ({ page, authedUser })` where the body only uses `page`. Naming
    // the fixture is what activates it: Playwright runs only the fixtures a
    // test asks for. Dropping the name to satisfy the linter would silently
    // skip the login - which happened during this suite's first run.
    files: ["e2e/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
]);

export default eslintConfig;
