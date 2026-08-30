import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Traces the app's actual dependencies into `.next/standalone`, so the runtime
   * image ships those instead of the whole `node_modules` tree. The difference is
   * roughly an order of magnitude, and image size is the part of "containerised"
   * a reviewer feels — it is what they wait for.
   */
  output: "standalone",

  /**
   * pdfjs resolves its worker at runtime by path, and the bundler rewrites that
   * path to a chunk it never emits — so PDF ingestion fails inside Next with
   * "Cannot find module .../pdf.worker.mjs" while working perfectly under plain
   * Node. Opting it out of Server Components bundling restores a normal
   * `require`, and the worker resolves relative to node_modules as pdfjs expects.
   *
   * Found by uploading through the running app. The scripts path (tsx, no
   * bundler) had been green throughout, which is the useful lesson: the seed
   * script is not a substitute for exercising the real route.
   */
  serverExternalPackages: ["pdfjs-dist"],

  /**
   * ...and the same worker again, for the standalone build.
   *
   * `serverExternalPackages` restores the runtime `require`, but tracing decides
   * what is actually *in* the image, and it only follows static imports. pdfjs
   * resolves `pdf.worker.mjs` by path when `getDocument()` runs, so the trace
   * never sees it: `.next/standalone` ships `pdfjs-dist` as the single file
   * `legacy/build/pdf.mjs`, and the first upload into the container dies with
   * "Setting up fake worker failed". Dev is immune — Turbopack symlinks
   * `.next/node_modules/pdfjs-dist-<hash>` at the real package, where the whole
   * build directory is present.
   *
   * The same blind spot costs `@napi-rs/canvas`, pdfjs's optional source of
   * `DOMMatrix`; that one is answered in `src/lib/rag/extract-pdf.ts` rather than
   * here, because 31 MB of Skia to evaluate a module is a poor trade for a path
   * that rasterises nothing.
   *
   * The route glob is matched against the route path, so the dynamic segment is
   * written as `*`. Verify after changing it: a key that matches nothing is a
   * silent no-op, which is the same failure this is fixing.
   *
   * Turbopack traces the worker's 5.4 MB source map alongside it, and
   * `outputFileTracingExcludes` does not drop it — tried as both a `**` glob and
   * the exact path. Accepted rather than worked around: Node reads source maps
   * only under `--enable-source-maps`, so it is inert weight, and the obvious
   * `RUN rm` in the runner stage would not shrink the image anyway, because the
   * file would still sit in the layer the COPY created. Deleting it in the
   * builder, before the COPY, is where that belongs if it is ever worth 5.4 MB.
   */
  outputFileTracingIncludes: {
    "/api/collections/*/documents": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },

  /**
   * The dev-only route indicator, off.
   *
   * It renders bottom-left by default, which is exactly where the theme and
   * provider toggles live, so it sat on top of controls a reviewer is meant to
   * click. `position: "bottom-right"` would also clear them and keep the
   * indicator; off is the choice here because the sidebar's bottom row is the
   * one part of the UI a screenshot has to show unobstructed.
   *
   * Dev only either way: the containerised app runs a production build and never
   * rendered it. Compile and runtime errors are still surfaced.
   *
   * Note for anyone porting a config from an older Next: `buildActivity` and
   * `buildActivityPosition` were removed in v16, and setting them here does
   * nothing. `devIndicators: false` is the v16 spelling.
   */
  devIndicators: false,
};

export default nextConfig;
