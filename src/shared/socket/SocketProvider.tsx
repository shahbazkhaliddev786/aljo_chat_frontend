"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/shared/stores/auth.store";
import { useSocketStore } from "@/shared/stores/socket.store";
import { useChatStore } from "@/shared/stores/chat.store";
import { useQueryClient } from "@tanstack/react-query";
import { IMessage, IConversation } from "@/domains/chat/types";
import { upsertMessage, replaceMessage, setMessageReactions } from "@/domains/chat/utils/message-cache";

// A typing indicator disappears on its own if the "stop" event never arrives
// (e.g. the other user lost their connection mid-sentence).
const TYPING_EXPIRY_MS = 6_000;

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
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (isAuthenticated && token) {
      connectSocket();
    } else {
      disconnectSocket();
    }
  }, [isAuthenticated, token, connectSocket, disconnectSocket]);

  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (message: IMessage) => {
      upsertMessage(queryClient, message);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    // After a (re)connect, fetch whatever was missed while offline.
    const handleConnect = () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    };

    // Someone read messages: move their read marker in the cached conversation.
    const handleMessageRead = ({
      conversationId,
      userId,
      messageId,
    }: {
      conversationId: string;
      userId: string;
      messageId: string;
    }) => {
      queryClient.setQueryData<IConversation[]>(["conversations"], (old) =>
        old?.map((c) =>
          c.id !== conversationId
            ? c
            : {
                ...c,
                // We only ever mark the newest message as read, so our own unread count is now 0.
                ...(userId === currentUser?.id ? { unreadCount: 0 } : {}),
                members: c.members.map((m) => (m.id === userId ? { ...m, lastReadMessageId: messageId } : m)),
              }
        )
      );
    };

    // A message was edited or deleted.
    const handleMessageUpdated = (message: IMessage) => {
      replaceMessage(queryClient, message);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    const handleMessageReactions = ({
      conversationId,
      messageId,
      reactions,
    }: {
      conversationId: string;
      messageId: string;
      reactions: IMessage["reactions"];
    }) => {
      setMessageReactions(queryClient, conversationId, messageId, reactions);
    };

    // A contact published (or changed) their encryption key.
    const handleUserKeyUpdated = () => {
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

    const timers = typingTimers.current;
    const clearTypingTimer = (key: string) => {
      const timer = timers.get(key);
      if (timer) clearTimeout(timer);
      timers.delete(key);
    };

    const handleTypingStart = ({ conversationId, userName }: { conversationId: string; userName: string }) => {
      const key = `${conversationId}:${userName}`;
      setTypingUser(conversationId, userName);
      clearTypingTimer(key);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          removeTypingUser(conversationId, userName);
        }, TYPING_EXPIRY_MS)
      );
    };

    const handleTypingStop = ({ conversationId, userName }: { conversationId: string; userName: string }) => {
      clearTypingTimer(`${conversationId}:${userName}`);
      removeTypingUser(conversationId, userName);
    };

    // Call events are handled by the call controller (see CallProvider).

    socket.on("connect", handleConnect);
    socket.on("message_read", handleMessageRead);
    socket.on("message_updated", handleMessageUpdated);
    socket.on("message_reactions", handleMessageReactions);
    socket.on("user_key_updated", handleUserKeyUpdated);
    socket.on("receive_message", handleReceiveMessage);
    socket.on("group_deleted", handleConversationDeleted);
    socket.on("conversation_deleted", handleConversationDeleted);
    socket.on("user_left_group", handleUserLeftGroup);
    socket.on("group_members_updated", handleGroupMembersUpdated);
    socket.on("member_removed_from_group", handleMemberRemovedFromGroup);
    socket.on("typing_start", handleTypingStart);
    socket.on("typing_stop", handleTypingStop);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("message_read", handleMessageRead);
      socket.off("message_updated", handleMessageUpdated);
      socket.off("message_reactions", handleMessageReactions);
      socket.off("user_key_updated", handleUserKeyUpdated);
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
