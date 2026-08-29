"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { collectionsChanged } from "./collectionsBus";

/**
 * A chat that does not exist yet.
 *
 * "New chat" used to POST immediately, so every click that was not followed by
 * an upload left a permanent "New chat · Empty" row in the sidebar. Nothing here
 * is persisted until there is a document to persist: the chat is created on the
 * first upload, in the same action, and the URL is then replaced with the real
 * one so Back does not return to a draft that has since become a real chat.
 */
export function DraftChat() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const router = useRouter();

  const start = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || busy) return;

    setError(null);
    setBusy("Creating chat…");
    try {
      const created = await fetch("/api/chats", { method: "POST" });
      if (!created.ok) {
        setError("Could not start a chat.");
        return;
      }
      const chat = (await created.json()) as { id: string };

      setBusy(`Indexing ${file.name}…`);
      const form = new FormData();
      form.append("file", file);
      const upload = await fetch(`/api/collections/${chat.id}/documents`, {
        method: "POST",
        body: form,
      });

      if (!upload.ok) {
        // The chat exists but holds nothing, and an empty chat is exactly what
        // this component was written to avoid — so it is cleaned up rather than
        // left behind as the residue of a failed upload.
        const detail = await upload.json().catch(() => ({}));
        await fetch(`/api/collections/${chat.id}`, { method: "DELETE" }).catch(() => {});
        setError(detail.error ?? `Could not ingest ${file.name}.`);
        return;
      }

      collectionsChanged();
      router.replace(`/c/${chat.id}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col justify-center px-6">
      <div className="pb-16">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Chat</p>
        <h1 className="mt-1 text-[22px] font-medium text-ink">New chat</h1>
        <p className="mt-2 text-sm leading-relaxed text-body">
          For a document you do not want to file yet. Ask questions about it here, and move it into
          a collection later if it turns out to be worth keeping.
        </p>

        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void start(event.dataTransfer.files);
          }}
          className={`mt-6 flex cursor-pointer items-center justify-center rounded-xl border border-dashed px-4 py-10 text-center text-[13px] transition-colors ${
            dragging
              ? "border-accent bg-accent-tint text-accent-on-tint"
              : "border-line bg-surface text-muted hover:border-accent"
          }`}
        >
          <input
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
            className="sr-only"
            disabled={busy !== null}
            onChange={(event) => void start(event.target.files)}
          />
          {busy ?? "Drop a PDF, text or Markdown file, or click to choose"}
        </label>

        {error && (
          <p className="mt-3 rounded-lg bg-refusal-tint px-3 py-2 text-[13px] leading-relaxed text-refusal">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
