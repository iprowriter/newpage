import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { ANSWER_SCHEMA, ANSWER_SYSTEM, REWRITE_SYSTEM, buildAnswerPrompt, buildRewritePrompt } from "./prompts";
import type { Provider } from "./providers/types";
import { retrieve, type RetrieveDeps } from "./retrieve";
import type { RetrievedChunk } from "./types";

/**
 * The answer graph (ADR-0013).
 *
 *        ┌──────────┐
 *        │ retrieve │◄────────────┐
 *        └────┬─────┘             │ at most once
 *             ▼                   │
 *        ┌──────────┐  weak   ┌───┴─────┐
 *        │  grade   ├────────►│ rewrite │
 *        └────┬─────┘         └─────────┘
 *             │ ok                  │ still weak
 *             ▼                     ▼
 *        ┌──────────┐          ┌─────────┐
 *        │ generate │          │ refuse  │
 *        └──────────┘          └─────────┘
 *
 * LangGraph earns its place here and would not in a straight line. The branch is
 * not decoration: **the guardrail is the graph**. Refusal on weak retrieval was
 * always going to be the most load-bearing behaviour in this system, and
 * expressing it as a conditional edge makes it inspectable, drawable, and
 * testable as a path rather than buried in `if` statements inside a request
 * handler.
 *
 * If the branches ever disappear, the honest move is to delete this dependency
 * and say so.
 */

/**
 * Calibrated, not guessed. `scripts/calibrate.mts` against the seeded corpus:
 *
 *   answerable      0.764 – 0.829
 *   out-of-corpus   0.654 – 0.682
 *   false-premise   0.636
 *   off-domain      0.397 – 0.484
 *
 * The only clean separation is between off-domain and everything else, and 0.55
 * sits in the middle of that gap. Deliberately *not* raised to ~0.72 to catch
 * out-of-corpus at this stage: the margin there is ~0.08 on a handful of samples,
 * and a threshold tuned that finely would start refusing answerable questions —
 * trading a visible failure for an invisible one.
 *
 * So this is a coarse floor for nonsense. The subtler judgement — sources on the
 * right topic that never state the answer — belongs to the model's `sufficient`
 * flag, which can read the passage rather than measure its angle.
 */
const MIN_SCORE = 0.55;
/** One rewrite. Never a loop — an unbounded retry against a paid API is the
 *  obvious way for this design to become expensive by accident. */
const MAX_REWRITES = 1;

export type Outcome = "answered" | "refused";

const AnswerState = Annotation.Root({
  question: Annotation<string>,
  searchQuery: Annotation<string>,
  collectionId: Annotation<string>,
  topK: Annotation<number>,

  chunks: Annotation<RetrievedChunk[]>({ reducer: (_, next) => next, default: () => [] }),
  rewrites: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),
  rewrittenAs: Annotation<string | undefined>({ reducer: (_, next) => next, default: () => undefined }),
  gradeScore: Annotation<number | undefined>({ reducer: (_, next) => next, default: () => undefined }),

  outcome: Annotation<Outcome | undefined>({ reducer: (_, next) => next, default: () => undefined }),
  answer: Annotation<string | undefined>({ reducer: (_, next) => next, default: () => undefined }),
  refusalReason: Annotation<string | undefined>({ reducer: (_, next) => next, default: () => undefined }),
  citations: Annotation<number[]>({ reducer: (_, next) => next, default: () => [] }),
  followUps: Annotation<string[]>({ reducer: (_, next) => next, default: () => [] }),

  retrievalMs: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
  generationMs: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
  promptTokens: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
  outputTokens: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
});

export type AnswerStateType = typeof AnswerState.State;

export interface GraphDeps extends RetrieveDeps {
  provider: Provider;
}

export function buildAnswerGraph(deps: GraphDeps) {
  const graph = new StateGraph(AnswerState)
    .addNode("retrieve", async (state) => {
      const started = Date.now();
      const result = await retrieve(
        { collectionId: state.collectionId, question: state.searchQuery, topK: state.topK },
        deps,
      );
      return { chunks: result.chunks, retrievalMs: Date.now() - started };
    })

    // Deterministic and cheap, on purpose. An LLM grader on every query costs a
    // round-trip to answer a question that a score threshold answers correctly
    // most of the time; the model's own `sufficient` flag in `generate` catches
    // the subtler case that a threshold cannot see.
    .addNode("grade", async (state) => ({
      gradeScore: state.chunks[0]?.score,
    }))

    .addNode("rewrite", async (state) => {
      const started = Date.now();
      const result = await deps.provider.generate({
        system: REWRITE_SYSTEM,
        user: buildRewritePrompt(state.question),
        temperature: 0.3,
      });
      const rewritten = result.text.trim().split("\n")[0] || state.question;
      return {
        searchQuery: rewritten,
        rewrittenAs: rewritten,
        rewrites: state.rewrites + 1,
        generationMs: Date.now() - started,
        promptTokens: result.promptTokens ?? 0,
        outputTokens: result.outputTokens ?? 0,
      };
    })

    .addNode("generate", async (state) => {
      const started = Date.now();
      const result = await deps.provider.generate({
        system: ANSWER_SYSTEM,
        user: buildAnswerPrompt(state.question, state.chunks),
        schema: ANSWER_SCHEMA as unknown as Record<string, unknown>,
      });

      const parsed = parseAnswer(result.text);
      const timings = {
        generationMs: Date.now() - started,
        promptTokens: result.promptTokens ?? 0,
        outputTokens: result.outputTokens ?? 0,
      };

      // The model read the sources and reports they do not answer the question.
      // Honoured rather than overridden: this is the case a similarity score is
      // structurally unable to detect.
      if (!parsed || !parsed.sufficient) {
        return {
          outcome: "refused" as const,
          refusalReason:
            parsed?.missing ||
            "The retrieved passages discuss this area but do not state an answer to the question.",
          ...timings,
        };
      }

      return {
        outcome: "answered" as const,
        answer: parsed.answer,
        citations: parsed.citations,
        followUps: parsed.followUps.slice(0, 2),
        ...timings,
      };
    })

    .addNode("refuse", async (state) => ({
      outcome: "refused" as const,
      refusalReason:
        state.chunks.length === 0
          ? "Nothing in this collection matched the question."
          : `The closest passage scored ${state.gradeScore?.toFixed(2)}, below the ${MIN_SCORE} threshold for answering.`,
    }));

  return graph
    .addEdge(START, "retrieve")
    .addEdge("retrieve", "grade")
    .addConditionalEdges("grade", route, ["generate", "rewrite", "refuse"])
    .addEdge("rewrite", "retrieve")
    .addEdge("generate", END)
    .addEdge("refuse", END)
    .compile();
}

function route(state: AnswerStateType): "generate" | "rewrite" | "refuse" {
  const strong = state.chunks.length > 0 && (state.gradeScore ?? 0) >= MIN_SCORE;
  if (strong) return "generate";
  // The bound lives here, in the routing decision, rather than as a guard inside
  // the rewrite node — so the limit is visible in the same place as the branch it
  // constrains.
  return state.rewrites < MAX_REWRITES ? "rewrite" : "refuse";
}

interface ParsedAnswer {
  sufficient: boolean;
  answer: string;
  missing: string;
  citations: number[];
  followUps: string[];
}

/**
 * Structured output is requested, not guaranteed — smaller local models drift
 * out of schema (ADR-0003 expects exactly this). A parse failure degrades to a
 * refusal rather than throwing, because an unparseable response is precisely the
 * case where the system knows least about what it is holding.
 */
function parseAnswer(text: string): ParsedAnswer | null {
  try {
    const json = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    const parsed = JSON.parse(json) as Partial<ParsedAnswer>;
    if (typeof parsed.sufficient !== "boolean") return null;
    return {
      sufficient: parsed.sufficient,
      answer: parsed.answer ?? "",
      missing: parsed.missing ?? "",
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
      followUps: Array.isArray(parsed.followUps) ? parsed.followUps : [],
    };
  } catch {
    return null;
  }
}

export { MIN_SCORE, MAX_REWRITES };
