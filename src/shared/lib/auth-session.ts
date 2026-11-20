import axios from "axios";
import { API_BASE_URL } from "@/shared/lib/config";
import { useAuthStore } from "@/shared/stores/auth.store";

/**
 * Access tokens are short-lived; the refresh token renews them. Renewal is
 * single-flight (concurrent 401s share one refresh) and tolerant of another
 * tab having rotated the refresh token at the same time.
 */

export const ACCESS_TOKEN_KEY = "aljo_chat_token";
export const REFRESH_TOKEN_KEY = "aljo_chat_refresh_token";

export const getAccessToken = () => (typeof window === "undefined" ? null : localStorage.getItem(ACCESS_TOKEN_KEY));
export const getRefreshToken = () => (typeof window === "undefined" ? null : localStorage.getItem(REFRESH_TOKEN_KEY));

let inflight: Promise<string | null> | null = null;

/** Get a fresh access token. Resolves null if the session is over; rejects on network errors. */
export function refreshSession(): Promise<string | null> {
  if (inflight) return inflight;

  inflight = (async () => {
    const used = getRefreshToken();
    if (!used) return null;

    try {
      // Plain axios (not the api client) so this call is never intercepted itself.
      const res = await axios.post(`${API_BASE_URL}/auth/refresh-token`, { refreshToken: used });
      const { accessToken, refreshToken } = res.data.data as { accessToken: string; refreshToken: string };
      useAuthStore.getState().setTokens(accessToken, refreshToken);
      return accessToken;
    } catch (err) {
      // Another tab may have used the same refresh token a moment earlier.
      const current = getRefreshToken();
      if (current && current !== used) return getAccessToken();

      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 400 || status === 401) return null;
      throw err;
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** The session cannot be renewed: sign out and go to the login page. */
export function expireSession() {
  useAuthStore.getState().logout();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.assign("/login");
  }
}
