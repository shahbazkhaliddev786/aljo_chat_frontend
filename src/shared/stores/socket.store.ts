import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import { SOCKET_URL } from "@/shared/lib/config";
import { getAccessToken, refreshSession, expireSession } from "@/shared/lib/auth-session";

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  onlineUsers: Record<string, "online" | "offline">;
  connectSocket: () => void;
  disconnectSocket: () => void;
  setOnlineUser: (userId: string, status: "online" | "offline") => void;
}


export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  onlineUsers: {},

  connectSocket: () => {
    // A socket that is connected or still reconnecting is reused; never run two at once.
    const existing = get().socket;
    if (existing?.active) return;
    existing?.disconnect();

    const newSocket = io(SOCKET_URL, {
      // Read the latest token on every (re)connect, so renewed tokens are used.
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ["websocket", "polling"],
      // Keep retrying (with backoff) instead of giving up after a few attempts.
      reconnectionDelayMax: 10_000,
    });

    newSocket.on("connect", () => {
      set({ isConnected: true });
    });

    /** Renew the access token, then run `then` with it (or end the session). */
    const renew = (then: (token: string) => void) => {
      refreshSession()
        .then((token) => (token ? then(token) : expireSession()))
        .catch(() => setTimeout(() => renew(then), 5_000)); // network error: try again shortly
    };

    newSocket.on("disconnect", (reason) => {
      set({ isConnected: false });
      // The server closed the session (token not renewed in time): renew and reconnect.
      if (reason === "io server disconnect") renew(() => newSocket.connect());
    });

    // Rejected at the handshake (expired token): the client does not retry on its own.
    newSocket.on("connect_error", (err) => {
      if (err.message.startsWith("Authentication failed")) renew(() => newSocket.connect());
    });

    // The access token expired during a long session: renew it in-band so calls keep going.
    newSocket.on("auth:expired", () => {
      renew((token) => newSocket.emit("auth:renew", { token }));
    });

    newSocket.on("user_online", ({ userId }: { userId: string }) => {
      get().setOnlineUser(userId, "online");
    });

    newSocket.on("user_offline", ({ userId }: { userId: string }) => {
      get().setOnlineUser(userId, "offline");
    });

    set({ socket: newSocket });
  },

  disconnectSocket: () => {
    const socket = get().socket;
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },

  setOnlineUser: (userId, status) => {
    set((state) => ({
      onlineUsers: {
        ...state.onlineUsers,
        [userId]: status,
      },
    }));
  },
}));
