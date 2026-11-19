"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/shared/stores/auth.store";
import ChatSidebar from "@/domains/chat/components/ChatSidebar";
import ChatWindow from "@/domains/chat/components/ChatWindow";
import CreateGroupModal from "@/domains/chat/components/CreateGroupModal";
import { useChatStore } from "@/shared/stores/chat.store";
import { GlobalCallOverlay } from "@/domains/call";
import VerifyEmailBanner from "@/domains/auth/components/VerifyEmailBanner";

export default function ChatPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // False during server rendering, true in the browser (auth state lives in localStorage).
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  useEffect(() => {
    if (isMounted && !isAuthenticated) {
      router.push("/login");
    }
  }, [isMounted, isAuthenticated, router]);

  if (!isMounted || !isAuthenticated) return null;

  return (
    <main className="h-screen w-screen overflow-hidden flex flex-col bg-slate-950 text-gray-100 p-2 gap-2 relative">
      <GlobalCallOverlay />
      {/* In the layout flow (not floating), so it never covers the chat header or its buttons. */}
      <VerifyEmailBanner />
      <div className="flex-1 min-h-0 flex gap-2">
        <ChatSidebar />
        {/* Keyed by conversation: switching chats starts with a fresh composer and decrypt cache. */}
        <ChatWindow key={activeConversationId ?? "none"} />
      </div>
      <CreateGroupModal />
    </main>
  );
}
