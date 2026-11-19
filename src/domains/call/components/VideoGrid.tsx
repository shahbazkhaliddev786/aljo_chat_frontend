"use client";

import { useEffect, useRef } from "react";
import { useCallStore, RemoteParticipant } from "@/shared/stores/call.store";
import { useCallTimer } from "@/domains/call/hooks/useCallTimer";
import CallToolbar from "./CallToolbar";
import { MicOff, VideoOff } from "lucide-react";
import { useAuthStore } from "@/shared/stores/auth.store";

interface VideoGridProps {
  onEndCall: () => void;
}

function VideoTile({
  stream,
  name,
  isLocal = false,
  isSpeaking = false,
  isAudioMuted = false,
  isVideoMuted = false,
}: {
  stream?: MediaStream | null;
  name: string;
  isLocal?: boolean;
  isSpeaking?: boolean;
  isAudioMuted?: boolean;
  isVideoMuted?: boolean;
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
        className={`w-full h-full object-cover ${isLocal ? "scale-x-[-1]" : ""} ${isVideoMuted ? "invisible" : ""}`}
      />

      {/* Camera off: show an avatar instead of a frozen/black frame */}
      {isVideoMuted && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900">
          <div className="w-16 h-16 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-2xl font-bold text-indigo-300">
            {name.charAt(0).toUpperCase()}
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
            <VideoOff className="w-3.5 h-3.5" /> Camera off
          </span>
        </div>
      )}

      <div className="absolute bottom-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 z-10">
        <span>{name}</span>
        {isLocal && <span className="text-[10px] text-indigo-400">(You)</span>}
        {isSpeaking && <span className="sr-only" data-testid="speaking">speaking</span>}
        {isAudioMuted && (
          <span role="img" aria-label="Microphone muted" title="Microphone muted">
            <MicOff className="w-3.5 h-3.5 text-rose-400" />
          </span>
        )}
      </div>
    </div>
  );
}

export default function VideoGrid({ onEndCall }: VideoGridProps) {
  const { localStream, remoteStreams, activeCall, status } = useCallStore();
  const callStartTimeSet = useCallStore((s) => s.callStartTime !== null);
  const isMicMuted = useCallStore((s) => s.isMicMuted);
  const isCameraOff = useCallStore((s) => s.isCameraOff);
  const myName = useAuthStore((s) => s.user?.name) || "You";
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
          name={myName}
          isLocal={true}
          isAudioMuted={isMicMuted}
          isVideoMuted={isCameraOff}
        />

        {/* Remote Participants Streams */}
        {participants.map((p) => (
          <VideoTile
            key={p.socketId || p.userId}
            stream={p.stream}
            name={p.userName}
            isSpeaking={p.isSpeaking}
            isAudioMuted={p.isAudioMuted}
            isVideoMuted={p.isVideoMuted}
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
