---
name: fe-figma-to-code
description: Parses visual details from images/Figma specs and maps them to clean CSS/Tailwind layouts. Use when handling figma, replicate, image to code, design spec, pixel perfect.
---

# Figma to Code & Pixel-Perfect Layouts (`fe-figma-to-code`)

This skill defines instructions for converting Figma design specifications, screenshots, and visual mockups into clean, responsive React and Tailwind CSS components.

## Conversion Rules

### 1. Spacing & Grid System Extraction
- Extract exact padding, margin, gap, and radius tokens from design specs into Tailwind utilities (`gap-4`, `p-6`, `rounded-2xl`).
- Build flexbox and CSS Grid layouts that automatically adapt to mobile, tablet, and desktop breakpoints.

### 2. Exact Color & Typography Mapping
- Convert hex colors (`#0f172a`, `#6366f1`) to corresponding Tailwind classes or CSS custom variables.
- Match font sizes (`text-xs`, `text-sm`, `text-lg`, `text-2xl`), line heights, and letter spacing.

### 3. Responsive Adaptability
- Ensure design specs designed for desktop gracefully collapse into drawer/bottom-sheet sidebars on mobile viewports using responsive prefixes (`hidden md:flex`, `grid-cols-1 md:grid-cols-3`).
