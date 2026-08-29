<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Newpage take-home — document assistant

RAG over a document collection, with citations and an honest refusal. Take-home for Newpage
Solutions (life sciences digital engineering). **Read `specs.md` for the design and
`docs/adr/` for why.** Decisions are recorded, numbered and occasionally superseded; do not
re-litigate a closed one without reading its ADR first.

## Non-negotiables

These are the invariants. Breaking one is a bug even when the tests pass.

1. **`src/lib/rag/**` never imports from `next`.** Enforced by an ESLint rule. It is what lets
   `scripts/eval.mts` drive the whole pipeline headless. `@opentelemetry/api` is allowed there —
   it is a façade that no-ops without an SDK.
2. **Retrieval is only ever reached through `retrieve()` in `src/lib/rag/retrieve.ts`**, which
   takes `collectionId` as a *required* argument and builds the Qdrant filter itself. Isolation
   is a payload filter, not a physical partition (ADR-0010), so a forgotten filter leaks
   silently. There is a defensive cross-check that throws; do not soften it.
3. **Model ids are pinned in `src/lib/env.ts`**, never a floating alias (ADR-0014). Every eval
   number traces back to an exact model.
4. **Two representations per chunk**: `embedText` carries the heading breadcrumb, `displayText`
   does not. Offsets must slice `displayText` back out of the source exactly.
5. **Two stores, one ordering**: Qdrant first, then Postgres — on delete, on promote, everywhere.
   Both orders can fail; only one fails toward the inert state (`specs.md` §10).

## Commands

```
docker compose up                  everything: migrate, seed, app, Jaeger
npm run dev                        app only (data layer must be up)
npm run seed                       ingest corpus; backfills starter questions
npm run eval                       full harness
npm run eval -- --retrieval-only   deterministic half: seconds, free
npm run eval -- --provider ollama  the local column
npm test / npm run typecheck       29 tests / tsc
```

Host ports are deliberately high (55432, 56333) so `docker compose up` cannot collide with a
Postgres or Qdrant the reviewer already runs.

## Traps found the hard way

Each of these cost a debugging cycle. They are listed because they will not be obvious next time.

- **`prisma format` rewrites column alignment**, so a patch matching exact whitespace silently
  no-ops. Patch schema changes line-wise, and abort on a missed pattern rather than writing
  nothing.
- **Compose `environment:` outranks `env_file:`.** `FOO: ${FOO:-}` sets an empty string that
  *beats* the value in `.env.local`. Only container-specific addresses belong in `environment:`.
- **Healthchecks that cannot pass turn `depends_on` into a hang.** Hit twice: Qdrant's image has
  no bash for `CMD-SHELL` `/dev/tcp`, and Jaeger v2 dropped the v1 `all-in-one-linux` binary.
  Verify a probe inside the container before trusting it.
- **Qdrant point ids must be an unsigned integer or UUID.** cuid is rejected; chunk ids are UUIDs.
- **pdfjs fails under the Next bundler** (`pdf.worker.mjs` not emitted). Fixed by
  `serverExternalPackages`. The seed script runs on plain Node and hid this for days — exercise
  the real route.
- **Anything reading the database at build time must be `force-dynamic`**, or `next build` fails
  in Docker where no database exists.
- **Tailwind v4 utilities live in `@layer utilities`; anything written in `globals.css` after the
  import is unlayered and wins regardless of specificity.** A utility that appears to do nothing
  is probably losing to a global rule.

## House style

Comments explain *why*, especially where the obvious choice was rejected — the ADRs and the code
should agree. British spelling throughout. Sentence case in UI copy, two font weights (400/500),
no emoji, semantic CSS variables only (never a hardcoded hex — that is what breaks dark mode).
