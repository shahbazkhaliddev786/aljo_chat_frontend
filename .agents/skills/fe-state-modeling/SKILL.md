---
name: fe-state-modeling
description: Designs resilient finite-state logic handling Loading/Success/Error/Empty states natively. Use when handling state management, context, reducer, async state, race condition.
---

# State Modeling & Finite-State Resilience (`fe-state-modeling`)

This skill provides guidelines for modeling robust UI state logic, handling explicit Loading/Success/Error/Empty states, and organizing Zustand state slices.

## State Modeling Rules

### 1. Explicit State Enums / Unions
- Avoid using multiple uncoordinated boolean flags (`isLoading`, `isError`, `isSuccess`).
- Model async UI states using explicit discriminated unions or state enums:
  ```ts
  type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

  interface StateSlice<T> {
    status: AsyncStatus;
    data: T | null;
    error: string | null;
  }
  ```

### 2. Mandatory Empty & Error State Handling
- Every UI component rendering asynchronous data must explicitly render:
  1. **Loading Skeleton/Spinner** when `status === 'loading'`
  2. **Error Banner with Retry Action** when `status === 'error'`
  3. **Empty State Illustration & Message** when `data` is empty
  4. **Content View** when `status === 'success'` with non-empty data

### 3. Zustand Slice Architecture
- Split store logic into modular, domain-aligned slices (`authSlice`, `chatSlice`, `callSlice`).
- Keep store actions immutable and handle async side-effects cleanly without mutating state drafts directly.
