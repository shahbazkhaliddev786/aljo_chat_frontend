"use client";

import { useCallStore } from "@/shared/stores/call.store";
import { toggleMic, toggleCamera } from "../services/call.controller";
import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";

interface CallToolbarProps {
  onEndCall: () => void;
}

const toggleClass = (active: boolean) =>
  `p-3 rounded-xl transition ${
    active
      ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30"
      : "bg-slate-800 text-gray-200 hover:bg-slate-700"
  }`;

export default function CallToolbar({ onEndCall }: CallToolbarProps) {
  const isMicMuted = useCallStore((s) => s.isMicMuted);
  const isCameraOff = useCallStore((s) => s.isCameraOff);
  const isVideoCall = useCallStore((s) => s.activeCall?.callType === "video");

  return (
    <div className="flex items-center justify-center gap-4 p-3 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl">
      {/* Microphone Toggle */}
      <button
        onClick={toggleMic}
        aria-pressed={isMicMuted}
        aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
        className={toggleClass(isMicMuted)}
        title={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
      >
        {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </button>

      {/* Camera Toggle (video calls only) */}
      {isVideoCall && (
        <button
          onClick={toggleCamera}
          aria-pressed={isCameraOff}
          aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"}
          className={toggleClass(isCameraOff)}
          title={isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
        >
          {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>
      )}

      {/* End Call Button */}
      <button
        onClick={onEndCall}
        aria-label="End call"
        className="p-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition shadow-lg shadow-rose-600/30"
        title="End Call"
      >
        <PhoneOff className="w-5 h-5" />
      </button>
    </div>
  );
}
