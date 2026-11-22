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

import { encryptFile, keyFingerprint } from "@/shared/lib/crypto";
import { checkContactKey, trustContactKey, KeyTrust, wasKeyKnown, rememberContactKey } from "@/shared/lib/known-keys";
import {
  getEncryptionMode,
  encryptForConversation,
  decryptMessage,
  buildAttachmentText,
  parseAttachmentText,
  decryptionCacheKey,
  AttachmentMeta,
} from "@/domains/chat/utils/message-crypto";
import { editMessage, deleteMessage, toggleReaction } from "@/domains/chat/services/message-actions";
import { IMessage } from "@/domains/chat/types";
import MessageItem from "@/domains/chat/components/MessageItem";
import SafetyNumberModal from "@/domains/chat/components/SafetyNumberModal";
import {
  Send,
  Image as ImageIcon,
  X,
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
  const [replyTo, setReplyTo] = useState<IMessage | null>(null);
  const [editing, setEditing] = useState<IMessage | null>(null);
  const [isSafetyOpen, setIsSafetyOpen] = useState(false);
  const [keyTrustState, setKeyTrust] = useState<{ forKey: string; fingerprint: string; trust: KeyTrust } | null>(null);

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

  // Decrypt E2EE messages (direct and group). Cached per message *version*, so
  // an edit (re-encrypted with a new iv) is decrypted again.
  useEffect(() => {
    if (!privateKey || !activeConversation || !currentUser) return;
    let isMounted = true;

    (async () => {
      const newEntries: Record<string, string> = {};
      for (const msg of rawMessages) {
        const key = decryptionCacheKey(msg);
        if (!msg.isEncrypted || msg.isDeleted || !msg.ciphertext || decryptedMap[key] !== undefined) continue;
        try {
          newEntries[key] = await decryptMessage(msg, activeConversation, currentUser.id, privateKey);
        } catch (err) {
          console.error("Failed to decrypt message:", msg.id, err);
          newEntries[key] = "[Unable to decrypt message]";
        }
      }
      if (isMounted && Object.keys(newEntries).length > 0) {
        setDecryptedMap((prev) => ({ ...prev, ...newEntries }));
      }
    })();

    return () => {
      isMounted = false;
    };
    // decryptedMap is read only to skip work already done
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawMessages, privateKey, activeConversation, currentUser]);

  // Key-change detection for direct chats (trust on first use + safety numbers).
  const directPartner =
    activeConversation?.type === "direct"
      ? activeConversation.members.find((m) => m.id !== currentUser?.id)
      : undefined;
  const directPartnerKey = directPartner?.publicKey;
  const directPartnerId = directPartner?.id;
  useEffect(() => {
    if (!currentUser || !directPartnerId || !directPartnerKey) return;
    let cancelled = false;
    keyFingerprint(directPartnerKey)
      .then((fingerprint) => {
        if (cancelled) return;
        const trust = checkContactKey(currentUser.id, directPartnerId, fingerprint);
        setKeyTrust({ forKey: directPartnerKey, fingerprint, trust });
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [currentUser, directPartnerId, directPartnerKey]);
  // Only trust results computed for the partner's *current* key.
  const keyTrust = keyTrustState && keyTrustState.forKey === directPartnerKey ? keyTrustState : null;

  // Remember every member's key (groups too), so a key that later disappears is noticed.
  const memberKeys = (activeConversation?.members ?? [])
    .filter((m) => m.id !== currentUser?.id && m.publicKey)
    .map((m) => `${m.id}|${m.publicKey}`)
    .join(",");
  useEffect(() => {
    if (!currentUser || !memberKeys) return;
    for (const entry of memberKeys.split(",")) {
      const [id, key] = [entry.slice(0, entry.indexOf("|")), entry.slice(entry.indexOf("|") + 1)];
      keyFingerprint(key)
        .then((fingerprint) => rememberContactKey(currentUser.id, id, fingerprint))
        .catch(console.error);
    }
  }, [currentUser, memberKeys]);

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

  // Direct: pairwise key. Group: per-message key wrapped for every member.
  // If anyone has no key yet, messages are sent unencrypted and labelled as such.
  const encryptionMode = getEncryptionMode(activeConversation, currentUser?.id);
  const canEncrypt = encryptionMode.kind !== "none";
  // Members whose key we have seen before but which is now missing. Sending in
  // plaintext would silently downgrade an encrypted chat (e.g. a tampering
  // server removed the key), so sending is blocked instead.
  const lostKeyMembers = currentUser
    ? activeConversation.members.filter(
        (m) => m.id !== currentUser.id && !m.publicKey && wasKeyKnown(currentUser.id, m.id)
      )
    : [];
  const lostKeyMessage =
    lostKeyMembers.length > 0
      ? `${lostKeyMembers.map((m) => m.name).join(", ")} no longer ${lostKeyMembers.length === 1 ? "has" : "have"} an encryption key. Messages won't be sent unencrypted; ask them to sign in again.`
      : null;
  const memberNames = Object.fromEntries(activeConversation.members.map((m) => [m.id, m.name]));

  /** Text to show for a message, or undefined while it is still being decrypted. */
  const resolveText = (msg: IMessage): string | undefined => {
    if (msg.localStatus) return msg.localPlaintext ?? (msg.localFileName ? `📎 ${msg.localFileName}` : "");
    if (msg.isDeleted) return "";
    if (msg.isEncrypted) return decryptedMap[decryptionCacheKey(msg)];
    return msg.content ?? "";
  };

  /** Split an encrypted attachment payload into caption + file metadata. */
  const resolveContent = (msg: IMessage): { text?: string; attachment?: AttachmentMeta } => {
    const text = resolveText(msg);
    if (text === undefined || !msg.isEncrypted || msg.localStatus || !(msg.type === "image" || msg.type === "file")) {
      return { text };
    }
    const { caption, file } = parseAttachmentText(text);
    return { text: caption ?? "", attachment: file };
  };

  const previewOf = (msg: IMessage): string => {
    if (msg.isDeleted) return "This message was deleted";
    const { text, attachment } = resolveContent(msg);
    if (attachment) return `📎 ${attachment.name}${text ? ` — ${text}` : ""}`;
    if (text === undefined) return "🔒 Encrypted message";
    return text || (msg.mediaUrl ? "📎 Attachment" : "");
  };

  const replyPreviewFor = (msg: IMessage) => {
    if (!msg.replyToId) return null;
    const original = rawMessages.find((m) => m.id === msg.replyToId);
    if (!original) return { name: "Earlier message", text: "Original message is not loaded" };
    return { name: original.sender?.name || "Someone", text: previewOf(original) };
  };

  const remember = (msg: IMessage | null, text: string) => {
    if (msg?.isEncrypted) setDecryptedMap((prev) => ({ ...prev, [decryptionCacheKey(msg)]: text }));
  };

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

  const keysMissingMessage = "Your encryption keys are not available on this device. Please sign in again.";

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) return handleSaveEdit();
    if (!inputText.trim() && !selectedFile) return;

    const messageText = inputText.trim();
    const fileToSend = selectedFile || undefined;
    setSendError(null);

    if (canEncrypt && (!privateKey || !publicKeyJwk)) {
      // Never silently fall back to plaintext in an encrypted chat.
      setSendError(keysMissingMessage);
      return;
    }
    if (!canEncrypt && lostKeyMessage) {
      setSendError(lostKeyMessage);
      return;
    }

    const type: "text" | "image" | "file" = fileToSend
      ? fileToSend.type.startsWith("image/")
        ? "image"
        : "file"
      : "text";
    let payload: OutgoingPayload = { type, isEncrypted: false, content: messageText || undefined, replyToId: replyTo?.id };
    let upload: File | undefined = fileToSend;
    let storedText = messageText;

    if (canEncrypt) {
      try {
        if (fileToSend) {
          // The file is encrypted with its own key; that key travels inside the encrypted message.
          const encrypted = await encryptFile(fileToSend);
          upload = new File([encrypted.blob], "encrypted.bin", { type: "application/octet-stream" });
          storedText = buildAttachmentText(
            { key: encrypted.key, iv: encrypted.iv, name: fileToSend.name, mime: fileToSend.type, size: fileToSend.size },
            messageText
          );
        }
        payload = {
          type,
          replyToId: replyTo?.id,
          ...(await encryptForConversation(encryptionMode, storedText, privateKey!, publicKeyJwk!)),
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
    setReplyTo(null);
    const stored = await send(activeConversation.id, payload, {
      plaintext: messageText || undefined,
      file: upload,
      fileName: fileToSend?.name,
    });
    remember(stored, storedText);
  };

  const startEdit = (msg: IMessage) => {
    setReplyTo(null);
    setEditing(msg);
    setInputText(resolveText(msg) ?? "");
  };

  const cancelComposerMode = () => {
    if (editing) setInputText("");
    setEditing(null);
    setReplyTo(null);
  };

  const handleSaveEdit = async () => {
    const msg = editing!;
    const newText = inputText.trim();
    if (!newText) return;
    if (newText === resolveText(msg)) return cancelComposerMode();
    setSendError(null);

    try {
      let fields: Parameters<typeof editMessage>[0] = { messageId: msg.id, content: newText };
      if (msg.isEncrypted) {
        if (!canEncrypt || !privateKey || !publicKeyJwk) {
          setSendError(canEncrypt ? keysMissingMessage : "This chat can no longer be encrypted, so the message cannot be edited.");
          return;
        }
        fields = { messageId: msg.id, ...(await encryptForConversation(encryptionMode, newText, privateKey, publicKeyJwk)) };
      }
      const { message } = await editMessage(fields);
      remember(message, newText);
      setEditing(null);
      setInputText("");
    } catch (err) {
      console.error("Failed to edit message", err);
      setSendError(err instanceof Error ? err.message : "Could not edit the message.");
    }
  };

  const handleDeleteMessage = async (msg: IMessage) => {
    if (!window.confirm("Delete this message for everyone?")) return;
    try {
      await deleteMessage(msg.id);
    } catch (err) {
      console.error("Failed to delete message", err);
      setSendError(err instanceof Error ? err.message : "Could not delete the message.");
    }
  };

  const handleReact = async (msg: IMessage, emoji: string) => {
    try {
      await toggleReaction(msg.id, emoji);
    } catch (err) {
      console.error("Failed to react", err);
    }
  };

  const handleRetry = async (msg: IMessage) => {
    const plaintext = msg.localPlaintext;
    let fresh: OutgoingPayload | undefined;
    // Re-encrypt text for the *current* members (someone may have joined since).
    if (canEncrypt && privateKey && publicKeyJwk && plaintext && msg.type === "text") {
      fresh = {
        type: "text",
        replyToId: msg.replyToId ?? undefined,
        ...(await encryptForConversation(encryptionMode, plaintext, privateKey, publicKeyJwk)),
      };
    }
    const stored = await retry(msg.clientMessageId!, fresh);
    if (plaintext && stored?.type === "text") remember(stored, plaintext);
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
              {canEncrypt ? (
                isDirectChat && publicKeyJwk && partner?.publicKey ? (
                  <button
                    onClick={() => setIsSafetyOpen(true)}
                    title="Verify this chat's encryption with a safety number"
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    {keyTrust?.trust === "verified" ? "E2EE · Verified" : "E2EE Encrypted"}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <ShieldCheck className="w-3 h-3" /> E2EE Encrypted
                  </span>
                )
              ) : (
                <span
                  title={`${encryptionMode.kind === "none" ? encryptionMode.reason : ""} Messages are not end-to-end encrypted.`}
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30"
                >
                  Not encrypted
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

      {isSafetyOpen && partner?.publicKey && publicKeyJwk && keyTrust && (
        <SafetyNumberModal
          partnerName={partner.name}
          myPublicKey={publicKeyJwk}
          partnerPublicKey={partner.publicKey}
          isVerified={keyTrust.trust === "verified"}
          onVerify={() => {
            trustContactKey(currentUser!.id, partner.id, keyTrust.fingerprint, true);
            setKeyTrust({ ...keyTrust, trust: "verified" });
          }}
          onClose={() => setIsSafetyOpen(false)}
        />
      )}

      {keyTrust?.trust === "changed" && partner && (
        <div role="alert" className="px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/30 text-xs text-amber-200 flex flex-wrap items-center gap-2">
          <span className="flex-1 min-w-[200px]">
            {partner.name}&apos;s security code changed. This is normal after they reset their account, but it could
            also mean someone is intercepting the chat.
          </span>
          <button onClick={() => setIsSafetyOpen(true)} className="underline font-semibold">
            Verify
          </button>
          <button
            onClick={() => {
              trustContactKey(currentUser!.id, partner.id, keyTrust.fingerprint, false);
              setKeyTrust({ ...keyTrust, trust: "same" });
            }}
            className="underline"
          >
            Dismiss
          </button>
        </div>
      )}

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
                const { text, attachment } = resolveContent(msg);
                const readers = readCountAt(index);
                const readByAll = otherMembers.length > 0 && readers === otherMembers.length;
                const receipt = {
                  readByAll,
                  label: readByAll
                    ? isDirectChat
                      ? "Read"
                      : "Read by everyone"
                    : !isDirectChat && readers > 0
                      ? `Read by ${readers} of ${otherMembers.length}`
                      : "Sent",
                };
                return (
                  <MessageItem
                    key={msg.id}
                    msg={msg}
                    isMe={isMe}
                    showSenderName={!isDirectChat}
                    text={text}
                    attachment={attachment}
                    replyPreview={replyPreviewFor(msg)}
                    receipt={receipt}
                    myUserId={currentUser?.id}
                    memberNames={memberNames}
                    onReply={() => {
                      setEditing(null);
                      setReplyTo(msg);
                    }}
                    onEdit={isMe && msg.type === "text" && text !== undefined ? () => startEdit(msg) : undefined}
                    onDelete={isMe ? () => handleDeleteMessage(msg) : undefined}
                    onReact={(emoji) => handleReact(msg, emoji)}
                    onRetry={() => handleRetry(msg)}
                    onDiscard={() => discard(msg.conversationId, msg.clientMessageId!)}
                  />
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

          {(replyTo || editing) && (
            <div className="px-4 py-2 bg-slate-900/80 border-t border-white/10 flex items-center gap-3 text-xs">
              <div className="flex-1 min-w-0 border-l-2 border-indigo-400 pl-2">
                <p className="font-semibold text-indigo-300">
                  {editing ? "Editing message" : `Replying to ${replyTo!.sender?.name || "message"}`}
                </p>
                <p className="text-gray-400 truncate">{previewOf((editing || replyTo)!)}</p>
              </div>
              <button onClick={cancelComposerMode} aria-label="Cancel" className="p-1 text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {lostKeyMessage && !sendError && (
            <div role="alert" className="px-4 py-2 bg-rose-500/10 border-t border-rose-500/30 text-xs text-rose-300">
              {lostKeyMessage}
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
            <label
              aria-label="Attach a file"
              className={`p-2.5 rounded-xl text-gray-400 hover:text-indigo-400 hover:bg-white/5 cursor-pointer transition ${editing ? "hidden" : ""}`}
            >
              <ImageIcon className="w-5 h-5" />
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,application/zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,audio/*,video/mp4,video/webm"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>

            <input
              type="text"
              placeholder={
                editing ? "Edit your message..." : canEncrypt ? "Type an encrypted message..." : "Type a message..."
              }
              aria-label="Message"
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelComposerMode();
              }}
              className="flex-1 px-4 py-2.5 rounded-xl glass-input text-xs"
            />

            <button
              type="submit"
              disabled={!inputText.trim() && !selectedFile}
              aria-label={editing ? "Save edit" : "Send message"}
              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-gray-800 disabled:text-gray-600 transition shadow-lg shadow-indigo-600/30"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
    </div>
  );
}
