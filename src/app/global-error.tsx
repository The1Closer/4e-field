"use client";

import "./globals.css";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body>
        <main className="shell-center">
          <section className="panel error-shell">
            <h2 className="error-title">Application Error</h2>
            <p className="hint">
              A critical error occurred while rendering the app.
            </p>
            <p className="error" style={{ marginTop: 10 }}>
              {error.message || "Unexpected application error."}
            </p>
            <div className="error-actions">
              <button onClick={() => reset()}>Try again</button>
              <a href="/jobs" className="tab">
                Go to Home
              </a>
              <a href="/login" className="tab">
                Sign in again
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
