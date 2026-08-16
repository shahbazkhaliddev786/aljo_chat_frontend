"use client";

import { useCallStore } from "@/shared/stores/call.store";
import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";

interface CallToolbarProps {
  onEndCall: () => void;
}

export default function CallToolbar({ onEndCall }: CallToolbarProps) {
  const { isMicMuted, isCameraOff, toggleMic, toggleCamera } = useCallStore();

  return (
    <div className="flex items-center justify-center gap-4 p-3 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl">
      {/* Microphone Toggle */}
      <button
        onClick={toggleMic}
        className={`p-3 rounded-xl transition ${
          isMicMuted
            ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30"
            : "bg-slate-800 text-gray-200 hover:bg-slate-700"
        }`}
        title={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
      >
        {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </button>

      {/* Camera Toggle */}
      <button
        onClick={toggleCamera}
        className={`p-3 rounded-xl transition ${
          isCameraOff
            ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30"
            : "bg-slate-800 text-gray-200 hover:bg-slate-700"
        }`}
        title={isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
      >
        {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
      </button>

      {/* End Call Button */}
      <button
        onClick={onEndCall}
        className="p-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition shadow-lg shadow-rose-600/30"
        title="End Call"
      >
        <PhoneOff className="w-5 h-5" />
      </button>
    </div>
  );
}
