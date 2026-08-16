import { create } from "zustand";
import { IConversation } from "@/domains/chat/types";

interface ChatState {
  activeConversation: IConversation | null;
  activeConversationId: string | null;
  isCreateGroupOpen: boolean;
  typingUsers: Record<string, string[]>; // conversationId -> array of user names
  setActiveConversation: (conversation: IConversation | null) => void;
  setCreateGroupOpen: (isOpen: boolean) => void;
  setTypingUser: (conversationId: string, userName: string) => void;
  removeTypingUser: (conversationId: string, userName: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeConversation: null,
  activeConversationId: null,
  isCreateGroupOpen: false,
  typingUsers: {},

  setActiveConversation: (conversation) => {
    set({
      activeConversation: conversation,
      activeConversationId: conversation ? conversation.id : null,
    });
  },

  setCreateGroupOpen: (isOpen) => set({ isCreateGroupOpen: isOpen }),

  setTypingUser: (conversationId, userName) => {
    set((state) => {
      const current = state.typingUsers[conversationId] || [];
      if (current.includes(userName)) return state;
      return {
        typingUsers: {
          ...state.typingUsers,
          [conversationId]: [...current, userName],
        },
      };
    });
  },

  removeTypingUser: (conversationId, userName) => {
    set((state) => {
      const current = state.typingUsers[conversationId] || [];
      return {
        typingUsers: {
          ...state.typingUsers,
          [conversationId]: current.filter((name) => name !== userName),
        },
      };
    });
  },
}));
