"use client";

import { useState } from "react";
import { MailWarning, X } from "lucide-react";
import { api } from "@/shared/lib/api-client";
import { useAuthStore } from "@/shared/stores/auth.store";

/** Shown until the user confirms their email address. Never blocks using the app. */
export default function VerifyEmailBanner() {
  const user = useAuthStore((s) => s.user);
  const [dismissed, setDismissed] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  if (!user || user.isVerified !== false || dismissed) return null;

  const resend = async () => {
    setState("sending");
    try {
      await api.post("/auth/resend-verification");
      setState("sent");
    } catch (err) {
      setError(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message || "Could not send the email."
      );
      setState("error");
    }
  };

  return (
    <div
      role="status"
      className="shrink-0 flex items-center gap-3 px-4 py-2 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-100"
    >
      <MailWarning className="w-4 h-4 shrink-0 text-amber-300" />
      <span className="flex-1">
        Please confirm your email ({user.email}).{" "}
        {state === "sent" ? (
          "We sent you a new link."
        ) : state === "error" ? (
          error
        ) : (
          <button onClick={resend} disabled={state === "sending"} className="underline font-semibold">
            {state === "sending" ? "Sending…" : "Resend email"}
          </button>
        )}
      </span>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="p-0.5 text-amber-300 hover:text-white">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
