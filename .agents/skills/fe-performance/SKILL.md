---
name: fe-performance
description: Audits component footprints, enforces dynamic imports (lazy), image optimization, and minimizes re-renders. Use when handling latency, fast load, bundle size, lazy load, code splitting, images.
---

# Frontend Performance & Bundle Optimization (`fe-performance`)

This skill defines optimization guidelines for minimizing bundle sizes, eliminating unnecessary React re-renders, and implementing code splitting in Next.js.

## Performance Rules

### 1. Dynamic Imports & Code-Splitting
- Use Next.js `dynamic()` or `React.lazy()` to lazy-load heavy client components (such as WebRTC video call overlays, rich text editors, or heavy modal dialogs):
  ```tsx
  import dynamic from 'next/dynamic';

  const GlobalCallOverlay = dynamic(
    () => import('@/domains/call').then((mod) => mod.GlobalCallOverlay),
    { ssr: false }
  );
  ```

### 2. Preventing Unnecessary React Re-renders
- Use selector-based Zustand subscriptions (`useCallStore(s => s.activeCall)`) instead of reading whole store objects.
- Memoize heavy callbacks passed down to list children using `useCallback()`.
- Use React `memo` on list item components rendered inside long chat message lists.

### 3. Next.js Image Optimization
- Always use `next/image` (`<Image src=... width=... height=... alt=... />`) with explicit width/height or `fill` to prevent layout shifts and leverage automatic WebP conversion.
