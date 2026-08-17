---
name: fe-security
description: Enforces client-side security, safe HTML rendering, token storage protocols, and sanitization. Use when handling frontend security, xss, csrf, input sanitization, local storage, auth tokens.
---

# Client-Side Security & Sanitization (`fe-security`)

This skill provides guidelines for enforcing client-side security, preventing Cross-Site Scripting (XSS), managing auth tokens securely, and sanitizing user inputs.

## Security Rules

### 1. Safe HTML Rendering & XSS Defenses
- **Never use `dangerouslySetInnerHTML`** unless rendering sanitized HTML through a trusted library like `DOMPurify`.
- Rely on standard React JSX text nodes (`<span>{userMessage}</span>`), which automatically escape HTML entities.

### 2. Token & Session Management
- Prefer storing session tokens in **HttpOnly, Secure, SameSite=Strict cookies** managed by the server.
- Avoid placing raw sensitive authorization tokens or secrets in plain `localStorage` where XSS scripts can read them.

### 3. Input Sanitization & Form Protection
- Validate user inputs prior to form submission.
- Ensure file upload inputs explicitly restrict accepted MIME types (`accept="image/png, image/jpeg"`).
