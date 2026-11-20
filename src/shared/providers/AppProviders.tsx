"use client";

import QueryProvider from "@/shared/query/QueryProvider";
import SocketProvider from "@/shared/socket/SocketProvider";
import CallProvider from "@/domains/call/components/CallProvider";

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <SocketProvider>
        <CallProvider>{children}</CallProvider>
      </SocketProvider>
    </QueryProvider>
  );
}
