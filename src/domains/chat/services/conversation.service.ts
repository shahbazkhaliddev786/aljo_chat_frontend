import { api } from "@/shared/lib/api-client";
import { IConversation } from "@/domains/chat/types";

export const conversationService = {
  getConversations: async (): Promise<IConversation[]> => {
    const res = await api.get("/conversations");
    return res.data.data.conversations;
  },

  createDirectConversation: async (targetUserId: string): Promise<IConversation> => {
    const res = await api.post("/conversations/direct", { targetUserId });
    return res.data.data.conversation;
  },

  createGroupConversation: async (data: { title: string; memberIds: string[] }): Promise<IConversation> => {
    const res = await api.post("/conversations/group", data);
    return res.data.data.conversation;
  },

  leaveGroup: async (conversationId: string): Promise<void> => {
    await api.delete(`/conversations/${conversationId}/leave`);
  },

  deleteGroup: async (conversationId: string): Promise<void> => {
    await api.delete(`/conversations/${conversationId}/group`);
  },

  deleteDirectConversation: async (conversationId: string): Promise<void> => {
    await api.delete(`/conversations/${conversationId}/direct`);
  },

  addGroupMembers: async (conversationId: string, memberIds: string[]): Promise<IConversation> => {
    const res = await api.post(`/conversations/${conversationId}/members`, { memberIds });
    return res.data.data.conversation;
  },

  removeGroupMember: async (conversationId: string, targetUserId: string): Promise<void> => {
    await api.delete(`/conversations/${conversationId}/members/${targetUserId}`);
  },
};
