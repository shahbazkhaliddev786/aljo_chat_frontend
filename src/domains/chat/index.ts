// Chat Domain — Public API
export type { IConversation, IConversationMember, IMessage } from "./types";
export { conversationService } from "./services/conversation.service";
export { messageService } from "./services/message.service";
export { useConversations } from "./hooks/useConversations";
export { useMessages } from "./hooks/useMessages";
export {
  useCreateDirectConversationMutation,
  useCreateGroupConversationMutation,
  useLeaveGroupMutation,
  useDeleteGroupMutation,
  useDeleteDirectMutation,
  useAddGroupMembersMutation,
  useRemoveGroupMemberMutation,
} from "./hooks/useConversationMutations";
export { useSendMessage } from "./hooks/useSendMessage";
export { getConversationTitle, getConversationAvatar, isPartnerOnline } from "./utils/chat.utils";
export { default as ChatPage } from "./pages/ChatPage";
export { default as ChatSidebar } from "./components/ChatSidebar";
export { default as ChatWindow } from "./components/ChatWindow";
export { default as CreateGroupModal } from "./components/CreateGroupModal";
export { default as ManageMembersModal } from "./components/ManageMembersModal";
