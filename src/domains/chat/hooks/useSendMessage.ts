"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocketStore } from "@/shared/stores/socket.store";
import { useAuthStore } from "@/shared/stores/auth.store";
import { messageService } from "@/domains/chat/services/message.service";
import { IMessage } from "@/domains/chat/types";
import { addOptimisticMessage, setOptimisticStatus, upsertMessage } from "@/domains/chat/utils/message-cache";

const SEND_TIMEOUT_MS = 10_000;

/** What goes over the wire. For encrypted messages `content` must be empty. */
export interface OutgoingPayload {
  content?: string;
  type: "text" | "image" | "file";
  isEncrypted: boolean;
  ciphertext?: string;
  iv?: string;
  senderPublicKey?: string;
  recipientPublicKey?: string;
}

interface PendingSend {
  conversationId: string;
  clientMessageId: string;
  payload: OutgoingPayload;
  file?: File;
  plaintext?: string;
}

// Unconfirmed sends, kept so a failed message can be retried with the same
// clientMessageId (the server stores it at most once).
const pendingSends = new Map<string, PendingSend>();

/**
 * Sends messages with an optimistic "sending" bubble, a server acknowledgement,
 * and a retry path. Resolves with the stored message, or null if it failed.
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  const attempt = useCallback(
    async (pending: PendingSend): Promise<IMessage | null> => {
      const { conversationId, clientMessageId, payload, file } = pending;
      setOptimisticStatus(queryClient, conversationId, clientMessageId, "sending");

      try {
        let message: IMessage;
        if (file) {
          message = await messageService.sendMessage({ conversationId, clientMessageId, file, ...payload });
        } else {
          const socket = useSocketStore.getState().socket;
          if (!socket?.connected) throw new Error("offline");
          const res = (await socket
            .timeout(SEND_TIMEOUT_MS)
            .emitWithAck("send_message", { conversationId, clientMessageId, ...payload })) as {
            error?: string;
            message?: IMessage;
          };
          if (res.error || !res.message) throw new Error(res.error || "Message not stored");
          message = res.message;
        }

        pendingSends.delete(clientMessageId);
        upsertMessage(queryClient, message);
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        return message;
      } catch (err) {
        console.error("Failed to send message", err);
        setOptimisticStatus(queryClient, conversationId, clientMessageId, "failed");
        return null;
      }
    },
    [queryClient]
  );

  const send = useCallback(
    (conversationId: string, payload: OutgoingPayload, options: { plaintext?: string; file?: File } = {}) => {
      const user = useAuthStore.getState().user;
      const clientMessageId = crypto.randomUUID();
      const now = new Date().toISOString();

      addOptimisticMessage(queryClient, {
        id: `local:${clientMessageId}`,
        clientMessageId,
        conversationId,
        senderId: user?.id || "",
        content: null,
        type: payload.type,
        mediaUrl: null,
        isEncrypted: false,
        isEdited: false,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        sender: { id: user?.id || "", name: user?.name || "You", avatarUrl: user?.avatarUrl },
        localStatus: "sending",
        localPlaintext: options.plaintext,
        localFileName: options.file?.name,
      });

      const pending: PendingSend = { conversationId, clientMessageId, payload, ...options };
      pendingSends.set(clientMessageId, pending);
      return attempt(pending);
    },
    [attempt, queryClient]
  );

  const retry = useCallback(
    async (clientMessageId: string) => {
      const pending = pendingSends.get(clientMessageId);
      return pending ? attempt(pending) : null;
    },
    [attempt]
  );

  /** Remove a failed message that the user gave up on. */
  const discard = useCallback(
    (conversationId: string, clientMessageId: string) => {
      pendingSends.delete(clientMessageId);
      queryClient.setQueryData<IMessage[]>(["messages", conversationId], (old = []) =>
        old.filter((m) => !(m.localStatus && m.clientMessageId === clientMessageId))
      );
    },
    [queryClient]
  );

  return { send, retry, discard };
}
