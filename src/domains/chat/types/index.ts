export interface IConversationMember {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  publicKey?: string | null;
  role: "admin" | "member";
  status: "online" | "offline" | "away";
  lastSeen?: string | null;
  /** The newest message this member has read (read receipts). */
  lastReadMessageId?: string | null;
}

export interface IMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content?: string | null;
  type: "text" | "image" | "file" | "audio" | "system";
  mediaUrl?: string | null;
  replyToId?: string | null;
  isEncrypted: boolean;
  ciphertext?: string | null;
  iv?: string | null;
  /** Public keys used to derive this message's key (E2EE). */
  senderPublicKey?: string | null;
  recipientPublicKey?: string | null;
  /** Client-generated id; lets an optimistic message be matched with the stored one. */
  clientMessageId?: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  sender: {
    id: string;
    name: string;
    avatarUrl?: string | null;
    publicKey?: string | null;
  };
  reactions?: Array<{
    id: string;
    emoji: string;
    userId: string;
  }>;
  /** Client-only: set on optimistic messages that are not confirmed by the server yet. */
  localStatus?: "sending" | "failed";
  /** Client-only: what the sender typed (shown before the server confirms the message). */
  localPlaintext?: string;
  /** Client-only: name of a file that is being uploaded. */
  localFileName?: string;
}

export interface IConversation {
  id: string;
  type: "direct" | "group";
  title?: string | null;
  avatarUrl?: string | null;
  createdBy?: string | null;
  lastMessageAt: string;
  createdAt: string;
  members: IConversationMember[];
  latestMessage?: {
    id: string;
    content?: string | null;
    type: string;
    isEncrypted?: boolean;
    senderId: string;
    createdAt: string;
  } | null;
  unreadCount?: number;
}
