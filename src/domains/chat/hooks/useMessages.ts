"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { mergeWithLocalMessages } from "@/domains/chat/utils/message-cache";
import { IMessage } from "@/domains/chat/types";
import { messageService } from "@/domains/chat/services/message.service";

export function useMessages(conversationId: string | null) {
  const queryClient = useQueryClient();

  return useQuery<IMessage[]>({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const server = await messageService.getMessages(conversationId);
      // Keep messages that are still sending/failed locally across refetches.
      return mergeWithLocalMessages(server, queryClient.getQueryData<IMessage[]>(["messages", conversationId]));
    },
    enabled: !!conversationId,
  });
}
