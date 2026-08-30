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
