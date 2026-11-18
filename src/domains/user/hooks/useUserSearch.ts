"use client";

import { useQuery } from "@tanstack/react-query";
import { IUser } from "@/domains/user/types";
import { userService } from "@/domains/user/services/user.service";

export function useUserSearch(query: string) {
  return useQuery<IUser[]>({
    queryKey: ["users", "search", query],
    queryFn: () => userService.searchUsers(query),
    // The server ignores queries shorter than 2 characters.
    enabled: query.trim().length >= 2,
  });
}
