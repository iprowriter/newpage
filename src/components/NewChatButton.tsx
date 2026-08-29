"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewChatButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const start = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/chats", { method: "POST" });
      if (!response.ok) return;
      const chat = (await response.json()) as { id: string };
      router.push(`/c/${chat.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={start}
      disabled={busy}
      className="rounded-lg bg-accent px-4 py-2 text-[13px] text-white transition-colors hover:bg-accent-strong disabled:opacity-40"
    >
      {busy ? "Starting…" : "New chat"}
    </button>
  );
}
