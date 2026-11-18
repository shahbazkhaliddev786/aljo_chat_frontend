"use client";

import { useEffect } from "react";
import { useSocketStore } from "@/shared/stores/socket.store";
import { attachCallHandlers, hangUp } from "@/domains/call/services/call.controller";
import { useCallStore } from "@/shared/stores/call.store";

/**
 * Attaches the call controller's socket listeners exactly once per socket.
 * Mount this a single time near the root of the app.
 */
export default function CallProvider({ children }: { children: React.ReactNode }) {
  const socket = useSocketStore((s) => s.socket);

  useEffect(() => {
    if (!socket) return;
    return attachCallHandlers(socket);
  }, [socket]);

  // Hang up cleanly when the tab is closed so the other side is told right away.
  useEffect(() => {
    const onUnload = () => {
      if (useCallStore.getState().status !== "idle") hangUp();
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, []);

  return <>{children}</>;
}
