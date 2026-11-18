"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/shared/stores/auth.store";
import { useSocketStore } from "@/shared/stores/socket.store";
import { useChatStore } from "@/shared/stores/chat.store";
import { useQueryClient } from "@tanstack/react-query";
import { IMessage } from "@/domains/chat/types";

export default function SocketProvider({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUser = useAuthStore((s) => s.user);
  const { socket, connectSocket, disconnectSocket } = useSocketStore();
  const setTypingUser = useChatStore((s) => s.setTypingUser);
  const removeTypingUser = useChatStore((s) => s.removeTypingUser);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isAuthenticated && token) {
      connectSocket(token);
    } else {
      disconnectSocket();
    }
  }, [isAuthenticated, token, connectSocket, disconnectSocket]);

  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (message: IMessage) => {
      queryClient.setQueryData<IMessage[]>(["messages", message.conversationId], (old = []) => {
        if (old.some((m) => m.id === message.id)) return old;
        return [...old, message];
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    const handleConversationDeleted = ({ conversationId }: { conversationId: string }) => {
      if (activeConversationId === conversationId) {
        setActiveConversation(null);
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    };

    const handleUserLeftGroup = ({ conversationId }: { conversationId: string }) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    };

    const handleGroupMembersUpdated = ({ conversationId }: { conversationId: string }) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    };

    const handleMemberRemovedFromGroup = ({
      conversationId,
      removedUserId,
    }: {
      conversationId: string;
      removedUserId: string;
    }) => {
      if (currentUser?.id === removedUserId && activeConversationId === conversationId) {
        setActiveConversation(null);
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    };

    const handleTypingStart = ({ conversationId, userName }: { conversationId: string; userName: string }) => {
      setTypingUser(conversationId, userName);
    };

    const handleTypingStop = ({ conversationId, userName }: { conversationId: string; userName: string }) => {
      removeTypingUser(conversationId, userName);
    };

    // Call events are handled by the call controller (see CallProvider).

    socket.on("receive_message", handleReceiveMessage);
    socket.on("group_deleted", handleConversationDeleted);
    socket.on("conversation_deleted", handleConversationDeleted);
    socket.on("user_left_group", handleUserLeftGroup);
    socket.on("group_members_updated", handleGroupMembersUpdated);
    socket.on("member_removed_from_group", handleMemberRemovedFromGroup);
    socket.on("typing_start", handleTypingStart);
    socket.on("typing_stop", handleTypingStop);

    return () => {
      socket.off("receive_message", handleReceiveMessage);
      socket.off("group_deleted", handleConversationDeleted);
      socket.off("conversation_deleted", handleConversationDeleted);
      socket.off("user_left_group", handleUserLeftGroup);
      socket.off("group_members_updated", handleGroupMembersUpdated);
      socket.off("member_removed_from_group", handleMemberRemovedFromGroup);
      socket.off("typing_start", handleTypingStart);
      socket.off("typing_stop", handleTypingStop);
    };
  }, [
    socket,
    queryClient,
    setTypingUser,
    removeTypingUser,
    setActiveConversation,
    activeConversationId,
    currentUser,
  ]);

  return <>{children}</>;
}
