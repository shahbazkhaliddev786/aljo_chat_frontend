export interface IUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  bio?: string | null;
  publicKey?: string | null;
  status?: "online" | "offline" | "away";
  lastSeen?: string | null;
  isVerified?: boolean;
  createdAt?: string;
}
