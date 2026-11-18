"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useChatStore } from "@/shared/stores/chat.store";
import { useAuthStore } from "@/shared/stores/auth.store";
import { useCryptoStore } from "@/shared/stores/crypto.store";
import { useSocketStore } from "@/shared/stores/socket.store";
import { useMessages, useOlderMessages } from "@/domains/chat/hooks/useMessages";
import { useConversations } from "@/domains/chat/hooks/useConversations";
import { useSendMessage, OutgoingPayload } from "@/domains/chat/hooks/useSendMessage";
import {
  useLeaveGroupMutation,
  useDeleteGroupMutation,
  useDeleteDirectMutation,
} from "@/domains/chat/hooks/useConversationMutations";
import { startCall } from "@/domains/call/services/call.controller";

import { encryptE2EEMessage, decryptE2EEMessage } from "@/shared/lib/crypto";
import {
  Lock,
  Send,
  Image as ImageIcon,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
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

export default function ChatWindow() {
  const selectedConversation = useChatStore((s) => s.activeConversation);
  // The store holds a snapshot taken when the chat was opened; always prefer the
  // live copy so member lists, roles and encryption keys stay current.
  const { data: conversations } = useConversations();
  const activeConversation =
    (selectedConversation && conversations?.find((c) => c.id === selectedConversation.id)) || selectedConversation;
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const currentUser = useAuthStore((s) => s.user);

  const { loadKeys, privateKey, publicKeyJwk } = useCryptoStore();
  const socket = useSocketStore((s) => s.socket);
  const typingUsers = useChatStore((s) => s.typingUsers);

  const { data: rawMessages = [], isLoading } = useMessages(activeConversation?.id || null);
  const { hasMore, isLoading: isLoadingOlder, loadOlder } = useOlderMessages(activeConversation?.id || null);
  const { send, retry, discard } = useSendMessage();
  const leaveGroupMutation = useLeaveGroupMutation();
  const deleteGroupMutation = useDeleteGroupMutation();
  const deleteDirectMutation = useDeleteDirectMutation();

  const [inputText, setInputText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [decryptedMap, setDecryptedMap] = useState<Record<string, string>>({});
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isManageMembersOpen, setIsManageMembersOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"leave" | "deleteGroup" | "deleteDirect" | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Scroll height before an older page is prepended, to keep the view in place.
  const prependAnchorRef = useRef<number | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  // Load this user's E2EE keys (restored at login from the password-wrapped backup).
  // Socket rooms for every conversation are joined server-side on connect, so
  // there is nothing to join/leave here when switching conversations.
  useEffect(() => {
    if (!currentUser) return;
    loadKeys(currentUser.id).catch(console.error);
  }, [currentUser, loadKeys]);

  // Scroll to the bottom only when a *new* message arrives at the end (not when
  // older history is loaded at the top).
  const newestMessageId = rawMessages[rawMessages.length - 1]?.id;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [newestMessageId, activeConversation?.id]);

  // After older messages are prepended, keep the same messages on screen.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (container && prependAnchorRef.current !== null) {
      container.scrollTop += container.scrollHeight - prependAnchorRef.current;
      prependAnchorRef.current = null;
    }
  }, [rawMessages.length]);

  // Read receipts: while this chat is on screen, mark the newest incoming message as read.
  const newestIncoming = [...rawMessages].reverse().find((m) => !m.localStatus && m.senderId !== currentUser?.id);
  const myLastRead = activeConversation?.members.find((m) => m.id === currentUser?.id)?.lastReadMessageId;
  const lastReadSentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!socket || !activeConversation || !newestIncoming) return;
    const markRead = () => {
      if (document.visibilityState !== "visible") return;
      if (newestIncoming.id === myLastRead || newestIncoming.id === lastReadSentRef.current) return;
      lastReadSentRef.current = newestIncoming.id;
      socket.emit("message_read", { conversationId: activeConversation.id, messageId: newestIncoming.id });
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [socket, activeConversation, newestIncoming, myLastRead]);

  const handleLoadOlder = () => {
    prependAnchorRef.current = scrollContainerRef.current?.scrollHeight ?? null;
    void loadOlder();
  };

  // Decrypt incoming E2EE messages in real-time
  useEffect(() => {
    if (!privateKey || !activeConversation) return;

    let isMounted = true;

    const decryptAll = async () => {
      const partnerMember = activeConversation.members.find((m) => m.id !== currentUser?.id);
      const newEntries: Record<string, string> = {};
      let hasNewDecryption = false;

      for (const msg of rawMessages) {
        if (msg.isEncrypted && msg.ciphertext && msg.iv && !decryptedMap[msg.id]) {
          try {
            // ECDH is symmetric: decrypt with *our* private key and the *other*
            // side's public key, using the exact keys recorded when the message
            // was sent (falls back to current keys for older messages).
            const counterpartPubKey =
              msg.senderId === currentUser?.id
                ? msg.recipientPublicKey || partnerMember?.publicKey
                : msg.senderPublicKey || msg.sender?.publicKey;

            if (counterpartPubKey && privateKey) {
              const plain = await decryptE2EEMessage(
                msg.ciphertext,
                msg.iv,
                counterpartPubKey,
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

  // For each other member, the index of the newest message they have read.
  // A read marker that is not in the loaded window points to older history.
  const messageIndex = new Map(rawMessages.map((m, i) => [m.id, i]));
  const otherMembers = activeConversation.members.filter((m) => m.id !== currentUser?.id);
  const readIndexes = otherMembers.map((m) => (m.lastReadMessageId ? (messageIndex.get(m.lastReadMessageId) ?? -1) : -1));
  const readCountAt = (index: number) => readIndexes.filter((r) => r >= index).length;

  // Direct chats are encrypted when both sides have published a key.
  const canEncrypt = isDirectChat && !!partner?.publicKey;

  const handleStartCall = (callType: "audio" | "video") => {
    void startCall(activeConversation, callType);
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
    const fileToSend = selectedFile || undefined;
    setSendError(null);

    let payload: OutgoingPayload = {
      type: fileToSend ? (fileToSend.type.startsWith("image/") ? "image" : "file") : "text",
      isEncrypted: false,
      content: messageText || undefined,
    };

    if (canEncrypt && messageText) {
      if (!privateKey || !publicKeyJwk) {
        // Never silently fall back to plaintext in an encrypted chat.
        setSendError("Your encryption keys are not available on this device. Please sign in again.");
        return;
      }
      try {
        const encrypted = await encryptE2EEMessage(messageText, partner!.publicKey!, privateKey);
        payload = {
          type: payload.type,
          // Plaintext is never sent for encrypted messages.
          isEncrypted: true,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          senderPublicKey: publicKeyJwk,
          recipientPublicKey: partner!.publicKey!,
        };
      } catch (err) {
        console.error("Failed to encrypt message", err);
        setSendError("Could not encrypt the message. Please try again.");
        return;
      }
    }

    // The message appears immediately as "sending"; failures stay in the list with a Retry button.
    setInputText("");
    setSelectedFile(null);
    const stored = await send(activeConversation.id, payload, { plaintext: messageText || undefined, file: fileToSend });
    if (stored?.isEncrypted && messageText) {
      setDecryptedMap((prev) => ({ ...prev, [stored.id]: messageText }));
    }
  };

  const handleRetry = async (clientMessageId: string, plaintext?: string) => {
    const stored = await retry(clientMessageId);
    if (stored?.isEncrypted && plaintext) {
      setDecryptedMap((prev) => ({ ...prev, [stored.id]: plaintext }));
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
              {isDirectChat &&
                (canEncrypt ? (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <ShieldCheck className="w-3 h-3" /> E2EE Encrypted
                  </span>
                ) : (
                  <span
                    title="This contact has not set up encryption yet. Messages are not end-to-end encrypted."
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  >
                    Not encrypted
                  </span>
                ))}
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
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {!isLoading && hasMore && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadOlder}
                  disabled={isLoadingOlder}
                  className="text-[11px] px-3 py-1.5 rounded-full bg-slate-800 text-gray-300 hover:bg-slate-700 disabled:opacity-60"
                >
                  {isLoadingOlder ? "Loading…" : "Load earlier messages"}
                </button>
              </div>
            )}
            {isLoading ? (
              <div className="text-center text-xs text-gray-500 py-10">Loading message history...</div>
            ) : rawMessages.length === 0 ? (
              <div className="text-center text-xs text-gray-500 py-10">
                No messages yet. Send a message to start chatting!
              </div>
            ) : (
              rawMessages.map((msg, index) => {
                const isMe = msg.senderId === currentUser?.id;
                const displayContent = msg.localStatus
                  ? msg.localPlaintext || (msg.localFileName ? `📎 ${msg.localFileName}` : "")
                  : msg.isEncrypted
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
                        {isMe && msg.localStatus === "sending" && (
                          <span className="inline-flex items-center gap-1" aria-label="Sending">
                            <Clock className="w-3 h-3" /> Sending…
                          </span>
                        )}
                        {isMe && msg.localStatus === "failed" && (
                          <span className="inline-flex items-center gap-1.5 text-rose-400" role="alert">
                            <AlertCircle className="w-3 h-3" /> Not sent
                            <button
                              type="button"
                              onClick={() => handleRetry(msg.clientMessageId!, msg.localPlaintext)}
                              className="underline font-semibold hover:text-rose-300"
                            >
                              Retry
                            </button>
                            <button
                              type="button"
                              onClick={() => discard(msg.conversationId, msg.clientMessageId!)}
                              className="underline hover:text-rose-300"
                            >
                              Delete
                            </button>
                          </span>
                        )}
                        {isMe &&
                          !msg.localStatus &&
                          (() => {
                            const readers = readCountAt(index);
                            const readByAll = otherMembers.length > 0 && readers === otherMembers.length;
                            const label = readByAll
                              ? isDirectChat
                                ? "Read"
                                : "Read by everyone"
                              : !isDirectChat && readers > 0
                                ? `Read by ${readers} of ${otherMembers.length}`
                                : "Sent";
                            return (
                              <span role="img" aria-label={label} title={label}>
                                {readByAll ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-sky-400" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 text-indigo-400" />
                                )}
                              </span>
                            );
                          })()}
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

          {sendError && (
            <div role="alert" className="px-4 py-2 bg-rose-500/10 border-t border-rose-500/30 text-xs text-rose-300">
              {sendError}
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
