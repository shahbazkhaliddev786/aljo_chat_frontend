"use client";

import { useCallStore } from "@/shared/stores/call.store";
import { useChatStore } from "@/shared/stores/chat.store";
import { acceptIncomingCall, rejectIncomingCall, hangUp } from "../services/call.controller";
import IncomingCallModal from "./IncomingCallModal";
import VideoGrid from "./VideoGrid";
import AudioCallOverlay from "./AudioCallOverlay";
import { useQueryClient } from "@tanstack/react-query";
import { IConversation } from "@/domains/chat/types";
import { useEffect } from "react";
import { playRingtone, stopRingtone } from "@/shared/lib/ringtone";
import { useSpeakingIndicator } from "../hooks/useSpeakingIndicator";

export default function GlobalCallOverlay() {
  const status = useCallStore((s) => s.status);
  const activeCall = useCallStore((s) => s.activeCall);
  const notice = useCallStore((s) => s.notice);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const queryClient = useQueryClient();

  // Ring while being called; ringback while calling someone.
  useEffect(() => {
    if (status === "incoming") playRingtone("incoming");
    else if (status === "calling") playRingtone("outgoing");
    else stopRingtone();
    return stopRingtone;
  }, [status]);

  useSpeakingIndicator(status === "connected");

  const noticeToast = notice ? (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-2xl bg-slate-900 border border-white/10 text-xs text-gray-100 shadow-xl"
    >
      {notice}
    </div>
  ) : null;

  if (status === "idle" || !activeCall) return noticeToast;

  const handleAccept = () => {
    const conversations = queryClient.getQueryData<IConversation[]>(["conversations"]) || [];
    const conversation = conversations.find((c) => c.id === activeCall.conversationId);
    if (conversation) setActiveConversation(conversation);
    void acceptIncomingCall(conversation);
  };

  const handleEndCall = () => hangUp();

  // Render Incoming Ringing Modal Over Everything
  if (status === "incoming") {
    return <IncomingCallModal onAccept={handleAccept} onReject={rejectIncomingCall} />;
  }

  // Render Connected or Calling Screen Full-Screen Over Everything
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
