import { api } from "@/shared/lib/api-client";
import { IUser } from "@/domains/user/types";

export const userService = {
  searchUsers: async (query: string): Promise<IUser[]> => {
    if (!query.trim()) return [];
    const res = await api.get(`/users/search?q=${encodeURIComponent(query.trim())}`);
    return res.data.data.users;
  },
};
