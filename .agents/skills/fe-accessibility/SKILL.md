---
name: fe-accessibility
description: Inserts proper semantic HTML, ARIA labels, focus-trap management, and keyboard navigation. Use when handling accessibility, a11y, aria, keyboard nav, screen reader, semantic.
---

# Accessibility & ARIA Standard (`fe-accessibility`)

This skill provides guidelines for building accessible web interfaces adhering to WCAG standards, semantic HTML5 markup, keyboard navigation, and ARIA labels.

## Accessibility Rules

### 1. Semantic HTML Markup
- Prefer semantic elements (`<main>`, `<header>`, `<nav>`, `<section>`, `<article>`, `<button>`) over generic `<div>` wrappers.
- Icon-only buttons must include an explicit `aria-label`:
  ```tsx
  <button aria-label="Mute Microphone" onClick={toggleMute}>
    <MicOffIcon className="w-5 h-5" />
  </button>
  ```

### 2. Keyboard Navigation & Focus Management
- Ensure all interactive elements have visible focus outlines (`focus-visible:ring-2 focus-visible:ring-indigo-500`).
- Ensure custom modal dialogs trap focus and close when pressing the `Escape` key.

### 3. Screen Reader Live Regions
- Use `aria-live="polite"` or `aria-live="assertive"` for real-time status updates (e.g. "User joined call", "New message received").
