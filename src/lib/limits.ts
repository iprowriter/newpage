/**
 * Input limits shared by the composer and the route that receives it.
 *
 * In one module because both ends must agree: the textarea stops at this length
 * and the API refuses past it, and a client-side cap on its own is a suggestion —
 * anyone can post to `/api/query` directly.
 */

/**
 * The longest question accepted, in characters.
 *
 * 300 is roughly three sentences, which is more than any question this system can
 * usefully answer: retrieval embeds the question as a single vector, so a long
 * multi-part question produces an average of its parts and matches none of them
 * well (ADR-0012 — the same reason chunks are bounded). The cap is a bound on
 * cost as much as a bound on nonsense: an unbounded field is a free channel into
 * the prompt and into the embedding call that precedes it.
 */
export const MAX_QUESTION_CHARS = 300;

/** Where the composer starts showing the reader how much room is left. */
export const QUESTION_COUNTER_FROM = MAX_QUESTION_CHARS - 60;
