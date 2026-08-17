---
name: fe-premium-ui
description: Applies luxury design tokens, smooth animations, layout transitions, and high-fidelity polish. Use when handling premium UI, design system, layout, polish, micro-interactions, animation.
---

# Premium UI & High-Fidelity Polish (`fe-premium-ui`)

This skill provides guidelines for crafting luxury, state-of-the-art user interfaces, smooth CSS/Tailwind animations, glassmorphism aesthetics, and responsive micro-interactions.

## Design System & Styling Rules

### 1. Curated Color Palettes & Glassmorphism
- Avoid default browser colors. Use rich dark modes, HSL tailored accents, subtle borders (`border-white/10`), and glassmorphism backdrop blurs (`backdrop-blur-md bg-slate-900/80`).
- Ensure consistent color tokens across headers, sidebars, active states, and call overlays.

### 2. Smooth Micro-Interactions & Hover Feedback
- Add subtle scale and opacity transitions for interactive buttons and action icons:
  ```tsx
  <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all duration-200 rounded-xl shadow-lg shadow-indigo-500/20">
    Join Call
  </button>
  ```

### 3. Layout Transitions & Skeleton Loaders
- Use skeleton loaders instead of plain loading text during async data fetches.
- Implement smooth layout transitions for opening modals, expanding sidebars, and grid adjustments.

### 4. Typography & Visual Hierarchy
- Use modern fonts (Inter, Outfit, Roboto) with defined weights (`font-semibold`, `tracking-tight`).
- Pair clear subheadings with subtle muted text colors (`text-slate-400`).
