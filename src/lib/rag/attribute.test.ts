import { describe, expect, it } from "vitest";

import { attribute, type AttributionSource } from "./attribute";
import type { Attribution } from "./attribute";

/**
 * Passages in the register the matcher actually runs against — FDA guidance
 * prose, where every chunk shares a large vocabulary. Attribution is easy on
 * texts about unrelated subjects and hard on these, so these are what it is
 * tested on.
 */
const sources: AttributionSource[] = [
  {
    n: 1,
    chunkId: "c1",
    displayText:
      "Sponsors must report any suspected adverse reaction that is both serious and unexpected. " +
      "The sponsor shall notify FDA and all participating investigators in an IND safety report " +
      "within 15 calendar days after the sponsor determines that the information qualifies for reporting.",
  },
  {
    n: 2,
    chunkId: "c2",
    displayText:
      "The sponsor must report any unexpected fatal or life-threatening suspected adverse reaction " +
      "as soon as possible but no later than 7 calendar days after the sponsor's initial receipt of the information.",
  },
  {
    n: 3,
    chunkId: "c3",
    displayText:
      "An investigator shall promptly report to the sponsor any serious adverse event, whether or not " +
      "considered drug related. Study records must be retained for two years after a marketing application is approved.",
  },
];

const found = (result: Attribution | null): Attribution => {
  if (result === null) throw new Error("expected an attribution, got none");
  return result;
};

describe("attribute", () => {
  it("points a quoted claim at the passage it was quoted from", () => {
    const result = found(
      attribute("The sponsor must notify FDA within 15 calendar days.", sources),
    );

    expect(result.n).toBe(1);
    expect(sources[0].displayText.slice(result.start, result.end)).toContain("15 calendar days");
  });

  // The distinguishing term is the deadline, and both passages are otherwise
  // near-identical regulatory boilerplate. If IDF weighting regresses to plain
  // overlap this is the test that fails.
  it("separates two passages that differ only in their specifics", () => {
    expect(found(attribute("fatal reactions are reported within 7 calendar days", sources)).n).toBe(2);
    expect(found(attribute("reports to FDA are due within 15 calendar days", sources)).n).toBe(1);
  });

  it("highlights the sentence carrying the claim, not the whole passage", () => {
    const result = found(
      attribute("Investigators must report serious adverse events to the sponsor promptly.", sources),
    );

    const span = sources[2].displayText.slice(result.start, result.end);
    expect(span).toContain("investigator shall promptly report");
    expect(span).not.toContain("marketing application");
  });

  it("returns a span with no surrounding whitespace", () => {
    const result = found(attribute("IND safety report within 15 calendar days", sources));
    const span = sources[0].displayText.slice(result.start, result.end);

    expect(span).toBe(span.trim());
  });

  it("reports surviving wording as strong", () => {
    const result = found(
      attribute(
        "The sponsor shall notify FDA and all participating investigators in an IND safety report within 15 calendar days.",
        sources,
      ),
    );

    expect(result.confidence).toBe("strong");
  });

  // The band the header comment is about. A heavy paraphrase and a claim
  // assembled from two passages both land here and cannot be told apart
  // lexically, so neither may be presented as "drawn from source N" — the point
  // of the flag is that the UI hedges on both.
  it("reports a heavy paraphrase as partial rather than strong", () => {
    const result = found(
      attribute(
        "Serious and unexpected suspected adverse reactions have to be reported to the agency by the sponsor.",
        sources,
      ),
    );

    expect(result.n).toBe(1);
    expect(result.confidence).toBe("partial");
  });

  it("reports a claim assembled from two passages as partial", () => {
    const result = found(
      attribute(
        "Reporting deadlines range from 7 to 15 days and study records are retained for two years.",
        sources,
      ),
    );

    expect(result.confidence).toBe("partial");
  });

  // The refusal ethic, applied to attribution: the one case the scores separate
  // cleanly, and the one where pointing anywhere would be a confident wrong
  // answer of exactly the kind the app exists to avoid.
  it("declines when nothing in the retrieved set supports the claim", () => {
    expect(attribute("Pediatric dosing requires a separate written request.", sources)).toBeNull();
    expect(attribute("Manufacturing sites are inspected before approval.", sources)).toBeNull();
  });

  // "the sponsor" is in every passage; whichever sorted first would win, and the
  // reader would be told a two-word phrase came from a specific page.
  it("declines on a selection too short to attribute", () => {
    expect(attribute("the sponsor", sources)).toBeNull();
    expect(attribute("", sources)).toBeNull();
  });

  it("declines when there are no sources", () => {
    expect(attribute("The sponsor must notify FDA within 15 calendar days.", [])).toBeNull();
  });

  it("keeps compound regulatory tokens whole", () => {
    const cfr: AttributionSource[] = [
      { n: 1, chunkId: "a", displayText: "Reporting follows 21 CFR 312.32 for IND safety reports." },
      { n: 2, chunkId: "b", displayText: "Reporting follows 21 CFR 314.80 for postmarketing reports." },
    ];

    expect(found(attribute("reporting under 21 CFR 312.32", cfr)).n).toBe(1);
    expect(found(attribute("reporting under 21 CFR 314.80", cfr)).n).toBe(2);
  });
});
