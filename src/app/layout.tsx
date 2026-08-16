import type { Metadata } from "next";
import AppProviders from "@/shared/providers/AppProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "aljo-chat | Secure End-to-End Encrypted Real-Time Messaging",
  description: "Modern E2EE real-time chat application with group messaging, Socket.io, and Web Crypto API.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-gray-100 antialiased selection:bg-indigo-500 selection:text-white">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
