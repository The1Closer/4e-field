"use client";

import Link from "next/link";
import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="shell-center">
      <section className="panel error-shell">
        <h2 className="error-title">Something went wrong</h2>
        <p className="hint">
          We hit an unexpected error while loading this screen.
        </p>
        <p className="error" style={{ marginTop: 10 }}>
          {error.message || "Unexpected application error."}
        </p>
        <div className="error-actions">
          <button onClick={() => reset()}>Try again</button>
          <Link href="/jobs" className="tab">
            Go to Home
          </Link>
          <Link href="/login" className="tab">
            Sign in again
          </Link>
        </div>
      </section>
    </main>
  );
}
