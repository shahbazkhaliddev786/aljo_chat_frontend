// Auth Domain — Public API
export type { LoginRequest, RegisterRequest, AuthResponse } from "./types";
export { authService } from "./services/auth.service";
export { default as LoginPage } from "./pages/LoginPage";
export { default as RegisterPage } from "./pages/RegisterPage";
export { default as RedirectPage } from "./pages/RedirectPage";
