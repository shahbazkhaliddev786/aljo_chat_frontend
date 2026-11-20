"use client";

import { useState } from "react";
import {
  Lock,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Reply,
  Pencil,
  Trash2,
  SmilePlus,
} from "lucide-react";
import { IMessage } from "@/domains/chat/types";
import { AttachmentMeta } from "@/domains/chat/utils/message-crypto";
import EncryptedAttachment from "./EncryptedAttachment";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export interface ReceiptInfo {
  label: string;
  readByAll: boolean;
}

interface MessageItemProps {
  msg: IMessage;
  isMe: boolean;
  showSenderName: boolean;
  /** Text to show (decrypted / plain). Undefined while still decrypting. */
  text?: string;
  /** Decrypted attachment of an encrypted image/file message. */
  attachment?: AttachmentMeta;
  replyPreview?: { name: string; text: string } | null;
  receipt?: ReceiptInfo;
  myUserId?: string;
  memberNames: Record<string, string>;
  onReply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onReact: (emoji: string) => void;
  onRetry: () => void;
  onDiscard: () => void;
}

export default function MessageItem({
  msg,
  isMe,
  showSenderName,
  text,
  attachment,
  replyPreview,
  receipt,
  myUserId,
  memberNames,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onRetry,
  onDiscard,
}: MessageItemProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const isConfirmed = !msg.localStatus;
  const canAct = isConfirmed && !msg.isDeleted;

  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`group flex gap-3 max-w-[80%] ${isMe ? "ml-auto flex-row-reverse" : ""}`}>
      <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-300 font-bold text-xs shrink-0">
        {msg.sender?.name?.charAt(0).toUpperCase() || "U"}
      </div>

      <div className="min-w-0">
        <div className="relative">
          <div
            className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-lg ${
              msg.isDeleted
                ? "bg-slate-900/50 text-gray-500 border border-white/5 italic"
                : isMe
                  ? "bg-indigo-600 text-white rounded-tr-none"
                  : "bg-slate-900/90 text-gray-200 border border-white/10 rounded-tl-none"
            }`}
          >
            {showSenderName && !isMe && (
              <p className="text-[10px] font-semibold text-indigo-400 mb-1 not-italic">{msg.sender?.name}</p>
            )}

            {msg.isDeleted ? (
              <p>This message was deleted</p>
            ) : (
              <>
                {replyPreview && (
                  <div
                    className={`mb-2 px-2.5 py-1.5 rounded-lg border-l-2 text-[11px] ${
                      isMe ? "bg-indigo-700/60 border-indigo-200" : "bg-slate-800 border-indigo-400"
                    }`}
                  >
                    <p className="font-semibold">{replyPreview.name}</p>
                    <p className="opacity-80 truncate max-w-[260px]">{replyPreview.text}</p>
                  </div>
                )}

                {msg.isEncrypted && (
                  <div className="flex items-center gap-1 text-[10px] text-emerald-300 font-semibold mb-1">
                    <Lock className="w-3 h-3" /> End-to-End Encrypted
                  </div>
                )}

                {msg.mediaUrl && (
                  <div className="mb-2 rounded-xl overflow-hidden max-w-xs border border-white/10">
                    {attachment ? (
                      <EncryptedAttachment url={msg.mediaUrl} meta={attachment} />
                    ) : msg.isEncrypted ? (
                      <div className="p-2 text-[11px] opacity-80">🔒 Decrypting attachment…</div>
                    ) : msg.type === "image" ? (
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

                {text === undefined ? (
                  <p className="opacity-80">🔒 Decrypting...</p>
                ) : (
                  text && <p className="whitespace-pre-wrap break-words">{text}</p>
                )}
              </>
            )}
          </div>

          {/* Actions (shown on hover and keyboard focus) */}
          {canAct && (
            <div
              className={`absolute -top-3 ${isMe ? "left-0 -translate-x-full pr-1" : "right-0 translate-x-full pl-1"} flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition`}
            >
              <ActionButton label="Reply" onClick={onReply}>
                <Reply className="w-3.5 h-3.5" />
              </ActionButton>
              <ActionButton label="Add reaction" onClick={() => setIsPickerOpen((v) => !v)}>
                <SmilePlus className="w-3.5 h-3.5" />
              </ActionButton>
              {onEdit && (
                <ActionButton label="Edit message" onClick={onEdit}>
                  <Pencil className="w-3.5 h-3.5" />
                </ActionButton>
              )}
              {onDelete && (
                <ActionButton label="Delete message" onClick={onDelete}>
                  <Trash2 className="w-3.5 h-3.5" />
                </ActionButton>
              )}
            </div>
          )}

          {isPickerOpen && canAct && (
            <div
              role="menu"
              aria-label="Reactions"
              // Opens *below* the bubble: above it, the picker would slide under the chat header for the first messages.
              onKeyDown={(e) => {
                if (e.key === "Escape") setIsPickerOpen(false);
              }}
              className={`absolute z-10 top-full mt-1 ${isMe ? "right-0" : "left-0"} flex gap-1 px-2 py-1 rounded-full bg-slate-900 border border-white/10 shadow-xl`}
            >
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  role="menuitem"
                  aria-label={`React with ${emoji}`}
                  onClick={() => {
                    onReact(emoji);
                    setIsPickerOpen(false);
                  }}
                  className="text-base hover:scale-125 transition"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reactions */}
        {!msg.isDeleted && msg.reactions && msg.reactions.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : ""}`}>
            {msg.reactions.map((r) => {
              const mine = !!myUserId && r.userIds.includes(myUserId);
              const names = r.userIds.map((id) => memberNames[id] || "Someone").join(", ");
              return (
                <button
                  key={r.emoji}
                  onClick={() => onReact(r.emoji)}
                  aria-pressed={mine}
                  aria-label={`${r.emoji} ${r.userIds.length}: ${names}`}
                  title={names}
                  className={`px-1.5 py-0.5 rounded-full text-[11px] border ${
                    mine ? "bg-indigo-600/30 border-indigo-400/60" : "bg-slate-800 border-white/10"
                  }`}
                >
                  {r.emoji} <span className="text-gray-300">{r.userIds.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Meta row: time, edited, delivery / read state */}
        <div className={`flex items-center gap-1 mt-1 text-[10px] text-gray-500 ${isMe ? "justify-end" : "justify-start"}`}>
          <span>{time}</span>
          {msg.isEdited && !msg.isDeleted && <span>· edited</span>}
          {isMe && msg.localStatus === "sending" && (
            <span className="inline-flex items-center gap-1" aria-label="Sending">
              <Clock className="w-3 h-3" /> Sending…
            </span>
          )}
          {isMe && msg.localStatus === "failed" && (
            <span className="inline-flex items-center gap-1.5 text-rose-400" role="alert">
              <AlertCircle className="w-3 h-3" /> Not sent
              <button type="button" onClick={onRetry} className="underline font-semibold hover:text-rose-300">
                Retry
              </button>
              <button type="button" onClick={onDiscard} className="underline hover:text-rose-300">
                Delete
              </button>
            </span>
          )}
          {isMe && isConfirmed && !msg.isDeleted && receipt && (
            <span role="img" aria-label={receipt.label} title={receipt.label}>
              {receipt.readByAll ? (
                <CheckCheck className="w-3.5 h-3.5 text-sky-400" />
              ) : (
                <Check className="w-3.5 h-3.5 text-indigo-400" />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="p-1.5 rounded-lg bg-slate-900/90 border border-white/10 text-gray-300 hover:text-white hover:bg-slate-800"
    >
      {children}
    </button>
  );
}
