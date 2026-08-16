"use client";

import { useState } from "react";
import { useAuthStore } from "@/shared/stores/auth.store";
import { useUserSearch } from "@/domains/user/hooks/useUserSearch";
import { useAddGroupMembersMutation, useRemoveGroupMemberMutation } from "@/domains/chat/hooks/useConversationMutations";
import { X, Search, Users, UserPlus, UserMinus, ShieldAlert, Check } from "lucide-react";
import { IConversation } from "@/domains/chat/types";
import { IUser } from "@/domains/user/types";

interface ManageMembersModalProps {
  conversation: IConversation;
  isOpen: boolean;
  onClose: () => void;
}

export default function ManageMembersModal({
  conversation,
  isOpen,
  onClose,
}: ManageMembersModalProps) {
  const currentUser = useAuthStore((s) => s.user);

  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const { data: searchResults = [], isLoading: isSearching } = useUserSearch(searchQuery);
  const addMembersMutation = useAddGroupMembersMutation();
  const removeMemberMutation = useRemoveGroupMemberMutation();

  if (!isOpen) return null;

  const currentMemberIds = new Set(conversation.members.map((m) => m.id));

  const handleAddUser = async (user: IUser) => {
    setErrorMsg("");
    try {
      await addMembersMutation.mutateAsync({
        conversationId: conversation.id,
        memberIds: [user.id],
      });
      setSearchQuery("");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } }; message?: string };
      setErrorMsg(error.response?.data?.message || error.message || "Failed to add member");
    }
  };

  const handleRemoveUser = async (targetUserId: string) => {
    setErrorMsg("");
    try {
      await removeMemberMutation.mutateAsync({
        conversationId: conversation.id,
        targetUserId,
      });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } }; message?: string };
      setErrorMsg(error.response?.data?.message || error.message || "Failed to remove member");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-lg glass-panel rounded-2xl p-6 shadow-2xl relative border border-white/10 animate-in fade-in zoom-in duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Manage Group Members</h2>
            <p className="text-sm text-gray-400">{conversation.title || "Group Chat"} ({conversation.members.length} members)</p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-500/20 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Current Members Section */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
            Current Members
          </h3>
          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {conversation.members.map((member) => {
              const isMe = member.id === currentUser?.id;
              const isAdmin = member.role === "admin";

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/50 border border-white/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/30 flex items-center justify-center font-bold text-indigo-300 text-xs">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-white">{member.name} {isMe && "(You)"}</p>
                        {isAdmin && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400">{member.email}</p>
                    </div>
                  </div>

                  {!isMe && !isAdmin && (
                    <button
                      onClick={() => handleRemoveUser(member.id)}
                      disabled={removeMemberMutation.isPending}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition flex items-center gap-1"
                    >
                      <UserMinus className="w-3.5 h-3.5" /> Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Add Members Section */}
        <div>
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
            Add New Member
          </h3>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users to add..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl glass-input text-sm"
            />
          </div>

          {searchQuery.trim() && (
            <div className="max-h-40 overflow-y-auto space-y-1 pr-1 bg-slate-900/60 p-2 rounded-xl border border-white/5">
              {isSearching ? (
                <p className="text-xs text-gray-400 text-center py-3">Searching users...</p>
              ) : searchResults.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">No users found</p>
              ) : (
                searchResults.map((user) => {
                  const isAlreadyMember = currentMemberIds.has(user.id);

                  return (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-indigo-600/30 flex items-center justify-center text-xs font-bold text-indigo-200">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-white">{user.name}</p>
                          <p className="text-[10px] text-gray-400">{user.email}</p>
                        </div>
                      </div>

                      {isAlreadyMember ? (
                        <span className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-400" /> Added
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddUser(user)}
                          disabled={addMembersMutation.isPending}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1"
                        >
                          <UserPlus className="w-3.5 h-3.5" /> Add
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-white/10 flex items-center justify-end mt-4">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
