import { api } from "@/shared/lib/api-client";
import { LoginRequest, RegisterRequest, AuthResponse } from "@/domains/auth/types";

export const authService = {
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const res = await api.post("/auth/login", data);
    return res.data.data;
  },

  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const res = await api.post("/auth/register", data);
    return res.data.data;
  },

  publishPublicKey: async (publicKey: string): Promise<void> => {
    await api.patch("/users/public-key", { publicKey });
  },
};
