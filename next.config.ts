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
};

export default nextConfig;
