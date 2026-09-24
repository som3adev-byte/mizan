/**
 * The user's explicit theme choice, in a cookie so the server can render
 * html[data-theme] and the page never needs a script to pick its colours.
 * No cookie means "follow the device" (handled by prefers-color-scheme in CSS).
 */
export const THEME_COOKIE = "mizan-theme";
export type Theme = "light" | "dark";
export const isTheme = (v: unknown): v is Theme => v === "light" || v === "dark";
