"use client";

import { useQuery } from "@tanstack/react-query";
import { IConversation } from "@/domains/chat/types";
import { useAuthStore } from "@/shared/stores/auth.store";
import { conversationService } from "@/domains/chat/services/conversation.service";

export function useConversations() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery<IConversation[]>({
    queryKey: ["conversations"],
    queryFn: () => conversationService.getConversations(),
    enabled: isAuthenticated,
  });
}
