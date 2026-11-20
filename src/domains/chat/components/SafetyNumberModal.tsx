"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { computeSafetyNumber } from "@/shared/lib/crypto";

interface Props {
  partnerName: string;
  myPublicKey: string;
  partnerPublicKey: string;
  isVerified: boolean;
  onVerify: () => void;
  onClose: () => void;
}

/**
 * Both people see the same safety number only if each has the other's real
 * key. Comparing it in person or on another channel rules out a server that
 * swaps keys to read messages.
 */
export default function SafetyNumberModal({
  partnerName,
  myPublicKey,
  partnerPublicKey,
  isVerified,
  onVerify,
  onClose,
}: Props) {
  const [safetyNumber, setSafetyNumber] = useState<string | null>(null);

  useEffect(() => {
    computeSafetyNumber(myPublicKey, partnerPublicKey).then(setSafetyNumber).catch(console.error);
  }, [myPublicKey, partnerPublicKey]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="safety-number-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-sm glass-panel p-6 rounded-2xl border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 id="safety-number-title" className="text-base font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" /> Verify encryption
          </h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-300 mb-4">
          Compare these numbers with {partnerName} in person or on a call. If they match, your messages can only be
          read by the two of you.
        </p>
        <div className="grid grid-cols-4 gap-2 font-mono text-sm text-white bg-slate-900/80 rounded-xl p-4 mb-4 text-center">
          {(safetyNumber ?? "····· ····· ····· ····· ····· ····· ····· ····· ····· ····· ····· ·····")
            .split(" ")
            .map((group, i) => (
              <span key={i}>{group}</span>
            ))}
        </div>
        {isVerified ? (
          <p className="text-xs text-emerald-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> You have verified {partnerName}.
          </p>
        ) : (
          <button
            onClick={onVerify}
            disabled={!safetyNumber}
            className="w-full px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
          >
            The numbers match — mark as verified
          </button>
        )}
      </div>
    </div>
  );
}
