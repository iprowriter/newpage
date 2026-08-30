import { NotFoundPanel } from "@/components/NotFoundPanel";

/**
 * The 404 for `/c/<id>` specifically, thrown by `notFound()` in this segment
 * when no collection carries that id.
 *
 * Separate from the catch-all because it can say something the catch-all cannot:
 * the address is a *shape* this app serves, so the id itself is the thing that
 * did not resolve. Told apart, "you mistyped a URL" and "the thing you had open
 * has been deleted" get different first moves from the reader.
 */
export default function CollectionNotFound() {
  return (
    <NotFoundPanel title="That collection is not here">
      <p>
        No collection or chat carries that id. Either it has been deleted, or the id in the address
        is not one this database issued — ids are generated, so a hand-written one will never match.
      </p>
      <p>The sidebar lists everything that does exist.</p>
    </NotFoundPanel>
  );
}
