"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthSession } from "@/lib/use-auth-session";

export default function HomePage() {
  const router = useRouter();
  const { user, loading, error } = useAuthSession();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/jobs" : "/login");
  }, [loading, router, user]);

  return (
    <main className="layout">
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>4E Field</h2>
        {loading ? <p className="hint">Loading session...</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <div className="row">
          <Link className="tab" href="/login">
            Go to Login
          </Link>
          <Link className="tab" href="/jobs">
            Go to Jobs
          </Link>
        </div>
      </section>
    </main>
  );
}
