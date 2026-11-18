"use client";

import { useEffect, useRef } from "react";
import { useCallStore, RemoteParticipant } from "@/shared/stores/call.store";
import { useCallTimer } from "@/domains/call/hooks/useCallTimer";
import CallToolbar from "./CallToolbar";

interface VideoGridProps {
  onEndCall: () => void;
}

function VideoTile({
  stream,
  name,
  isLocal = false,
  isSpeaking = false,
}: {
  stream?: MediaStream | null;
  name: string;
  isLocal?: boolean;
  isSpeaking?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => {
        console.warn("Video play failed:", err);
      });
    }
  }, [stream]);

  return (
    <div
      className={`relative w-full aspect-video min-h-[220px] max-h-[420px] rounded-2xl overflow-hidden bg-slate-900 border transition-all ${
        isSpeaking ? "border-emerald-500 shadow-lg shadow-emerald-500/20" : "border-white/10"
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover ${isLocal ? "scale-x-[-1]" : ""}`}
      />

      <div className="absolute bottom-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 z-10">
        <span>{name}</span>
        {isLocal && <span className="text-[10px] text-indigo-400">(You)</span>}
      </div>
    </div>
  );
}

export default function VideoGrid({ onEndCall }: VideoGridProps) {
  const { localStream, remoteStreams, activeCall, status } = useCallStore();
  const callStartTimeSet = useCallStore((s) => s.callStartTime !== null);
  const { formattedDuration } = useCallTimer();

  const participants: RemoteParticipant[] = Object.values(remoteStreams);
  const totalCount = 1 + participants.length;

  const getGridClass = () => {
    if (totalCount === 1) return "grid-cols-1";
    if (totalCount === 2) return "grid-cols-1 md:grid-cols-2";
    if (totalCount <= 4) return "grid-cols-1 md:grid-cols-2";
    return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
  };

  const getStatusText = () => {
    if (status === "connected") return `Connected • ${formattedDuration}`;
    if (status === "calling") return "Calling...";
    if (status === "connecting") return callStartTimeSet ? "Reconnecting..." : "Connecting...";
    if (status === "incoming") return "Ringing...";
    return "";
  };

  return (
    <div className="flex-1 w-full h-full flex flex-col p-4 bg-slate-950/90 relative rounded-2xl overflow-y-auto custom-scrollbar">
      {/* Header Info with Call Timer & Status Badge */}
      <div className="fixed top-6 left-6 z-30 flex items-center gap-2">
        <div className="px-4 py-2 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-white/10 text-xs font-semibold text-white shadow-xl">
          {activeCall?.targetUserName || "Call Room"} ({totalCount})
        </div>

        <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 backdrop-blur-md shadow-xl ${
          status === "connected"
            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
            : "bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse"
        }`}>
          <span className={`w-2 h-2 rounded-full ${status === "connected" ? "bg-emerald-400" : "bg-amber-400"}`} />
          {getStatusText()}
        </div>
      </div>

      {/* Video Grid Container */}
      <div className={`flex-1 grid ${getGridClass()} gap-4 items-center justify-center pt-16 pb-24 max-w-7xl mx-auto w-full`}>
        {/* Local User Stream */}
        <VideoTile
          stream={localStream}
          name="You"
          isLocal={true}
        />

        {/* Remote Participants Streams */}
        {participants.map((p) => (
          <VideoTile
            key={p.socketId || p.userId}
            stream={p.stream}
            name={p.userName}
            isSpeaking={p.isSpeaking}
          />
        ))}
      </div>

      {/* Floating Toolbar Controls */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-30">
        <CallToolbar onEndCall={onEndCall} />
      </div>
    </div>
  );
}
