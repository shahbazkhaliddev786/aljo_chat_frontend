import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "@/shared/lib/config";
import { getAccessToken, refreshSession, expireSession } from "@/shared/lib/auth-session";

export { API_BASE_URL };

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Requests whose 401 means "wrong credentials", not "expired session".
const AUTH_ENDPOINTS = ["/auth/login", "/auth/register", "/auth/refresh-token"];

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => original?.url?.startsWith(path));

    if (error.response?.status === 401 && original && !original._retried && !isAuthEndpoint) {
      original._retried = true;
      let token: string | null;
      try {
        token = await refreshSession();
      } catch {
        return Promise.reject(error); // network problem: keep the session, surface the error
      }
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      expireSession();
    }
    return Promise.reject(error);
  }
);
