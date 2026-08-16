"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IConversation } from "@/domains/chat/types";
import { conversationService } from "@/domains/chat/services/conversation.service";

export function useCreateDirectConversationMutation() {
  const queryClient = useQueryClient();

  return useMutation<IConversation, Error, string>({
    mutationFn: (targetUserId: string) =>
      conversationService.createDirectConversation(targetUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useCreateGroupConversationMutation() {
  const queryClient = useQueryClient();

  return useMutation<IConversation, Error, { title: string; memberIds: string[] }>({
    mutationFn: (data) => conversationService.createGroupConversation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useLeaveGroupMutation() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (conversationId: string) =>
      conversationService.leaveGroup(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useDeleteGroupMutation() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (conversationId: string) =>
      conversationService.deleteGroup(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useDeleteDirectMutation() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (conversationId: string) =>
      conversationService.deleteDirectConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useAddGroupMembersMutation() {
  const queryClient = useQueryClient();

  return useMutation<IConversation, Error, { conversationId: string; memberIds: string[] }>({
    mutationFn: ({ conversationId, memberIds }) =>
      conversationService.addGroupMembers(conversationId, memberIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages", variables.conversationId] });
    },
  });
}

export function useRemoveGroupMemberMutation() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { conversationId: string; targetUserId: string }>({
    mutationFn: ({ conversationId, targetUserId }) =>
      conversationService.removeGroupMember(conversationId, targetUserId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages", variables.conversationId] });
    },
  });
}
