"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useAuthSession } from "@/lib/use-auth-session";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuthSession();
  const [supabaseReady, setSupabaseReady] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getSafeRedirectTo = () => {
    const params = new URLSearchParams(window.location.search);
    const redirectCandidate = params.get("redirectTo") || "/jobs";
    return redirectCandidate.startsWith("/") && !redirectCandidate.startsWith("//")
      ? redirectCandidate
      : "/jobs";
  };

  useEffect(() => {
    getSupabaseBrowserClient();
    setSupabaseReady(true);
  }, []);

  useEffect(() => {
    if (!loading && user) {
      router.replace(getSafeRedirectTo());
    }
  }, [loading, router, user]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabaseReady) return;
    setPending(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      if (!data.session) {
        setError("No session was returned. Check Supabase auth settings for this user.");
        return;
      }

      router.replace(getSafeRedirectTo());
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Sign-in failed. Check network access to Supabase and try again.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="layout">
      <section className="panel" style={{ maxWidth: 520, margin: "48px auto" }}>
        <h1>Field Login</h1>
        <p className="hint">Sign in with your existing 4E CRM account.</p>
        <form onSubmit={onSubmit} className="stack" style={{ marginTop: 12 }}>
          <label className="stack">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="stack">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={pending || !supabaseReady}>
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
