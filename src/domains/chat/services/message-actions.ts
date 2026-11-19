import { getConnectedSocket } from "@/shared/stores/socket.store";
import { IMessage } from "@/domains/chat/types";

const ACK_TIMEOUT_MS = 10_000;

async function request<T>(event: string, payload: Record<string, unknown>): Promise<T> {
  let socket;
  try {
    socket = await getConnectedSocket();
  } catch {
    throw new Error("You are offline");
  }
  const res = (await socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event, payload)) as T & { error?: string };
  if (res?.error) throw new Error(res.error);
  return res;
}

/** Edit your own text message. For encrypted chats pass the re-encrypted fields. */
export const editMessage = (payload: {
  messageId: string;
  content?: string;
  ciphertext?: string;
  iv?: string;
  senderPublicKey?: string;
  recipientPublicKey?: string;
  keyEnvelopes?: string;
}) => request<{ message: IMessage }>("edit_message", payload);

export const deleteMessage = (messageId: string) => request<{ message: IMessage }>("delete_message", { messageId });

export const toggleReaction = (messageId: string, emoji: string) =>
  request<{ messageId: string; reactions: IMessage["reactions"] }>("toggle_reaction", { messageId, emoji });
