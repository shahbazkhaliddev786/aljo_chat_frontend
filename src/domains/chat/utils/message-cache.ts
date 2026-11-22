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
  // A conversation that was never opened has no cache yet. Creating one with just
  // this message would look "fresh" and hide the history (and "Load earlier"), so
  // leave it to be fetched in full when the chat is opened.
  if (queryClient.getQueryData(messagesKey(message.conversationId)) === undefined) return;
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

export const messagesMetaKey = (conversationId: string) => ["messages-meta", conversationId];

/**
 * Merge the latest page from the server with what is already cached: keep older
 * pages the user already loaded, and keep unconfirmed local messages.
 */
export function mergeWithLocalMessages(server: IMessage[], previous: IMessage[] | undefined): IMessage[] {
  const prev = previous ?? [];
  const serverIds = new Set(server.map((m) => m.id));
  const confirmed = new Set(server.map((m) => m.clientMessageId).filter(Boolean));
  const oldestServer = server[0]?.createdAt;

  const olderLoaded = oldestServer
    ? prev.filter((m) => !m.localStatus && !serverIds.has(m.id) && m.createdAt < oldestServer)
    : [];
  const local = prev.filter((m) => m.localStatus && !confirmed.has(m.clientMessageId));
  return [...olderLoaded, ...server, ...local];
}

/** Add an older page in front of the cached messages. */
export function prependOlderMessages(queryClient: QueryClient, conversationId: string, older: IMessage[]) {
  queryClient.setQueryData<IMessage[]>(messagesKey(conversationId), (old = []) => {
    const known = new Set(old.map((m) => m.id));
    return [...older.filter((m) => !known.has(m.id)), ...old];
  });
}

/** Apply an edited/deleted message from the server (replaces the cached copy). */
export function replaceMessage(queryClient: QueryClient, message: IMessage) {
  queryClient.setQueryData<IMessage[]>(messagesKey(message.conversationId), (old) =>
    old?.map((m) => (m.id === message.id ? { ...m, ...message } : m))
  );
}

export function setMessageReactions(
  queryClient: QueryClient,
  conversationId: string,
  messageId: string,
  reactions: IMessage["reactions"]
) {
  queryClient.setQueryData<IMessage[]>(messagesKey(conversationId), (old) =>
    old?.map((m) => (m.id === messageId ? { ...m, reactions } : m))
  );
}
