"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/shared/lib/config";
import { useAuthStore } from "@/shared/stores/auth.store";

type State = { status: "verifying" } | { status: "verified" } | { status: "error"; message: string };

/** Opened from the link in the verification email (works signed in or out). */
export default function VerifyEmailPage() {
  const [state, setState] = useState<State>({ status: "verifying" });
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // the token is single-use: never submit it twice
    started.current = true;
    const token = new URLSearchParams(window.location.search).get("token");

    (async () => {
      try {
        if (!token) throw new Error("This link is missing its token.");
        await axios.post(`${API_BASE_URL}/auth/verify-email`, { token });
        useAuthStore.getState().updateUser({ isVerified: true });
        setState({ status: "verified" });
      } catch (err) {
        const message =
          (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
          (err as Error).message ||
          "Verification failed.";
        setState({ status: "error", message });
      }
    })();
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-sm glass-panel p-8 rounded-3xl border border-white/10 text-center" aria-live="polite">
        {state.status === "verifying" && (
          <p className="text-sm text-gray-300 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Confirming your email…
          </p>
        )}
        {state.status === "verified" && (
          <>
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <h1 className="text-lg font-bold text-white mb-1">Email confirmed</h1>
            <p className="text-xs text-gray-400 mb-6">Thanks — your email address is verified.</p>
          </>
        )}
        {state.status === "error" && (
          <>
            <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
            <h1 className="text-lg font-bold text-white mb-1">Could not confirm your email</h1>
            <p className="text-xs text-gray-400 mb-6">{state.message}</p>
          </>
        )}
        {state.status !== "verifying" && (
          <Link
            href={isAuthenticated ? "/chat" : "/login"}
            className="inline-block px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
          >
            {isAuthenticated ? "Go to your chats" : "Sign in"}
          </Link>
        )}
      </div>
    </main>
  );
}
