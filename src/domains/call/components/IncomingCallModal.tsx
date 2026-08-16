"use client";

import { useCallStore } from "@/shared/stores/call.store";
import { Phone, PhoneOff, Video } from "lucide-react";

interface IncomingCallModalProps {
  onAccept: () => void;
  onReject: () => void;
}

export default function IncomingCallModal({ onAccept, onReject }: IncomingCallModalProps) {
  const { activeCall, status } = useCallStore();

  if (status !== "incoming" || !activeCall) return null;

  const isVideo = activeCall.callType === "video";
  const isGroup = activeCall.mode === "group";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in zoom-in duration-200">
      <div className="w-full max-w-sm glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl text-center relative">
        <div className="relative inline-block mb-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-2xl shadow-xl mx-auto animate-pulse">
            {activeCall.targetUserAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeCall.targetUserAvatar}
                alt={activeCall.targetUserName || "Caller"}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              activeCall.targetUserName?.charAt(0).toUpperCase() || "C"
            )}
          </div>
          <span className="absolute bottom-0 right-0 p-2 bg-indigo-600 rounded-full text-white border-2 border-slate-950 shadow-md">
            {isVideo ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
          </span>
        </div>

        <h3 className="text-lg font-bold text-white mb-1">
          {activeCall.targetUserName || "Incoming Call"}
        </h3>
        <p className="text-xs text-indigo-400 font-medium mb-6">
          {isGroup
            ? `${activeCall.targetUserName} started a ${isVideo ? "video" : "audio"} call`
            : `Incoming ${isVideo ? "Video" : "Audio"} Call...`}
        </p>

        <div className="flex items-center justify-center gap-6">
          {/* Decline Button */}
          <button
            onClick={onReject}
            className="flex flex-col items-center gap-1 group"
          >
            <div className="w-14 h-14 rounded-full bg-rose-600/20 border border-rose-500/40 text-rose-400 group-hover:bg-rose-600 group-hover:text-white flex items-center justify-center transition shadow-lg">
              <PhoneOff className="w-6 h-6" />
            </div>
            <span className="text-[10px] text-gray-400 font-medium">{isGroup ? "Dismiss" : "Decline"}</span>
          </button>

          {/* Accept Button */}
          <button
            onClick={onAccept}
            className="flex flex-col items-center gap-1 group"
          >
            <div className="w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center group-hover:bg-emerald-500 transition shadow-lg shadow-emerald-600/30 animate-bounce">
              <Phone className="w-6 h-6" />
            </div>
            <span className="text-[10px] text-emerald-400 font-medium">{isGroup ? "Join" : "Accept"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
