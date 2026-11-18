import { api } from "@/shared/lib/api-client";
import { IMessage } from "@/domains/chat/types";

export const messageService = {
  getMessages: async (conversationId: string): Promise<IMessage[]> => {
    const res = await api.get(`/messages/${conversationId}`);
    return res.data.data.messages;
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
    replyToId?: string;
  }): Promise<IMessage> => {
    const { conversationId, content, file, type, isEncrypted, ciphertext, iv, senderPublicKey, recipientPublicKey, replyToId } =
      params;

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
      replyToId,
    });
    return res.data.data.message;
  },
};
