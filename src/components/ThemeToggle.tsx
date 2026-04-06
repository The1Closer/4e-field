"use client";

import { useEffect, useState } from "react";

type AppTheme = "dark" | "light";

const THEME_STORAGE_KEY = "4e-field-theme";

function getSystemTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolveInitialTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return getSystemTheme();
}

function applyTheme(theme: AppTheme) {
  const root = document.documentElement;
  root.classList.toggle("theme-light", theme === "light");
  root.style.colorScheme = theme;
}

function ThemeIcon({ theme }: { theme: AppTheme }) {
  if (theme === "light") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          d="M16.2 2.3c-2.6.7-4.8 2.7-5.7 5.3-.8 2.3-.5 4.8.8 6.8 1.3 2.1 3.5 3.5 5.9 3.9-1.1.8-2.5 1.3-4 1.3-3.9 0-7-3.1-7-7 0-4.6 4.3-8 9-7.6z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      <path
        d="M12 2.2v2.3m0 15v2.3M2.2 12h2.3m15 0h2.3M5 5l1.7 1.7m10.6 10.6L19 19M5 19l1.7-1.7m10.6-10.6L19 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<AppTheme>(() => resolveInitialTheme());

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const isLightTheme = theme === "light";

  return (
    <button
      suppressHydrationWarning
      type="button"
      onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      className="secondary icon-btn theme-toggle"
      aria-label={`Switch to ${isLightTheme ? "dark" : "light"} mode`}
      title={isLightTheme ? "Switch to dark mode" : "Switch to light mode"}
    >
      <ThemeIcon theme={theme} />
      <span className="sr-only">{`Current theme ${theme}. Activate to switch themes.`}</span>
    </button>
  );
}

