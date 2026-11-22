export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
    bio?: string | null;
    publicKey?: string | null;
    status: "online" | "offline" | "away";
    lastSeen?: string | null;
    createdAt?: string;
  };
  accessToken: string;
  refreshToken: string;
}
