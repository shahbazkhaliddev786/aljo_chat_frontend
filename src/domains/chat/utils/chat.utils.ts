import { IConversation } from "@/domains/chat/types";

export function getConversationTitle(conv: IConversation, currentUserId?: string): string {
  if (conv.type === "group") return conv.title || "Group Chat";
  const partner = conv.members.find((m) => m.id !== currentUserId);
  return partner?.name || "Direct Message";
}

export function getConversationAvatar(conv: IConversation, currentUserId?: string): string | null {
  if (conv.type === "group") return null;
  const partner = conv.members.find((m) => m.id !== currentUserId);
  return partner?.avatarUrl || null;
}

export function isPartnerOnline(
  conv: IConversation,
  currentUserId?: string,
  onlineUsers?: Record<string, "online" | "offline">
): boolean {
  if (conv.type === "group") return false;
  const partner = conv.members.find((m) => m.id !== currentUserId);
  if (!partner) return false;
  return onlineUsers?.[partner.id] === "online" || partner.status === "online";
}
