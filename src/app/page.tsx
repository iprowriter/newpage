import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";
import { NewChatButton } from "@/components/NewChatButton";

/**
 * Prefers a real collection, falling back to whatever exists.
 *
 * There is no seeded landing collection any more: it existed to give a one-off
 * document somewhere to go, which is now what a chat is for — created on demand
 * and promoted into a collection if it turns out to be worth keeping.
 */
export default async function Home() {
  const db = getDb();
  const landing =
    (await db.collection.findFirst({ where: { kind: "collection", isDefault: true } })) ??
    (await db.collection.findFirst({ where: { kind: "collection" }, orderBy: { name: "asc" } })) ??
    (await db.collection.findFirst({ orderBy: { updatedAt: "desc" } }));

  if (landing) redirect(`/c/${landing.id}`);

  return (
    <div className="mx-auto max-w-xl px-6 py-24">
      <h1 className="text-[22px] font-medium text-ink">Nothing here yet</h1>
      <p className="mt-3 text-sm leading-relaxed text-body">
        Start a chat and drop a document into it, or run{" "}
        <code className="rounded bg-surface-soft px-1.5 py-0.5 font-mono text-[13px]">npm run seed</code> to
        create the sample collections and ingest the bundled FDA corpus.
      </p>
      <div className="mt-6">
        <NewChatButton />
      </div>
    </div>
  );
}
