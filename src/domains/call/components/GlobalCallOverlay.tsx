"use client";

import { useCallStore } from "@/shared/stores/call.store";
import { useChatStore } from "@/shared/stores/chat.store";
import { useDirectCall } from "../hooks/useDirectCall";
import { useGroupCall } from "../hooks/useGroupCall";
import IncomingCallModal from "./IncomingCallModal";
import VideoGrid from "./VideoGrid";
import AudioCallOverlay from "./AudioCallOverlay";
import { useQueryClient } from "@tanstack/react-query";
import { IConversation } from "@/domains/chat/types";

export default function GlobalCallOverlay() {
  const { status, activeCall, endCall } = useCallStore();
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const queryClient = useQueryClient();

  const { acceptCall, rejectCall, terminateCall: terminateDirectCall } = useDirectCall();
  const { joinGroupCall, leaveGroupCall } = useGroupCall();

  if (status === "idle" || !activeCall) return null;

  const handleAccept = () => {
    const conversations = queryClient.getQueryData<IConversation[]>(["conversations"]) || [];
    const conversation = conversations.find((c) => c.id === activeCall.conversationId);
    if (conversation) {
      setActiveConversation(conversation);
    }

    if (activeCall.mode === "group") {
      if (conversation) {
        joinGroupCall(conversation, activeCall.callType);
      }
    } else {
      if (activeCall.callerSocketId) {
        acceptCall(activeCall.callerSocketId, activeCall.conversationId, activeCall.callType);
      }
    }
  };

  const handleReject = () => {
    if (activeCall.mode === "group") {
      endCall();
    } else {
      if (activeCall.callerSocketId) {
        rejectCall(activeCall.callerSocketId);
      } else {
        endCall();
      }
    }
  };

  const handleEndCall = () => {
    if (activeCall.mode === "group") {
      leaveGroupCall(activeCall.conversationId);
    } else {
      terminateDirectCall();
    }
  };

  // Render Incoming Ringing Modal Over Everything
  if (status === "incoming") {
    return <IncomingCallModal onAccept={handleAccept} onReject={handleReject} />;
  }

  // Render Connected or Calling Screen Full-Screen Over Everything
  if (status === "connected" || status === "calling") {
    return (
      <div className="fixed inset-0 z-50 flex bg-slate-950 p-4">
        {activeCall.callType === "video" ? (
          <VideoGrid onEndCall={handleEndCall} />
        ) : (
          <AudioCallOverlay onEndCall={handleEndCall} />
        )}
      </div>
    );
  }

  return null;
}
