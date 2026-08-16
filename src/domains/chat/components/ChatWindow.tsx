"use client";

import { useState, useEffect, useRef } from "react";
import { useChatStore } from "@/shared/stores/chat.store";
import { useAuthStore } from "@/shared/stores/auth.store";
import { useCryptoStore } from "@/shared/stores/crypto.store";
import { useSocketStore } from "@/shared/stores/socket.store";
import { useCallStore } from "@/shared/stores/call.store";
import { useMessages } from "@/domains/chat/hooks/useMessages";
import { useSendMessageMutation } from "@/domains/chat/hooks/useMessageMutations";
import {
  useLeaveGroupMutation,
  useDeleteGroupMutation,
  useDeleteDirectMutation,
} from "@/domains/chat/hooks/useConversationMutations";
import { useDirectCall } from "@/domains/call/hooks/useDirectCall";
import { useGroupCall } from "@/domains/call/hooks/useGroupCall";

import { encryptE2EEMessage, decryptE2EEMessage } from "@/shared/lib/crypto";
import {
  Lock,
  Send,
  Image as ImageIcon,
  CheckCheck,
  Users,
  ShieldCheck,
  Sparkles,
  MoreVertical,
  LogOut,
  Trash2,
  AlertTriangle,
  UserPlus,
  Phone,
  Video,
} from "lucide-react";
import ManageMembersModal from "@/domains/chat/components/ManageMembersModal";
import { IUser } from "@/domains/user";

export default function ChatWindow() {
  const activeConversation = useChatStore((s) => s.activeConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const currentUser = useAuthStore((s) => s.user);

  const { initializeCrypto, privateKey } = useCryptoStore();
  const socket = useSocketStore((s) => s.socket);
  const typingUsers = useChatStore((s) => s.typingUsers);

  // Call Domain hooks & stores
  const { status: callStatus, activeCall } = useCallStore();
  const { initiateCall, acceptCall, rejectCall, terminateCall: terminateDirectCall } = useDirectCall();
  const { joinGroupCall, leaveGroupCall } = useGroupCall();

  const { data: rawMessages = [], isLoading } = useMessages(activeConversation?.id || null);
  const sendMessageMutation = useSendMessageMutation();
  const leaveGroupMutation = useLeaveGroupMutation();
  const deleteGroupMutation = useDeleteGroupMutation();
  const deleteDirectMutation = useDeleteDirectMutation();

  const [inputText, setInputText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [decryptedMap, setDecryptedMap] = useState<Record<string, string>>({});
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isManageMembersOpen, setIsManageMembersOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"leave" | "deleteGroup" | "deleteDirect" | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  // Initialize E2EE Crypto Engine on mount
  useEffect(() => {
    initializeCrypto().catch(console.error);
  }, [initializeCrypto]);

  // Join Socket.io conversation room when active conversation changes
  useEffect(() => {
    if (!socket || !activeConversation) return;

    socket.emit("join_conversation", { conversationId: activeConversation.id });

    return () => {
      socket.emit("leave_conversation", { conversationId: activeConversation.id });
    };
  }, [socket, activeConversation]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rawMessages, decryptedMap]);

  // Decrypt incoming E2EE messages in real-time
  useEffect(() => {
    if (!privateKey || !activeConversation) return;

    let isMounted = true;

    const decryptAll = async () => {
      const partner = activeConversation.members.find((m) => m.id !== currentUser?.id);
      const newEntries: Record<string, string> = {};
      let hasNewDecryption = false;

      for (const msg of rawMessages) {
        if (msg.isEncrypted && msg.ciphertext && msg.iv && !decryptedMap[msg.id]) {
          try {
            const senderPubKey =
              msg.senderId === currentUser?.id
                ? partner?.publicKey || msg.sender?.publicKey
                : msg.sender?.publicKey || partner?.publicKey;

            if (senderPubKey && privateKey) {
              const plain = await decryptE2EEMessage(
                msg.ciphertext,
                msg.iv,
                senderPubKey,
                privateKey
              );
              newEntries[msg.id] = plain;
              hasNewDecryption = true;
            }
          } catch (err) {
            console.error("Failed to decrypt message:", msg.id, err);
            newEntries[msg.id] = "[Unable to decrypt message]";
            hasNewDecryption = true;
          }
        }
      }

      if (isMounted && hasNewDecryption) {
        setDecryptedMap((prev) => ({ ...prev, ...newEntries }));
      }
    };

    decryptAll();

    return () => {
      isMounted = false;
    };
  }, [rawMessages, privateKey, activeConversation, currentUser]);

  if (!activeConversation) {
    return (
      <div className="flex-1 h-full glass-panel flex flex-col items-center justify-center p-8 text-center bg-slate-950/40">
        <div className="w-16 h-16 rounded-3xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 shadow-xl">
          <Sparkles className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Welcome to aljo-chat</h2>
        <p className="text-sm text-gray-400 max-w-md">
          Select a conversation from the sidebar or search users to start an end-to-end encrypted chat!
        </p>
      </div>
    );
  }

  const isDirectChat = activeConversation.type === "direct";
  const partner = activeConversation.members.find((m) => m.id !== currentUser?.id);
  const currentMemberRecord = activeConversation.members.find((m) => m.id === currentUser?.id);
  const isAdmin = currentMemberRecord?.role === "admin" || activeConversation.createdBy === currentUser?.id;
  const activeTypers = typingUsers[activeConversation.id] || [];

  const handleStartCall = (callType: "audio" | "video") => {
    if (isDirectChat && partner) {
      initiateCall(activeConversation, partner as unknown as IUser, callType);
    } else {
      joinGroupCall(activeConversation, callType, true);
    }
  };

  const handleEndCall = () => {
    if (activeCall?.mode === "group") {
      leaveGroupCall(activeConversation.id);
    } else {
      terminateDirectCall();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    if (socket && activeConversation) {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        socket.emit("typing_start", {
          conversationId: activeConversation.id,
          userName: currentUser?.name || "User",
        });
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        isTypingRef.current = false;
        socket.emit("typing_stop", {
          conversationId: activeConversation.id,
          userName: currentUser?.name || "User",
        });
      }, 2000);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !selectedFile) return;

    const messageText = inputText.trim();
    setInputText("");
    const fileToSend = selectedFile;
    setSelectedFile(null);

    try {
      let isEncrypted = false;
      let ciphertext: string | undefined;
      let iv: string | undefined;

      if (isDirectChat && partner?.publicKey && privateKey && messageText) {
        const encrypted = await encryptE2EEMessage(messageText, partner.publicKey, privateKey);
        isEncrypted = true;
        ciphertext = encrypted.ciphertext;
        iv = encrypted.iv;
      }

      const msgType: "text" | "image" | "file" | "audio" = fileToSend
        ? fileToSend.type.startsWith("image/")
          ? "image"
          : "file"
        : "text";

      const payload = {
        conversationId: activeConversation.id,
        content: isEncrypted ? undefined : messageText,
        file: fileToSend || undefined,
        type: msgType,
        isEncrypted,
        ciphertext,
        iv,
      };

      if (socket && !fileToSend) {
        socket.emit("send_message", {
          conversationId: activeConversation.id,
          content: messageText,
          isEncrypted,
          ciphertext,
          iv,
        });
      } else {
        await sendMessageMutation.mutateAsync(payload);
      }
    } catch (err) {
      console.error("Failed to send message", err);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction || !activeConversation) return;

    try {
      if (confirmAction === "leave") {
        await leaveGroupMutation.mutateAsync(activeConversation.id);
      } else if (confirmAction === "deleteGroup") {
        await deleteGroupMutation.mutateAsync(activeConversation.id);
      } else if (confirmAction === "deleteDirect") {
        await deleteDirectMutation.mutateAsync(activeConversation.id);
      }

      setActiveConversation(null);
      setConfirmAction(null);
      setIsMenuOpen(false);
    } catch (err) {
      console.error("Failed action:", confirmAction, err);
    }
  };

  const isCallActive = (callStatus === "connected" || callStatus === "calling") && activeCall;

  return (
    <div className="flex-1 h-full glass-panel flex flex-col bg-slate-950/40 relative overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-950/60 backdrop-blur-md relative z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold shadow-md">
            {isDirectChat ? partner?.name.charAt(0).toUpperCase() : <Users className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">
                {isDirectChat ? partner?.name : activeConversation.title || "Group Chat"}
              </h2>
              {isDirectChat && (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <ShieldCheck className="w-3 h-3" /> E2EE Encrypted
                </span>
              )}
            </div>

            <p className="text-xs text-gray-400">
              {activeTypers.length > 0
                ? `${activeTypers.join(", ")} is typing...`
                : isDirectChat
                  ? partner?.email
                  : `${activeConversation.members.length} members`}
            </p>
          </div>
        </div>

        {/* Action Controls (Calls + Menu) */}
        <div className="flex items-center gap-2">
          {/* Audio Call Button */}
          <button
            onClick={() => handleStartCall("audio")}
            title="Start Audio Call"
            className="p-2 rounded-xl text-gray-300 hover:text-emerald-400 hover:bg-emerald-500/10 transition"
          >
            <Phone className="w-5 h-5" />
          </button>

          {/* Video Call Button */}
          <button
            onClick={() => handleStartCall("video")}
            title="Start Video Call"
            className="p-2 rounded-xl text-gray-300 hover:text-indigo-400 hover:bg-indigo-500/10 transition"
          >
            <Video className="w-5 h-5" />
          </button>

          {/* Header Action Menu Button */}
          <div className="relative">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {/* Action Menu Dropdown */}
            {isMenuOpen && (
              <div className="absolute right-0 top-10 w-52 glass-panel rounded-2xl p-1.5 shadow-2xl border border-white/10 z-30 animate-in fade-in zoom-in duration-150">
                {isDirectChat ? (
                  <button
                    onClick={() => setConfirmAction("deleteDirect")}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 rounded-xl transition"
                  >
                    <Trash2 className="w-4 h-4" /> Delete Conversation
                  </button>
                ) : (
                  <>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          setIsManageMembersOpen(true);
                          setIsMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-indigo-300 hover:bg-indigo-600/20 rounded-xl transition mb-1"
                      >
                        <UserPlus className="w-4 h-4 text-indigo-400" /> Manage Members
                      </button>
                    )}

                    <button
                      onClick={() => setConfirmAction("leave")}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/10 rounded-xl transition"
                    >
                      <LogOut className="w-4 h-4" /> Leave Group
                    </button>

                    {isAdmin && (
                      <button
                        onClick={() => setConfirmAction("deleteGroup")}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 rounded-xl transition mt-1 border-t border-white/5 pt-2"
                      >
                        <Trash2 className="w-4 h-4" /> Delete Entire Group
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Manage Members Modal */}
          {isManageMembersOpen && (
            <ManageMembersModal
              conversation={activeConversation}
              isOpen={isManageMembersOpen}
              onClose={() => setIsManageMembersOpen(false)}
            />
          )}

          {/* Confirmation Modal */}
          {confirmAction && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm glass-panel p-6 rounded-2xl border border-white/10 shadow-2xl animate-in zoom-in duration-200">
                <div className="flex items-center gap-3 mb-4 text-amber-400">
                  <AlertTriangle className="w-6 h-6 shrink-0" />
                  <h3 className="text-base font-bold text-white">Confirm Action</h3>
                </div>

                <p className="text-xs text-gray-300 mb-6">
                  {confirmAction === "leave"
                    ? "Are you sure you want to leave this group chat?"
                    : confirmAction === "deleteGroup"
                      ? "Are you sure you want to delete this entire group? All messages and attachments will be deleted permanently for all members."
                      : "Are you sure you want to delete this direct chat? This action cannot be undone."}
                </p>

                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmAction}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition"
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {isLoading ? (
              <div className="text-center text-xs text-gray-500 py-10">Loading message history...</div>
            ) : rawMessages.length === 0 ? (
              <div className="text-center text-xs text-gray-500 py-10">
                No messages yet. Send a message to start chatting!
              </div>
            ) : (
              rawMessages.map((msg) => {
                const isMe = msg.senderId === currentUser?.id;
                const displayContent = msg.isEncrypted
                  ? decryptedMap[msg.id] || "🔒 Decrypting..."
                  : msg.content;

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 max-w-[80%] ${isMe ? "ml-auto flex-row-reverse" : ""}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-300 font-bold text-xs shrink-0">
                      {msg.sender?.name?.charAt(0).toUpperCase() || "U"}
                    </div>

                    <div>
                      <div
                        className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-lg relative ${isMe
                            ? "bg-indigo-600 text-white rounded-tr-none"
                            : "bg-slate-900/90 text-gray-200 border border-white/10 rounded-tl-none"
                          }`}
                      >
                        {!isMe && !isDirectChat && (
                          <p className="text-[10px] font-semibold text-indigo-400 mb-1">
                            {msg.sender?.name}
                          </p>
                        )}

                        {msg.isEncrypted && (
                          <div className="flex items-center gap-1 text-[10px] text-emerald-300 font-semibold mb-1">
                            <Lock className="w-3 h-3" /> End-to-End Encrypted
                          </div>
                        )}

                        {msg.mediaUrl && (
                          <div className="mb-2 rounded-xl overflow-hidden max-w-xs border border-white/10">
                            {msg.type === "image" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={msg.mediaUrl} alt="Attachment" className="w-full object-cover" />
                            ) : (
                              <a
                                href={msg.mediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 bg-slate-800 text-indigo-400 underline block"
                              >
                                📎 View Attachment
                              </a>
                            )}
                          </div>
                        )}

                        {displayContent && <p className="whitespace-pre-wrap">{displayContent}</p>}
                      </div>

                      <div
                        className={`flex items-center gap-1 mt-1 text-[10px] text-gray-500 ${isMe ? "justify-end" : "justify-start"
                          }`}
                      >
                        <span>
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {isMe && <CheckCheck className="w-3.5 h-3.5 text-indigo-400" />}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Selected File Preview */}
          {selectedFile && (
            <div className="px-4 py-2 bg-slate-900/80 border-t border-white/10 flex items-center justify-between">
              <span className="text-xs text-indigo-300 truncate">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </span>
              <button
                onClick={() => setSelectedFile(null)}
                className="text-xs text-rose-400 hover:underline"
              >
                Remove
              </button>
            </div>
          )}

          {/* Input Form */}
          <form
            onSubmit={handleSend}
            className="p-3 border-t border-white/10 bg-slate-950/80 flex items-center gap-2"
          >
            <label className="p-2.5 rounded-xl text-gray-400 hover:text-indigo-400 hover:bg-white/5 cursor-pointer transition">
              <ImageIcon className="w-5 h-5" />
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>

            <input
              type="text"
              placeholder={
                isDirectChat
                  ? "Type an encrypted message..."
                  : "Type a message to group..."
              }
              value={inputText}
              onChange={handleInputChange}
              className="flex-1 px-4 py-2.5 rounded-xl glass-input text-xs"
            />

            <button
              type="submit"
              disabled={!inputText.trim() && !selectedFile}
              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-gray-800 disabled:text-gray-600 transition shadow-lg shadow-indigo-600/30"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
    </div>
  );
}
