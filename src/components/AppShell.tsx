"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { NewCollectionModal } from "./NewCollectionModal";
import { ProviderToggle } from "./ProviderToggle";
import { ThemeToggle } from "./ThemeToggle";

interface CollectionSummary {
  id: string;
  name: string;
  kind: "collection" | "chat";
  description: string | null;
  documentCount: number;
  chunkCount: number;
  updatedAt: string;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<CollectionSummary[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const load = useCallback(() => {
    fetch("/api/collections")
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);

  useEffect(load, [load, pathname]);

  const newChat = async () => {
    if (creatingChat) return;
    setCreatingChat(true);
    try {
      const response = await fetch("/api/chats", { method: "POST" });
      if (!response.ok) return;
      const chat = (await response.json()) as { id: string };
      load();
      router.push(`/c/${chat.id}`);
    } finally {
      setCreatingChat(false);
    }
  };

  const collections = entries.filter((entry) => entry.kind === "collection");
  const chats = entries
    .filter((entry) => entry.kind === "chat")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    // The shell owns the viewport and the two panes scroll independently:
    // navigation that scrolls away with the content means reaching for another
    // collection costs a scroll to the top first.
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-64 shrink-0 flex-col overflow-hidden border-r border-line bg-surface-soft px-4 py-6 md:flex">
        <Link href="/" className="mb-5 block shrink-0 px-3">
          <span className="block text-[15px] font-medium text-ink">Document assistant</span>
          <span className="mt-0.5 block text-xs text-muted">Ask, with sources</span>
        </Link>

        <button
          type="button"
          onClick={newChat}
          disabled={creatingChat}
          className="mb-5 flex shrink-0 items-center gap-2 rounded-lg border-[0.5px] border-line bg-surface px-3 py-2 text-[13px] text-ink transition-colors hover:border-accent disabled:opacity-50"
        >
          <PlusIcon />
          {creatingChat ? "Starting…" : "New chat"}
        </button>

        {/* Only the lists scroll, and only once they overflow. The brand, the new
            chat button, the traces link and the toggles stay put. */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
          <Section
            title="Collections"
            action={
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                aria-label="New collection"
                className="rounded p-0.5 text-muted transition-colors hover:text-accent"
              >
                <PlusIcon />
              </button>
            }
          >
            {collections.length === 0 ? (
              <Empty>No collections yet</Empty>
            ) : (
              collections.map((entry) => (
                <Item key={entry.id} entry={entry} active={pathname === `/c/${entry.id}`} />
              ))
            )}
          </Section>

          <Section title="Chats">
            {chats.length === 0 ? (
              <Empty>Start one for a single document</Empty>
            ) : (
              chats.map((entry) => (
                <Item key={entry.id} entry={entry} active={pathname === `/c/${entry.id}`} />
              ))
            )}
          </Section>
        </div>

        <div className="mt-4 flex shrink-0 flex-col gap-3 border-t border-line pt-4">
          <Link
            href="/traces"
            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
              pathname === "/traces" ? "bg-accent-tint text-accent-on-tint" : "text-body hover:text-ink"
            }`}
          >
            Traces
          </Link>
          <div className="px-3">
            <ProviderToggle />
          </div>
          <div className="px-3 pb-1">
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>

      {modalOpen && (
        <NewCollectionModal
          onClose={() => setModalOpen(false)}
          onCreated={(id) => {
            load();
            router.push(`/c/${id}`);
          }}
        />
      )}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{title}</span>
        {action}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function Item({ entry, active }: { entry: CollectionSummary; active: boolean }) {
  return (
    <Link
      href={`/c/${entry.id}`}
      className={`rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? "bg-accent-tint text-accent-on-tint" : "text-body hover:bg-surface hover:text-ink"
      }`}
    >
      <span className="block truncate">{entry.name}</span>
      <span className="mt-0.5 block text-xs text-muted">
        {entry.documentCount === 0
          ? "Empty"
          : `${entry.documentCount} document${entry.documentCount === 1 ? "" : "s"} · ${entry.chunkCount} chunks`}
      </span>
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-1 text-xs text-muted">{children}</p>;
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
