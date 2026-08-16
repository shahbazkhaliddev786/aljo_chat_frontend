"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/shared/stores/auth.store";
import ChatSidebar from "@/domains/chat/components/ChatSidebar";
import ChatWindow from "@/domains/chat/components/ChatWindow";
import CreateGroupModal from "@/domains/chat/components/CreateGroupModal";
import { useCallStore } from "@/shared/stores/call.store";
import { GlobalCallOverlay } from "@/domains/call";

export default function ChatPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && !isAuthenticated) {
      router.push("/login");
    }
  }, [isMounted, isAuthenticated, router]);

  if (!isMounted || !isAuthenticated) return null;

  return (
    <main className="h-screen w-screen overflow-hidden flex bg-slate-950 text-gray-100 p-2 gap-2 relative">
      <GlobalCallOverlay />
      <ChatSidebar />
      <ChatWindow />
      <CreateGroupModal />
    </main>
  );
}
