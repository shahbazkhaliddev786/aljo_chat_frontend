"use client";

import { useQuery } from "@tanstack/react-query";
import { IMessage } from "@/domains/chat/types";
import { messageService } from "@/domains/chat/services/message.service";

export function useMessages(conversationId: string | null) {
  return useQuery<IMessage[]>({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      return messageService.getMessages(conversationId);
    },
    enabled: !!conversationId,
  });
}
