import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // The retrieval core is framework-free, and the linter holds that line rather
  // than a reviewer having to notice (ADR-0007, specs.md §3).
  //
  // Why it matters: `scripts/eval.ts` runs the entire pipeline headless, with no
  // server. One `import { NextRequest } from "next/server"` inside src/lib/rag
  // breaks that, and it breaks it at the moment I most need the eval harness to
  // work. It is also the property that keeps the core unit-testable and would
  // make extracting a service later a move rather than a rewrite.
  //
  // This rule is the whole enforcement mechanism for that constraint. Deliberate
  // exceptions would need an inline disable stating why; there are none.
  {
    files: ["src/lib/rag/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "server-only", "client-only"],
              message:
                "src/lib/rag must stay framework-free so scripts/eval.ts can run it headless (ADR-0007). Take plain arguments, return plain values; let the route handler do the Next-specific work.",
            },
          ],
        },
      ],
    },
  },

  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
