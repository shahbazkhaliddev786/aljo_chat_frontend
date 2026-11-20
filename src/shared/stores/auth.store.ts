import { create } from "zustand";
import { IUser } from "@/domains/user/types";
import { useCryptoStore } from "@/shared/stores/crypto.store";

interface AuthState {
  user: IUser | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: IUser, token: string, refreshToken: string) => void;
  /** Store renewed tokens (refresh flow). */
  setTokens: (token: string, refreshToken: string) => void;
  updateUser: (user: Partial<IUser>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: typeof window !== "undefined" ? JSON.parse(localStorage.getItem("aljo_chat_user") || "null") : null,
  token: typeof window !== "undefined" ? localStorage.getItem("aljo_chat_token") : null,
  isAuthenticated: typeof window !== "undefined" ? !!localStorage.getItem("aljo_chat_token") : false,

  setAuth: (user, token, refreshToken) => {
    localStorage.setItem("aljo_chat_token", token);
    localStorage.setItem("aljo_chat_refresh_token", refreshToken);
    localStorage.setItem("aljo_chat_user", JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },

  setTokens: (token, refreshToken) => {
    localStorage.setItem("aljo_chat_token", token);
    localStorage.setItem("aljo_chat_refresh_token", refreshToken);
    set({ token });
  },

  updateUser: (updatedFields) => {
    set((state) => {
      if (!state.user) return state;
      const newUser = { ...state.user, ...updatedFields };
      localStorage.setItem("aljo_chat_user", JSON.stringify(newUser));
      return { user: newUser };
    });
  },

  logout: () => {
    localStorage.removeItem("aljo_chat_token");
    localStorage.removeItem("aljo_chat_refresh_token");
    localStorage.removeItem("aljo_chat_user");
    // Keys are restored from the password-wrapped server backup on next login.
    useCryptoStore.getState().reset();
    set({ user: null, token: null, isAuthenticated: false });
  },
}));
