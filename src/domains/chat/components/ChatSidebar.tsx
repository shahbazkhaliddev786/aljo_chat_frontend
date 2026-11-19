"use client";

import { useEffect, useState } from "react";
import { getEncryptionMode } from "@/domains/chat/utils/message-crypto";
import { useQueryClient } from "@tanstack/react-query";
import { hangUp } from "@/domains/call/services/call.controller";
import { useCallStore } from "@/shared/stores/call.store";
import { api } from "@/shared/lib/api-client";
import { getAccessToken, getRefreshToken } from "@/shared/lib/auth-session";
import { useConversations } from "@/domains/chat/hooks/useConversations";
import { useUserSearch } from "@/domains/user/hooks/useUserSearch";
import { useCreateDirectConversationMutation } from "@/domains/chat/hooks/useConversationMutations";
import { useChatStore } from "@/shared/stores/chat.store";
import { useAuthStore } from "@/shared/stores/auth.store";
import { useSocketStore } from "@/shared/stores/socket.store";
import { getConversationTitle, getConversationAvatar, isPartnerOnline } from "@/domains/chat/utils/chat.utils";
import { MessageSquarePlus, Search, LogOut, Users, ShieldCheck } from "lucide-react";
import { IUser } from "@/domains/user/types";
import { IConversation } from "@/domains/chat/types";

export default function ChatSidebar() {
  const { data: conversations = [], isLoading } = useConversations();
  const activeConversation = useChatStore((s) => s.activeConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const setCreateGroupOpen = useChatStore((s) => s.setCreateGroupOpen);

  const currentUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();

  // Total unread messages in the browser tab title.
  const totalUnread = (conversations ?? []).reduce(
    (sum, c) => sum + (c.id === activeConversation?.id ? 0 : (c.unreadCount ?? 0)),
    0
  );
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread > 99 ? "99+" : totalUnread}) aljo chat` : "aljo chat";
  }, [totalUnread]);

  const handleLogout = () => {
    if (useCallStore.getState().status !== "idle") hangUp();
    // Revoke this device's refresh token (best effort; tokens are cleared locally right after).
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      api
        .post("/auth/logout", { refreshToken }, { headers: { Authorization: `Bearer ${getAccessToken()}` } })
        .catch(() => {});
    }
    // Drop cached conversations/messages so the next account never sees them.
    queryClient.clear();
    logout();
  };
  const onlineUsers = useSocketStore((s) => s.onlineUsers);

  const [searchQuery, setSearchQuery] = useState("");
  const { data: searchResults = [] } = useUserSearch(searchQuery);

  const createDirectMutation = useCreateDirectConversationMutation();

  const handleSelectUser = async (targetUser: IUser) => {
    try {
      const conversation = await createDirectMutation.mutateAsync(targetUser.id);
      setActiveConversation(conversation);
      setSearchQuery("");
    } catch (err) {
      console.error("Failed to start direct conversation", err);
    }
  };

  return (
    <div className="w-80 h-full glass-panel border-r border-white/10 flex flex-col bg-slate-950/60">
      {/* User Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white shadow-md">
              {currentUser?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                currentUser?.name?.charAt(0).toUpperCase() || "U"
              )}
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-950 rounded-full"></span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white truncate max-w-[130px]">
              {currentUser?.name}
            </h3>
            <p className="text-xs text-indigo-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> E2EE Ready
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setCreateGroupOpen(true)}
            title="Create Group (Min 3)"
            className="p-2 rounded-xl text-gray-300 hover:text-white hover:bg-indigo-600/30 transition"
          >
            <Users className="w-5 h-5 text-indigo-400" />
          </button>
          <button
            onClick={handleLogout}
            title="Logout"
            className="p-2 rounded-xl text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b border-white/5">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search users to start chat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl glass-input text-xs"
          />
        </div>
      </div>

      {/* Search Results Dropdown */}
      {searchQuery.trim() && (
        <div className="max-h-56 overflow-y-auto p-2 border-b border-white/10 bg-slate-900/90">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">
            User Search Results
          </p>
          {searchResults.length === 0 ? (
            <p className="text-xs text-gray-500 px-2 py-2">No users found</p>
          ) : (
            searchResults.map((user) => (
              <button
                key={user.id}
                onClick={() => handleSelectUser(user)}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-indigo-600/20 text-left transition"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-500/30 flex items-center justify-center text-indigo-300 text-xs font-bold">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-medium text-white">{user.name}</p>
                  <p className="text-[10px] text-gray-400">{user.email}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Conversations
          </span>
          <button
            onClick={() => setCreateGroupOpen(true)}
            className="text-[10px] text-indigo-400 hover:underline flex items-center gap-1"
          >
            <MessageSquarePlus className="w-3 h-3" /> New Group
          </button>
        </div>

        {isLoading ? (
          <div className="p-4 text-center text-xs text-gray-500">Loading chats...</div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-xs text-gray-500">
            No active conversations yet. Search users above or create a group!
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = activeConversation?.id === conv.id;
            const title = getConversationTitle(conv, currentUser?.id);
            const avatar = getConversationAvatar(conv, currentUser?.id);
            const online = isPartnerOnline(conv, currentUser?.id, onlineUsers);
            // The open conversation is being read, so it never shows a badge.
            const unread = isActive ? 0 : (conv.unreadCount ?? 0);

            return (
              <button
                key={conv.id}
                onClick={() => setActiveConversation(conv)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition relative ${
                  isActive
                    ? "bg-indigo-600/30 border border-indigo-500/40 text-white shadow-lg"
                    : "hover:bg-white/5 text-gray-300"
                }`}
              >
                <div className="relative shrink-0">
                  {conv.type === "group" ? (
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white font-bold">
                      <Users className="w-5 h-5" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center font-bold text-white overflow-hidden border border-white/10">
                      {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatar} alt={title} className="w-full h-full object-cover" />
                      ) : (
                        title.charAt(0).toUpperCase()
                      )}
                    </div>
                  )}

                  {conv.type === "direct" && (
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-950 ${
                        online ? "bg-emerald-500" : "bg-gray-600"
                      }`}
                    ></span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-white truncate">{title}</p>
                    {getEncryptionMode(conv, currentUser?.id).kind !== "none" && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        E2EE
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p
                      className={`flex-1 text-[11px] truncate ${unread > 0 ? "text-gray-200 font-semibold" : "text-gray-400"}`}
                    >
                      {latestPreview(conv.latestMessage)}
                    </p>
                    {unread > 0 && (
                      <span
                        aria-label={`${unread >= 100 ? "99+" : unread} unread messages`}
                        className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center"
                      >
                        {unread >= 100 ? "99+" : unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function latestPreview(latest: IConversation["latestMessage"]): string {
  if (!latest) return "No messages yet";
  if (latest.isDeleted) return "Message deleted";
  if (latest.content) return latest.content;
  if (latest.type === "image") return latest.isEncrypted ? "🔒 📷 Photo" : "📷 Photo";
  if (latest.type === "file") return latest.isEncrypted ? "🔒 📎 File" : "📎 File";
  return "🔒 Encrypted message";
}
