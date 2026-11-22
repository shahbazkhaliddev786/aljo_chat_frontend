import {
  encryptE2EEMessage,
  decryptE2EEMessage,
  encryptGroupMessage,
  decryptGroupMessage,
} from "@/shared/lib/crypto";
import { IConversation, IMessage } from "@/domains/chat/types";

/**
 * How messages in a conversation are protected.
 * - direct: pairwise ECDH between the two people
 * - group:  a fresh key per message, wrapped for every member
 * - none:   someone has not set up encryption yet (shown as "Not encrypted")
 */
export type EncryptionMode =
  | { kind: "direct"; partnerId: string; partnerKey: string }
  | { kind: "group"; members: Array<{ id: string; publicKey: string }> }
  | { kind: "none"; reason: string };

export function getEncryptionMode(conversation: IConversation, myUserId?: string): EncryptionMode {
  if (conversation.type === "direct") {
    const partner = conversation.members.find((m) => m.id !== myUserId);
    return partner?.publicKey
      ? { kind: "direct", partnerId: partner.id, partnerKey: partner.publicKey }
      : { kind: "none", reason: "This contact has not set up encryption yet." };
  }
  const missing = conversation.members.filter((m) => !m.publicKey);
  if (missing.length > 0) {
    return {
      kind: "none",
      reason: `${missing.map((m) => m.name).join(", ")} ${missing.length === 1 ? "has" : "have"} not set up encryption yet.`,
    };
  }
  return { kind: "group", members: conversation.members.map((m) => ({ id: m.id, publicKey: m.publicKey! })) };
}

export interface EncryptedFields {
  isEncrypted: true;
  ciphertext: string;
  iv: string;
  senderPublicKey: string;
  recipientPublicKey?: string;
  keyEnvelopes?: string;
}

/** Encrypt text for the conversation. Never returns plaintext fields. */
export async function encryptForConversation(
  mode: Exclude<EncryptionMode, { kind: "none" }>,
  plainText: string,
  privateKey: CryptoKey,
  myPublicKey: string
): Promise<EncryptedFields> {
  if (mode.kind === "direct") {
    const { ciphertext, iv } = await encryptE2EEMessage(plainText, mode.partnerKey, privateKey);
    return { isEncrypted: true, ciphertext, iv, senderPublicKey: myPublicKey, recipientPublicKey: mode.partnerKey };
  }
  const { ciphertext, iv, keyEnvelopes } = await encryptGroupMessage(plainText, mode.members, privateKey);
  return { isEncrypted: true, ciphertext, iv, senderPublicKey: myPublicKey, keyEnvelopes };
}

/** Decrypt a stored message, using the exact keys recorded with it. */
export async function decryptMessage(
  msg: IMessage,
  conversation: IConversation,
  myUserId: string,
  privateKey: CryptoKey
): Promise<string> {
  if (!msg.ciphertext || !msg.iv) throw new Error("Missing ciphertext");

  if (msg.keyEnvelopes) {
    const senderKey = msg.senderPublicKey || msg.sender?.publicKey;
    if (!senderKey) throw new Error("Unknown sender key");
    return decryptGroupMessage(msg.ciphertext, msg.iv, msg.keyEnvelopes, myUserId, privateKey, senderKey);
  }

  // Direct: ECDH with *our* private key and the *other* side's public key.
  const partner = conversation.members.find((m) => m.id !== myUserId);
  const counterpartKey =
    msg.senderId === myUserId
      ? msg.recipientPublicKey || partner?.publicKey
      : msg.senderPublicKey || msg.sender?.publicKey;
  if (!counterpartKey) throw new Error("Unknown counterpart key");
  return decryptE2EEMessage(msg.ciphertext, msg.iv, counterpartKey, privateKey);
}

// ---------------------------------------------------------------------------
// Encrypted attachments: the message text carries the file key and metadata.
// ---------------------------------------------------------------------------

export interface AttachmentMeta {
  key: string;
  iv: string;
  name: string;
  mime: string;
  size: number;
}

interface AttachmentPayload {
  v: 1;
  caption?: string;
  file: AttachmentMeta;
}

export const buildAttachmentText = (file: AttachmentMeta, caption?: string) =>
  JSON.stringify({ v: 1, caption: caption || undefined, file } satisfies AttachmentPayload);

/** For decrypted image/file messages: split the payload into caption + file metadata. */
export function parseAttachmentText(text: string): { caption?: string; file?: AttachmentMeta } {
  try {
    const parsed = JSON.parse(text) as Partial<AttachmentPayload>;
    if (parsed?.v === 1 && parsed.file?.key && parsed.file.iv) return { caption: parsed.caption, file: parsed.file };
  } catch {
    /* not an attachment payload */
  }
  return { caption: text };
}

/** Key for caching decrypted text: changes when an edit re-encrypts the message. */
export const decryptionCacheKey = (msg: IMessage) => `${msg.id}:${msg.iv ?? ""}`;
