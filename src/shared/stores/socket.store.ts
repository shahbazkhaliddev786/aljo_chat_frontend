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
    // Exactly one socket per session: an existing socket (connected, reconnecting,
    // or stopped after a rejected handshake) is reused, never replaced.
    const existing = get().socket;
    if (existing) {
      if (!existing.active) existing.connect();
      return;
    }

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
        .then((token) => {
          // Ignore if this socket was replaced or closed (e.g. logout) meanwhile.
          if (get().socket !== newSocket) return;
          if (token) then(token);
          else expireSession();
        })
        .catch(() => setTimeout(() => renew(then), 5_000)); // network error: try again shortly
    };

    newSocket.on("disconnect", (reason) => {
      set({ isConnected: false });
      // The server closed the session (token not renewed in time): renew and reconnect.
      if (reason === "io server disconnect") {
        renew(() => {
          if (!newSocket.active) newSocket.connect();
        });
      }
    });

    // Rejected at the handshake (expired token): the client does not retry on its own.
    newSocket.on("connect_error", (err) => {
      if (err.message.startsWith("Authentication failed")) {
        renew(() => {
          if (!newSocket.active) newSocket.connect();
        });
      }
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

/**
 * The connected socket, waiting up to `timeoutMs` for a reconnect that is in
 * progress (e.g. right after the server restarted). Throws "offline" otherwise.
 */
export async function getConnectedSocket(timeoutMs = 5_000): Promise<Socket> {
  const socket = useSocketStore.getState().socket;
  if (!socket) throw new Error("offline");
  if (socket.connected) return socket;

  // Reconnecting with backoff: the user is acting now, so try immediately instead
  // of waiting out socket.io's exponential backoff (can be seconds after an outage).
  // An inactive socket (handshake rejected while the token is being renewed) is
  // reconnected by the renewal itself, so just wait for it.
  if (socket.active) socket.disconnect().connect();

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("connect", onConnect);
      reject(new Error("offline"));
    }, timeoutMs);
    const onConnect = () => {
      clearTimeout(timer);
      resolve();
    };
    socket.once("connect", onConnect);
  });
  return socket;
}
