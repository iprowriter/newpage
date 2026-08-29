# 0013. LangGraph for control flow, nothing else from the LangChain stack

**Status:** Accepted
**Date:** 2026-08-29

## Context

Open question 4. Earlier notes leaned hand-rolled, on the grounds that a framework hides the
decisions the brief asks me to explain. That reasoning was right about *retrieval* abstractions
and wrong to generalise to orchestration.

## The distinction that settles it

A naive RAG pipeline is a straight line: query → retrieve → generate. Wrapping a straight line
in a graph framework is ceremony, and a reviewer will recognise it as such.

**But this pipeline isn't straight, and the branch is one already committed to.** Refusal on weak
retrieval (ADR-0001 consequences, Tier 0 item 4) is a conditional edge. Add one query rewrite and
retry before refusing, and it's a cycle:

```
retrieve → grade → weak?  → rewrite → retrieve (once)
                 → still weak? → refuse
                 → ok → generate with citations
```

That is a graph, the guardrail *is* the graph, and LangGraph is doing real work rather than
decorating a function call.

## Decision

**LangGraph for control flow. Nothing else from the LangChain stack.**

No retriever abstractions, no vector store wrappers, no document loaders, no chains. Qdrant is
called directly; chunking, embedding, filtering, top-k and fusion are all mine.

The line is deliberate and goes in the README: control flow is the one layer where a framework
adds structure without concealing anything, while retrieval abstractions would hide exactly the
decisions being graded. Being able to state where I'd adopt a framework and where I'd refuse one
is a better answer than either "hand-rolled everything" or "used LangChain".

## Consequences

- The guardrail becomes inspectable as a graph rather than buried in branching inside a request
  handler — which also makes it easy to draw for the architecture diagram.
- Each node is a plain function over plain state, so nodes stay unit-testable and the ADR-0007
  constraint (no `next` imports in `lib/rag/`) is unaffected.
- The retry edge needs a hard bound. One rewrite, then refuse. An unbounded loop against a paid
  API is the obvious failure mode and it needs a test.
- **Risk to check on day one, not day five:** LangGraph.js trails the Python version. Build the
  graph first so that if the JS API fights back, falling back to a hand-rolled state machine
  costs a day rather than a rewrite. The graph is small enough that this is a real fallback.
- Adds dependency weight for one capability. Accepted, but if the graph ends up with no branches
  by the end, the honest move is to drop the dependency and say so.
