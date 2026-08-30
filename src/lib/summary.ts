import { createHash } from "node:crypto";

/**
 * Identifies the document set a stored summary was written from.
 *
 * Lifted out of the summary route because two routes now depend on agreeing
 * about it: the POST that writes a summary, and the GET that decides whether the
 * stored one still describes what the reader is looking at. Computed in two
 * places, they would eventually disagree, and the failure would be a summary
 * that quietly outlives its documents.
 *
 * Ids rather than a count: a count misses a swap — one document out, one in —
 * and that is precisely the case where the old summary is most wrong. Sorted, so
 * the fingerprint does not depend on the order the rows came back in.
 */
export function summaryFingerprint(documentIds: string[]): string {
  return createHash("sha1").update([...documentIds].sort().join(":")).digest("hex");
}
