"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { collectionsChanged } from "./collectionsBus";

interface Target {
  id: string;
  name: string;
  kind: "collection" | "chat";
}

/**
 * Moves a chat's documents into a collection, then removes the chat.
 *
 * The whole reason this is a few lines rather than a migration is that a chat
 * *is* a collection (see the schema): promoting re-points `collectionId` on the
 * chunks and their Qdrant payloads, and every isolation guarantee that already
 * held continues to hold at the new scope.
 */
export function PromoteChat({
  chatId,
  documentCount,
  onMoved,
}: {
  chatId: string;
  documentCount: number;
  onMoved: () => void;
}) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    fetch("/api/collections")
      .then((r) => r.json())
      .then((all: Target[]) => setTargets(all.filter((t) => t.kind === "collection")))
      .catch(() => setTargets([]));
  }, [open]);

  const move = async (collectionId: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/chats/${chatId}/promote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collectionId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not move this chat.");
        return;
      }
      onMoved();
      // The chat row is gone from the database; tell the sidebar so it stops
      // showing it. Navigation alone would refresh it a moment later, but the
      // moved-from entry lingering for that moment is exactly the residue this
      // is meant to avoid.
      collectionsChanged();
      router.push(`/c/${collectionId}`);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  if (documentCount === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={busy}
        className="rounded-full border-[0.5px] border-line bg-surface px-3 py-1.5 text-[13px] text-body transition-colors hover:border-accent hover:text-ink disabled:opacity-50"
      >
        {busy ? "Moving…" : "Move to collection"}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-60 rounded-xl border-[0.5px] border-line bg-surface p-1 shadow-md">
          {targets.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted">No collections to move into yet.</p>
          ) : (
            targets.map((target) => (
              <button
                key={target.id}
                type="button"
                onClick={() => move(target.id)}
                className="block w-full truncate rounded-lg px-3 py-2 text-left text-[13px] text-body transition-colors hover:bg-surface-soft hover:text-ink"
              >
                {target.name}
              </button>
            ))
          )}
        </div>
      )}

      {error && (
        <p className="absolute right-0 mt-1.5 w-64 rounded-lg bg-refusal-tint px-3 py-2 text-xs leading-relaxed text-refusal">
          {error}
        </p>
      )}
    </div>
  );
}
