# Open questions

Undecided. Each becomes an ADR when closed; the closed set becomes `specs.md`.

## Closed

| Question | Resolution |
|---|---|
| App stack — one runtime or two? | [ADR-0007](adr/0007-fullstack-nextjs.md) — full-stack Next.js, one app (superseding [0006](adr/0006-typescript-node-backend-nextjs-frontend.md)) |
| Python vs TypeScript | [ADR-0011](adr/0011-stay-on-typescript.md) — TypeScript; PDF parsing gap managed by Q10 |
| Vector store | [ADR-0010](adr/0010-qdrant-and-postgres.md) — Qdrant, one collection + `collection_id` filter (superseding [0008](adr/0008-chromadb-and-postgres.md)) |
| Chunking strategy | [ADR-0012](adr/0012-structure-aware-chunking.md) — structure-aware, token-bounded, heading breadcrumbs, two sizes measured |
| Orchestration framework | [ADR-0013](adr/0013-langgraph-for-control-flow-only.md) — LangGraph for control flow only; Qdrant called directly |
| Model choices | [ADR-0014](adr/0014-pin-model-ids.md) — pinned IDs, no floating aliases |
| Default provider / key handling | [ADR-0009](adr/0009-hosted-default-and-api-key-handling.md) — Gemini default, no key in the repo |
| Eval approach | [ADR-0015](adr/0015-eval-design.md) — retrieval and generation split, negative cases included |
| Observability | [ADR-0016](adr/0016-own-the-trace-store.md) — Postgres trace store, in-app viewer, OTel seam |
| Repo name | Folder renamed to `newpage` |
| Demo corpus | [ADR-0017](adr/0017-demo-corpus.md) — FDA guidance, two department collections with overlapping vocabulary |
| Supported formats | [ADR-0018](adr/0018-supported-formats.md) — PDF via pdfjs-dist, plus text/Markdown |
| Cross-store deletion | [`specs.md` §10](../specs.md) — Qdrant first, then Postgres; `delete_failed` for reconciliation |
| Filter enforcement | [`specs.md` §7.3](../specs.md) — single retrieval entry point, `collectionId` required |

---

## Still open

### 12. Compose cold-start check

Not a design question — the one item that stays open until submission. Clone into a clean
directory, `docker compose up`, follow only the README, see whether it actually works. The risk
with containerisation isn't Docker, it's an untested compose file. Do it at least twice: once
mid-build, once at the end. ADR-0016 keeps the service count at three specifically to protect this.

---

Everything else is decided. The design lives in [`specs.md`](../specs.md); the reasoning lives in
[`adr/`](adr/).
