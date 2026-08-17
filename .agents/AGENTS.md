# Aljo Chat Frontend - Agent Guidelines & Development Rules

This repository contains the frontend client for **Aljo Chat**, built with Next.js 16 (App Router), React 19, Tailwind CSS 4, Zustand state management, Socket.io client, and Mediasoup WebRTC client.

---

## Technical Stack Overview

- **Framework**: Next.js 16 (App Router) on React 19 & TypeScript
- **Styling**: Tailwind CSS 4 (`@tailwindcss/postcss`) with CSS variable tokens
- **State Management**: Zustand (slice pattern) + TanStack React Query v5
- **Real-Time Client**: `socket.io-client` & `mediasoup-client` (SFU WebRTC)
- **Icons**: `lucide-react`

---

## Directory & Domain Architecture

```text
src/
├── app/                  # Next.js App Router (pages, layouts, globals.css)
├── domains/              # Feature domain modules
│   ├── auth/             # Authentication components, hooks, services
│   ├── call/             # WebRTC group calls (VideoGrid, Controls, Hooks)
│   └── chat/             # Messaging (ChatSidebar, ChatWindow, Modals)
└── shared/               # Shared components, stores, utilities, services
    ├── stores/           # Zustand state stores (auth.store.ts, call.store.ts, etc.)
    ├── services/         # Socket & API client instances
    └── components/       # Shared UI primitives
```

---

## Development Standards & Rules

1. **Client Component Declarations**:
   - Always place `"use client";` directives at the very top of components using React hooks (`useState`, `useEffect`, `useCallback`) or browser APIs.

2. **Domain Isolation**:
   - Keep domain-specific components inside `src/domains/<domain>/components/`.
   - Place reusable UI components and global Zustand stores under `src/shared/`.

3. **Zustand Store Subscriptions**:
   - Always use selector functions when subscribing to Zustand store state to prevent unnecessary component re-renders:
     ```ts
     // ✅ GOOD
     const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
     ```

4. **WebRTC & Mediasoup Safety**:
   - Always clean up WebRTC media tracks and Mediasoup transports in `useEffect` cleanup return functions or unmount hooks.

---

## Development & Verification Commands

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Start Next.js local development server |
| `npm run build` | Build production Next.js output |
| `npm run lint` | Run ESLint check |
