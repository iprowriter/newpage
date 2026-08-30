import { NotFoundPanel } from "@/components/NotFoundPanel";

/**
 * The catch-all 404, for a URL that matched no route at all.
 *
 * Next's built-in 404 is replaced rather than styled, because there is nothing
 * to style: it renders a bare centred string, drops the sidebar — so the only
 * way out is the back button — and it reads `prefers-color-scheme` rather than
 * this app's `data-theme`, which means a reviewer with the toggle set to dark
 * gets a white flash. A `not-found.tsx` renders inside the root layout, so the
 * shell, the theme script and the fonts all still apply.
 *
 * There is no `global-not-found.tsx` alongside it: that convention exists for
 * apps with several root layouts or a top-level dynamic segment, and it buys
 * that generality by bypassing the layout — which would give back exactly the
 * unstyled, navigation-less page this file exists to remove.
 */
export default function NotFound() {
  return (
    <NotFoundPanel title="That page is not here">
      <p>
        Nothing in this build answers to that address. It is either a link that has gone stale, or
        a typo in one that used to work.
      </p>
      <p>The sidebar lists every collection and chat that does exist.</p>
    </NotFoundPanel>
  );
}
