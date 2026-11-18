"use client";

import { useCallStore } from "@/shared/stores/call.store";
import { useCallTimer } from "@/domains/call/hooks/useCallTimer";
import CallToolbar from "./CallToolbar";
import { MicOff, Volume2 } from "lucide-react";
import { useAuthStore } from "@/shared/stores/auth.store";

interface AudioCallOverlayProps {
  onEndCall: () => void;
}

export default function AudioCallOverlay({ onEndCall }: AudioCallOverlayProps) {
  const { remoteStreams, activeCall, isMicMuted, status } = useCallStore();
  const callStartTimeSet = useCallStore((s) => s.callStartTime !== null);
  const myInitial = (useAuthStore((s) => s.user?.name) || "You").charAt(0).toUpperCase();
  const { formattedDuration } = useCallTimer();

  const participants = Object.values(remoteStreams);

  const getStatusText = () => {
    if (status === "connected") return `Connected • ${formattedDuration}`;
    if (status === "calling") return "Calling...";
    if (status === "connecting") return callStartTimeSet ? "Reconnecting..." : "Connecting...";
    if (status === "incoming") return "Ringing...";
    return "";
  };

  return (
    <div className="flex-1 w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950/90 relative rounded-2xl">
      {/* Active Call Title & Live Timer Status */}
      <div className="text-center mb-10">
        <h2 className="text-xl font-bold text-white mb-2">
          {activeCall?.targetUserName || "Voice Call"}
        </h2>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold shadow-lg">
          <Volume2 className="w-4 h-4 animate-pulse" />
          <span>{getStatusText()}</span>
        </div>
      </div>

      {/* Participants Avatars Row */}
      <div className="flex flex-wrap items-center justify-center gap-8 mb-12 max-w-2xl">
        {/* Local User */}
        <div className="flex flex-col items-center gap-2">
          <div className={`relative w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white text-2xl shadow-xl ${isMicMuted ? "opacity-60" : "ring-4 ring-indigo-500/40"}`}>
            {myInitial}
            {isMicMuted && (
              <span
                role="img"
                aria-label="Your microphone is muted"
                className="absolute bottom-0 right-0 p-1.5 bg-rose-600 rounded-full text-white border-2 border-slate-950"
              >
                <MicOff className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
          <span className="text-xs font-semibold text-white">You</span>
        </div>

        {/* Remote Users */}
        {participants.map((p) => (
          <div key={p.socketId || p.userId} className="flex flex-col items-center gap-2">
            <div className={`relative w-20 h-20 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-bold text-indigo-300 text-2xl shadow-xl ${p.isSpeaking ? "ring-4 ring-emerald-500 animate-pulse" : ""}`}>
              {p.userName.charAt(0).toUpperCase()}
              {p.isAudioMuted && (
                <span
                  role="img"
                  aria-label={`${p.userName} is muted`}
                  className="absolute bottom-0 right-0 p-1.5 bg-rose-600 rounded-full text-white border-2 border-slate-950"
                >
                  <MicOff className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
            <span className="text-xs font-semibold text-white">{p.userName}</span>
          </div>
        ))}
      </div>

      {/* Hidden audio element for remote stream audio playback */}
      {participants.map((p) =>
        p.stream ? (
          <audio
            key={p.socketId || p.userId}
            autoPlay
            ref={(node) => {
              if (node && p.stream) {
                node.srcObject = p.stream;
                node.play().catch((err) => console.warn("Audio play error:", err));
              }
            }}
          />
        ) : null
      )}

      {/* Floating Toolbar Controls */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
        <CallToolbar onEndCall={onEndCall} />
      </div>
    </div>
  );
}
