import { api } from "@/shared/lib/api-client";
import { IMessage } from "@/domains/chat/types";

export const messageService = {
  /** A page of messages (oldest first); `before` is the id of the oldest message already loaded. */
  getMessagesPage: async (
    conversationId: string,
    before?: string
  ): Promise<{ messages: IMessage[]; hasMore: boolean }> => {
    const res = await api.get(`/messages/${conversationId}`, { params: { limit: 50, ...(before ? { before } : {}) } });
    return { messages: res.data.data.messages, hasMore: !!res.data.data.hasMore };
  },

  sendMessage: async (params: {
    conversationId: string;
    content?: string;
    file?: File;
    type?: "text" | "image" | "file" | "audio";
    isEncrypted?: boolean;
    ciphertext?: string;
    iv?: string;
    senderPublicKey?: string;
    recipientPublicKey?: string;
    clientMessageId?: string;
    replyToId?: string;
  }): Promise<IMessage> => {
    const {
      conversationId,
      content,
      file,
      type,
      isEncrypted,
      ciphertext,
      iv,
      senderPublicKey,
      recipientPublicKey,
      clientMessageId,
      replyToId,
    } = params;

    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      if (content) formData.append("content", content);
      if (type) formData.append("type", type);
      if (replyToId) formData.append("replyToId", replyToId);
      if (isEncrypted) formData.append("isEncrypted", "true");
      if (ciphertext) formData.append("ciphertext", ciphertext);
      if (iv) formData.append("iv", iv);
      if (senderPublicKey) formData.append("senderPublicKey", senderPublicKey);
      if (recipientPublicKey) formData.append("recipientPublicKey", recipientPublicKey);
      if (clientMessageId) formData.append("clientMessageId", clientMessageId);

      const res = await api.post(`/messages/${conversationId}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data.data.message;
    }

    const res = await api.post(`/messages/${conversationId}`, {
      content,
      type,
      isEncrypted,
      ciphertext,
      iv,
      senderPublicKey,
      recipientPublicKey,
      clientMessageId,
      replyToId,
    });
    return res.data.data.message;
  },
};
