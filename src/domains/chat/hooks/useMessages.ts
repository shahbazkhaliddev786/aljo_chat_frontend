"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IMessage } from "@/domains/chat/types";
import { messageService } from "@/domains/chat/services/message.service";
import {
  mergeWithLocalMessages,
  messagesKey,
  messagesMetaKey,
  prependOlderMessages,
} from "@/domains/chat/utils/message-cache";

interface MessagesMeta {
  hasMore: boolean;
}

export function useMessages(conversationId: string | null) {
  const queryClient = useQueryClient();

  return useQuery<IMessage[]>({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const previous = queryClient.getQueryData<IMessage[]>(messagesKey(conversationId));
      const page = await messageService.getMessagesPage(conversationId);

      // If older pages were already loaded, whether more exist is unchanged.
      const keptOlder = !!previous?.some((m) => !m.localStatus && page.messages[0] && m.createdAt < page.messages[0].createdAt);
      if (!keptOlder) queryClient.setQueryData<MessagesMeta>(messagesMetaKey(conversationId), { hasMore: page.hasMore });

      return mergeWithLocalMessages(page.messages, previous);
    },
    enabled: !!conversationId,
  });
}

/** "Load earlier messages": fetches the page before the oldest loaded message. */
export function useOlderMessages(conversationId: string | null) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const meta = useQuery<MessagesMeta>({
    queryKey: ["messages-meta", conversationId],
    queryFn: () => ({ hasMore: false }),
    enabled: false,
  }).data;

  const loadOlder = useCallback(async () => {
    if (!conversationId || isLoading) return;
    const cached = queryClient.getQueryData<IMessage[]>(messagesKey(conversationId)) ?? [];
    const oldest = cached.find((m) => !m.localStatus);
    if (!oldest) return;

    setIsLoading(true);
    try {
      const page = await messageService.getMessagesPage(conversationId, oldest.id);
      prependOlderMessages(queryClient, conversationId, page.messages);
      queryClient.setQueryData<MessagesMeta>(messagesMetaKey(conversationId), { hasMore: page.hasMore });
    } catch (err) {
      console.error("Failed to load older messages", err);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, isLoading, queryClient]);

  return { hasMore: !!meta?.hasMore, isLoading, loadOlder };
}
