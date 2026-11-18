import { create } from "zustand";
import { io, Socket } from "socket.io-client";

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  onlineUsers: Record<string, "online" | "offline">;
  connectSocket: (token: string) => void;
  disconnectSocket: () => void;
  setOnlineUser: (userId: string, status: "online" | "offline") => void;
}

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  onlineUsers: {},

  connectSocket: (token) => {
    // A socket that is connected or still reconnecting is reused; never run two at once.
    const existing = get().socket;
    if (existing?.active) return;
    existing?.disconnect();

    const newSocket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      // Keep retrying (with backoff) instead of giving up after a few attempts.
      reconnectionDelayMax: 10_000,
    });

    newSocket.on("connect", () => {
      set({ isConnected: true });
    });

    newSocket.on("disconnect", () => {
      set({ isConnected: false });
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
