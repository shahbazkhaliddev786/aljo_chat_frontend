import { api } from "@/shared/lib/api-client";
import { useAuthStore } from "@/shared/stores/auth.store";

/**
 * ICE servers (STUN + TURN) come from the backend so TURN credentials can be
 * short-lived and never ship in the frontend bundle. Cached for half their TTL.
 */

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

// TURN credentials are minted per user, so the cache is per user too.
let cached: { servers: RTCIceServer[]; expiresAt: number; userId?: string } | null = null;

export async function getIceServers(): Promise<RTCIceServer[]> {
  const userId = useAuthStore.getState().user?.id;
  if (cached && cached.expiresAt > Date.now() && cached.userId === userId) return cached.servers;

  try {
    const res = await api.get("/calls/ice-servers");
    const { iceServers, ttlSeconds } = res.data.data as { iceServers: RTCIceServer[]; ttlSeconds: number };
    const servers = iceServers.length > 0 ? iceServers : FALLBACK_ICE_SERVERS;
    cached = { servers, expiresAt: Date.now() + (ttlSeconds * 1000) / 2, userId };
    return servers;
  } catch (err) {
    console.warn("Could not load ICE servers, falling back to public STUN only", err);
    return FALLBACK_ICE_SERVERS;
  }
}
