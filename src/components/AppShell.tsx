"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { collectionsChanged, useCollectionsChanged } from "./collectionsBus";
import { ChatIcon, CollectionIcon, PlusIcon, TraceIcon, TrashIcon } from "./icons";
import { NewCollectionModal } from "./NewCollectionModal";
import { NewpageMark } from "./NewpageMark";
import { ProviderToggle } from "./ProviderToggle";
import { ThemeToggle } from "./ThemeToggle";

interface Entry {
  id: string;
  name: string;
  kind: "collection" | "chat";
  documentCount: number;
  chunkCount: number;
  updatedAt: string;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const load = useCallback(() => {
    fetch("/api/collections")
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);

  useEffect(load, [load, pathname]);
  // Ingesting a document renames a chat and changes its counts. Without this the
  // sidebar kept showing "New chat · Empty" until the next navigation.
  useCollectionsChanged(load);

  const remove = async (entry: Entry) => {
    const response = await fetch(`/api/collections/${entry.id}`, { method: "DELETE" });
    if (!response.ok) return;
    load();
    if (pathname === `/c/${entry.id}`) router.push("/");
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
        <Link href="/" className="mb-6 flex shrink-0 items-center gap-2.5 px-3">
          <NewpageMark />
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-medium leading-tight text-ink">
              Document assistant
            </span>
            <span className="mt-0.5 block text-[11px] leading-tight text-muted">Ask, with sources</span>
          </span>
        </Link>

        {/* A link, not a POST. The chat is created by the first upload, so a click
            you do not follow through leaves nothing behind. */}
        <Link
          href="/c/new"
          className={`mb-5 flex shrink-0 items-center gap-2 rounded-lg border-[0.5px] px-3 py-2 text-[13px] shadow-xs ${
            pathname === "/c/new"
              ? "border-accent bg-accent-tint text-accent-on-tint shadow-accent"
              : "border-line bg-surface text-ink hover:border-accent hover:shadow-sm"
          }`}
        >
          <PlusIcon />
          New chat
        </Link>

        {/* Only the lists scroll, and only once they overflow. */}
        <div className="scroll-quiet flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain">
          <Section
            icon={<CollectionIcon />}
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
                <Item
                  key={entry.id}
                  entry={entry}
                  active={pathname === `/c/${entry.id}`}
                  onDelete={() => remove(entry)}
                />
              ))
            )}
          </Section>

          <Section icon={<ChatIcon />} title="Chats">
            {chats.length === 0 ? (
              <Empty>Start one for a single document</Empty>
            ) : (
              chats.map((entry) => (
                <Item
                  key={entry.id}
                  entry={entry}
                  active={pathname === `/c/${entry.id}`}
                  onDelete={() => remove(entry)}
                />
              ))
            )}
          </Section>
        </div>

        <div className="mt-4 flex shrink-0 flex-col gap-3 border-t border-line pt-4">
          <Link
            href="/traces"
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              pathname === "/traces" ? "bg-accent-tint text-accent-on-tint" : "text-body hover:text-ink"
            }`}
          >
            <TraceIcon />
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

      <main className="scroll-quiet min-w-0 flex-1 overflow-y-auto overscroll-contain">{children}</main>

      {modalOpen && (
        <NewCollectionModal
          onClose={() => setModalOpen(false)}
          onCreated={(id) => {
            collectionsChanged();
            router.push(`/c/${id}`);
          }}
        />
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-3">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          {icon}
          {title}
        </span>
        {action}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function Item({
  entry,
  active,
  onDelete,
}: {
  entry: Entry;
  active: boolean;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className={`group relative flex items-center rounded-lg transition-colors ${
        active ? "bg-accent-tint" : "hover:bg-surface"
      }`}
    >
      <Link
        href={`/c/${entry.id}`}
        className={`min-w-0 flex-1 px-3 py-2 text-sm ${
          active ? "text-accent-on-tint" : "text-body group-hover:text-ink"
        }`}
      >
        <span className="block truncate">{entry.name}</span>
        <span className="tnum mt-0.5 block text-xs text-muted">
          {entry.documentCount === 0
            ? "Empty"
            : `${entry.documentCount} document${entry.documentCount === 1 ? "" : "s"} · ${entry.chunkCount} chunks`}
        </span>
      </Link>

      {confirming ? (
        <span className="flex shrink-0 items-center gap-1.5 pr-2 text-[11px]">
          <button type="button" onClick={onDelete} className="text-danger hover:underline">
            Delete
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-muted hover:text-ink"
          >
            No
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${entry.name}`}
          className="shrink-0 p-2 text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-1 text-xs text-muted">{children}</p>;
}
