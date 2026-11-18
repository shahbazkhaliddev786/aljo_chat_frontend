import { QueryClient } from "@tanstack/react-query";
import { IMessage } from "@/domains/chat/types";

export const messagesKey = (conversationId: string) => ["messages", conversationId];

/**
 * Put a server-confirmed message into the cache exactly once.
 *
 * The same message can arrive twice (send ack + socket broadcast) in any order,
 * and may replace an optimistic copy that has the same clientMessageId.
 */
export function upsertMessage(queryClient: QueryClient, message: IMessage) {
  queryClient.setQueryData<IMessage[]>(messagesKey(message.conversationId), (old = []) => {
    const matchesOptimistic = (m: IMessage) =>
      !!m.localStatus && !!message.clientMessageId && m.clientMessageId === message.clientMessageId;

    if (old.some((m) => m.id === message.id)) {
      // Already stored: just drop any optimistic copy.
      return old.some(matchesOptimistic) ? old.filter((m) => !matchesOptimistic(m)) : old;
    }
    const index = old.findIndex(matchesOptimistic);
    if (index === -1) return [...old, message];
    const next = [...old];
    next[index] = message;
    return next;
  });
}

export function addOptimisticMessage(queryClient: QueryClient, message: IMessage) {
  queryClient.setQueryData<IMessage[]>(messagesKey(message.conversationId), (old = []) => [...old, message]);
}

export function setOptimisticStatus(
  queryClient: QueryClient,
  conversationId: string,
  clientMessageId: string,
  localStatus: "sending" | "failed"
) {
  queryClient.setQueryData<IMessage[]>(messagesKey(conversationId), (old = []) =>
    old.map((m) => (m.localStatus && m.clientMessageId === clientMessageId ? { ...m, localStatus } : m))
  );
}

/** Keep unconfirmed local messages when the list is refetched from the server. */
export function mergeWithLocalMessages(server: IMessage[], previous: IMessage[] | undefined): IMessage[] {
  const confirmed = new Set(server.map((m) => m.clientMessageId).filter(Boolean));
  const local = (previous ?? []).filter((m) => m.localStatus && !confirmed.has(m.clientMessageId));
  return local.length ? [...server, ...local] : server;
}
