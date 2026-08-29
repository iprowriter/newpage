import { notFound } from "next/navigation";

import { CollectionView } from "@/components/CollectionView";
import { getDb } from "@/lib/db";

export default async function CollectionPage({ params }: PageProps<"/c/[id]">) {
  const { id } = await params;
  const db = getDb();

  const collection = await db.collection.findUnique({ where: { id } });
  if (!collection) notFound();

  return (
    <CollectionView
      collectionId={collection.id}
      name={collection.name}
      kind={collection.kind}
      description={collection.description}
    />
  );
}
