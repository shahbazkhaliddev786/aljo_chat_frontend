"use client";

import { useQuery } from "@tanstack/react-query";
import { IUser } from "@/domains/user/types";
import { userService } from "@/domains/user/services/user.service";

export function useUserSearch(query: string) {
  return useQuery<IUser[]>({
    queryKey: ["users", "search", query],
    queryFn: () => userService.searchUsers(query),
    enabled: query.trim().length > 0,
  });
}
