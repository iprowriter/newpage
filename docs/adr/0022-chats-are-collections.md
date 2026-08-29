# 0022. A chat is a collection with a different kind

**Status:** Accepted
**Date:** 2026-08-29
**Supersedes part of:** [ADR-0019](0019-ui-shape-and-flow.md) (the seeded "Quick start" collection)

## Context

Collections are curated, named, departmental. But the common case of "I have one
document and I don't want to file it anywhere yet" fitted badly: the seeded *Quick start*
collection existed precisely to absorb it, and a permanent shared collection is a poor home for a
throwaway document.

The ask was a chat-client shape: a **New chat** action creating an isolated space with its own
upload, listed separately, and promotable into a collection later.

## Options considered

**A separate `Chat` model.** The obvious reading of the request. Rejected, and this is the whole
decision: a document would then belong to one of *two* things, retrieval would need two filters,
and the isolation invariant (`specs.md` §7.3) would need to hold in two shapes. Every guarantee
already proved — the single entry point, the payload filter, the defensive cross-check — would
have to be re-proved for the second shape, and "promote" would be a migration between two worlds.

**Chats as a flag on Collection.** `kind: collection | chat`. One model, one filter, one
invariant. Promotion becomes a reassignment of `collectionId`.

## Decision

`CollectionKind { collection, chat }` on the existing model.

- A chat is created empty, named "New chat", and **takes the name of its first document** — the
  convenience a chat client gives by titling a thread after its opening message.
- Promotion re-points the chat's documents and chunks at the target collection, updates the
  Qdrant payloads, and deletes the now-empty chat.
- `Collection.name` loses its unique constraint: chats are created unnamed and in bulk, and two
  "New chat" rows colliding is not an error worth raising at anyone.
- The seeded *Quick start* collection is removed. It existed to give a one-off document
  somewhere to go, which is now exactly what a chat is.

## Consequences

- Chats inherit isolation, retrieval, tracing and the eval path unchanged. Nothing needed a
  second code path, which is the entire return on this choice.
- **Promotion is the first operation that moves the isolation boundary of existing data.** Qdrant
  is updated first, then Postgres in a transaction. A failure between them leaves a chunk whose
  payload and row disagree — and `retrieve.ts` already throws on exactly that, so a half-move is
  *detectably* broken rather than quietly readable from a collection it has left. The defensive
  check written for a bug that "should never happen" turned out to be the safety net for a
  feature that did not exist when it was written.
- Verified end to end: promoting a 42-chunk chat moved Manufacturing Quality from 292 to 334
  chunks, Qdrant point counts matched Postgres per collection exactly (486 + 334 + 35 = 855, the
  full total), and the promoted content answered correctly under its new scope.
- Chats accumulate. There is no retention policy and no archive; at real usage that list needs
  one. Noted for productionisation rather than solved here.
- `name` no longer being unique means seeding find-or-creates rather than upserts, and two
  collections *can* now share a name if someone insists. The API still rejects duplicates for
  `kind: collection`, which is where it matters.
