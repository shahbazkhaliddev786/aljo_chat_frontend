"use client";

import QueryProvider from "@/shared/query/QueryProvider";
import SocketProvider from "@/shared/socket/SocketProvider";

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <SocketProvider>{children}</SocketProvider>
    </QueryProvider>
  );
}
