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
  ]),
]);

export default eslintConfig;
