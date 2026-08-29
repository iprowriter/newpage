"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Create a collection, optionally with its first document.
 *
 * The upload is offered here rather than left to the empty collection because a
 * collection with nothing in it can answer nothing, and the first thing anyone
 * does after making one is add a document. Ingestion still runs through the same
 * route as any other upload — this only saves a step, it does not add a path.
 */
/**
 * Rendered only while open, by the parent. That is deliberate: the alternative —
 * keeping it mounted and clearing the fields in an effect when `open` flips —
 * resets state during render and is what `react-hooks/set-state-in-effect`
 * objects to. Unmounting gets a clean form for free, from the `useState`
 * initialisers, with no effect at all.
 */
export function NewCollectionModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (collectionId: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;

    setError(null);
    setBusy("Creating…");
    try {
      const response = await fetch("/api/collections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not create the collection.");
        return;
      }

      if (file) {
        setBusy(`Indexing ${file.name}…`);
        const form = new FormData();
        form.append("file", file);
        const upload = await fetch(`/api/collections/${data.id}/documents`, {
          method: "POST",
          body: form,
        });
        if (!upload.ok) {
          // The collection exists and is usable, so this is a warning rather
          // than a failure — reporting it as an error would imply nothing was
          // created and invite a duplicate.
          const detail = await upload.json().catch(() => ({}));
          setError(`Collection created, but "${file.name}" did not ingest: ${detail.error ?? "unknown error"}`);
          onCreated(data.id);
          return;
        }
      }
      onCreated(data.id);
      onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 px-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <form
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="New collection"
        className="w-full max-w-md rounded-2xl border-[0.5px] border-line bg-surface p-5 shadow-md"
      >
        <h2 className="text-[17px] font-medium text-ink">New collection</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-body">
          A named scope. Questions asked inside it only ever retrieve its own documents.
        </p>

        <label className="mt-4 block">
          <span className="text-xs text-muted">Name</span>
          <input
            ref={nameRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Regulatory Affairs"
            className="mt-1 w-full rounded-lg border-[0.5px] border-line bg-surface-soft px-3 py-2 text-[14px] text-ink outline-none placeholder:text-muted focus:border-accent"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-xs text-muted">Description</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What belongs in here"
            className="mt-1 w-full rounded-lg border-[0.5px] border-line bg-surface-soft px-3 py-2 text-[14px] text-ink outline-none placeholder:text-muted focus:border-accent"
          />
        </label>

        <label className="mt-3 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-line bg-surface-soft px-3 py-3 text-center text-[13px] text-muted transition-colors hover:border-accent">
          <input
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
            className="sr-only"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          {file ? file.name : "Add a first document (optional)"}
        </label>

        {error && (
          <p className="mt-3 rounded-lg bg-refusal-tint px-3 py-2 text-[13px] leading-relaxed text-refusal">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[13px] text-muted transition-colors hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || busy !== null}
            className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] text-white transition-colors hover:bg-accent-strong disabled:opacity-40"
          >
            {busy ?? "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
