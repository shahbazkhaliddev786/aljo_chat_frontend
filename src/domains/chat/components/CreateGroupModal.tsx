"use client";

import { useState } from "react";
import { useChatStore } from "@/shared/stores/chat.store";
import { useAuthStore } from "@/shared/stores/auth.store";
import { useUserSearch } from "@/domains/user/hooks/useUserSearch";
import { useCreateGroupConversationMutation } from "@/domains/chat/hooks/useConversationMutations";
import { X, Search, Users, AlertCircle, Check } from "lucide-react";
import { IUser } from "@/domains/user/types";

export default function CreateGroupModal() {
  const isCreateGroupOpen = useChatStore((s) => s.isCreateGroupOpen);
  const setCreateGroupOpen = useChatStore((s) => s.setCreateGroupOpen);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const currentUser = useAuthStore((s) => s.user);

  const [title, setTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<IUser[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const { data: searchResults = [], isLoading: isSearching } = useUserSearch(searchQuery);
  const createGroupMutation = useCreateGroupConversationMutation();

  if (!isCreateGroupOpen) return null;

  // Total members = Creator (1) + selected users (selectedUsers.length)
  const totalMemberCount = (currentUser ? 1 : 0) + selectedUsers.length;
  const isThresholdMet = totalMemberCount >= 3;

  const toggleUserSelection = (user: IUser) => {
    if (selectedUsers.some((u) => u.id === user.id)) {
      setSelectedUsers(selectedUsers.filter((u) => u.id !== user.id));
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!title.trim()) {
      setErrorMsg("Group title is required.");
      return;
    }

    if (!isThresholdMet) {
      setErrorMsg("Group chat requires at least 3 distinct members. Please select at least 2 other users.");
      return;
    }

    try {
      const memberIds = selectedUsers.map((u) => u.id);
      const conversation = await createGroupMutation.mutateAsync({
        title: title.trim(),
        memberIds,
      });

      setActiveConversation(conversation);
      setCreateGroupOpen(false);
      setTitle("");
      setSelectedUsers([]);
      setSearchQuery("");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } }; message?: string };
      setErrorMsg(error.response?.data?.message || error.message || "Failed to create group");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-lg glass-panel rounded-2xl p-6 shadow-2xl relative border border-white/10 animate-in fade-in zoom-in duration-200">
        <button
          onClick={() => setCreateGroupOpen(false)}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Create Group Chat</h2>
            <p className="text-sm text-gray-400">Groups require at least 3 members (You + 2 members)</p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-500/20 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleCreateGroup} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
              Group Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Engineering Team"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl glass-input text-sm"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Add Members ({totalMemberCount}/3+ minimum)
              </label>
              <span className={`text-xs font-semibold ${isThresholdMet ? "text-emerald-400" : "text-amber-400"}`}>
                {isThresholdMet ? "✓ Ready to create" : `Select ${3 - totalMemberCount} more user(s)`}
              </span>
            </div>

            {/* Search Input */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search users by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl glass-input text-sm"
              />
            </div>

            {/* Selected Users Pills */}
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3 max-h-24 overflow-y-auto p-2 bg-slate-900/40 rounded-xl border border-white/5">
                {selectedUsers.map((u) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-600/30 border border-indigo-500/40 rounded-full text-xs text-indigo-200"
                  >
                    {u.name}
                    <button
                      type="button"
                      onClick={() => toggleUserSelection(u)}
                      className="hover:text-white ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search Results list */}
            <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
              {isSearching ? (
                <p className="text-xs text-gray-400 text-center py-4">Searching users...</p>
              ) : searchResults.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">
                  {searchQuery ? "No users found" : "Type above to search users"}
                </p>
              ) : (
                searchResults.map((user) => {
                  const isSelected = selectedUsers.some((u) => u.id === user.id);
                  return (
                    <button
                      type="button"
                      key={user.id}
                      onClick={() => toggleUserSelection(user)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl transition ${
                        isSelected
                          ? "bg-indigo-600/20 border border-indigo-500/40 text-white"
                          : "hover:bg-white/5 text-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white text-xs">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-white">{user.name}</p>
                          <p className="text-xs text-gray-400">{user.email}</p>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-indigo-400" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setCreateGroupOpen(false)}
              className="px-4 py-2 text-sm text-gray-300 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isThresholdMet || createGroupMutation.isPending}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition ${
                isThresholdMet
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30"
                  : "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700"
              }`}
            >
              {createGroupMutation.isPending ? "Creating..." : "Create Group (Min 3)"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
