import type { Metadata, Viewport } from "next";
import "./globals.css";

const themeInitScript = `
  (function () {
    try {
      var key = '4e-field-theme';
      var stored = window.localStorage.getItem(key);
      var theme = stored === 'light' || stored === 'dark'
        ? stored
        : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      var root = document.documentElement;
      root.classList.toggle('theme-light', theme === 'light');
      root.style.colorScheme = theme;
    } catch {}
  })();
`;

export const metadata: Metadata = {
  title: "4E Field",
  description: "Field operations app for reps and managers",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050505" },
    { media: "(prefers-color-scheme: light)", color: "#eef3f8" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: themeInitScript,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
