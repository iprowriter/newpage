import { DraftChat } from "@/components/DraftChat";

/**
 * A static segment, so it takes priority over /c/[id] — the draft never collides
 * with a real collection id.
 */
export default function NewChatPage() {
  return <DraftChat />;
}
