"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IMessage } from "@/domains/chat/types";
import { messageService } from "@/domains/chat/services/message.service";

export function useSendMessageMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    IMessage,
    Error,
    {
      conversationId: string;
      content?: string;
      file?: File;
      type?: "text" | "image" | "file" | "audio";
      isEncrypted?: boolean;
      ciphertext?: string;
      iv?: string;
      senderPublicKey?: string;
      recipientPublicKey?: string;
      replyToId?: string;
    }
  >({
    mutationFn: (params) => messageService.sendMessage(params),
    onSuccess: (newMessage) => {
      // The same message also arrives over the socket; only add it once.
      queryClient.setQueryData<IMessage[]>(["messages", newMessage.conversationId], (old = []) =>
        old.some((m) => m.id === newMessage.id) ? old : [...old, newMessage]
      );
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
