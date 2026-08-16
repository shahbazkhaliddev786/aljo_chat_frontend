"use client";

import { useEffect } from "react";
import { useCallStore } from "@/shared/stores/call.store";

export function useCallTimer() {
  const { status, durationSeconds, tickTimer } = useCallStore();

  useEffect(() => {
    if (status !== "connected") return;

    const timer = setInterval(() => {
      tickTimer();
    }, 1000);

    return () => clearInterval(timer);
  }, [status, tickTimer]);

  const formatDuration = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num: number) => num.toString().padStart(2, "0");

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  return {
    durationSeconds,
    formattedDuration: formatDuration(durationSeconds),
  };
}
