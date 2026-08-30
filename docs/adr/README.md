# Architecture decision records

One file per decision. Numbered, immutable once accepted — if a decision changes, write a new
ADR that supersedes the old one rather than editing history.

Why bother on a take-home: the brief asks for "key technical decisions you made and why" and
"choices considered and final choice". Recording them as I go means the submission README is
assembled from decisions I actually made at the time, not reconstructed at the end. It also
keeps the reasoning mine rather than something backfilled by a model.

| # | Decision | Status |
|---|---|---|
| [0001](0001-choose-option-1-chat-with-your-docs.md) | Build Option 1, Chat With Your Docs | Accepted |
| [0002](0002-collections-as-retrieval-scope.md) | Collections are the retrieval scoping primitive | Accepted |
| [0003](0003-pluggable-llm-provider.md) | Pluggable LLM provider, host-native Ollama | Accepted |
| [0004](0004-local-embedding-model.md) | Embeddings run locally, always | Accepted |
| [0005](0005-defer-voice-input.md) | Voice input is out of scope | Accepted |
| [0006](0006-typescript-node-backend-nextjs-frontend.md) | TypeScript/Node backend, Next.js frontend, two services | **Superseded by 0007** |
| [0007](0007-fullstack-nextjs.md) | Full-stack Next.js, single application | Accepted |
| [0008](0008-chromadb-and-postgres.md) | ChromaDB for vectors, Postgres for everything else | **Superseded by 0010** |
| [0009](0009-hosted-default-and-api-key-handling.md) | Gemini is the default; no key ships in the repo | Accepted |
| [0010](0010-qdrant-and-postgres.md) | Qdrant for vectors, Postgres for everything else | Accepted |
| [0011](0011-stay-on-typescript.md) | Reconsidered Python, staying on TypeScript | Accepted |
| [0012](0012-structure-aware-chunking.md) | Structure-aware chunking with heading breadcrumbs | Accepted |
| [0013](0013-langgraph-for-control-flow-only.md) | LangGraph for control flow, nothing else from LangChain | Accepted |
| [0014](0014-pin-model-ids.md) | Pin exact model IDs; never a floating alias | Accepted |
| [0015](0015-eval-design.md) | Retrieval and generation measured separately, with negative cases | Accepted |
| [0016](0016-own-the-trace-store.md) | Own the trace store; in-app viewer, OTel as production seam | Accepted |
| [0017](0017-demo-corpus.md) | Demo corpus: FDA guidance, split into department collections | Accepted |
| [0018](0018-supported-formats.md) | Supported formats: PDF and text/Markdown only | Accepted |
| [0019](0019-ui-shape-and-flow.md) | UI: one page type, grounded suggestions, refusal as a designed surface | Accepted |
| [0020](0020-no-auth-session-derived-scope-in-production.md) | No auth; production scope comes from the session | Accepted |
| [0021](0021-design-system.md) | Design system: PracticeDepth tokens, violet accent | Accepted |
| [0022](0022-chats-are-collections.md) | A chat is a collection with a different kind | Accepted |
| [0023](0023-ship-a-trace-viewer.md) | Ship a trace viewer, so the OTel claim is checkable | Accepted |
| [0024](0024-span-level-attribution.md) | Span-level attribution: lexical, client-side, allowed to decline | Accepted |
| [0025](0025-conversation-history-from-traces.md) | Conversation history is read back from the trace table | Accepted |

Use [`TEMPLATE.md`](TEMPLATE.md) for new ones.
