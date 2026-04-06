"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { UserRole } from "@/types/models";

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  fullName: string | null;
  includeInNightlyNumbers: boolean;
  error: string | null;
};

const isRole = (value: unknown): value is UserRole => {
  return (
    value === "admin" ||
    value === "manager" ||
    value === "sales_manager" ||
    value === "production_manager" ||
    value === "social_media_coordinator" ||
    value === "rep"
  );
};

function getRoleFromUserMetadata(user: User | null): UserRole | null {
  if (!user) return null;

  const appRole = user.app_metadata?.role;
  if (isRole(appRole)) return appRole;

  const userRole = user.user_metadata?.role;
  if (isRole(userRole)) return userRole;

  return null;
}

export function useAuthSession() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [state, setState] = useState<AuthState>({
    loading: true,
    session: null,
    user: null,
    role: null,
    fullName: null,
    includeInNightlyNumbers: false,
    error: null,
  });

  useEffect(() => {
    setSupabase(getSupabaseBrowserClient());
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;

    const loadProfile = async (userId: string) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("role,full_name,include_in_nightly_numbers")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        return null;
      }

      return {
        role: isRole(data?.role) ? data.role : null,
        fullName: typeof data?.full_name === "string" ? data.full_name : null,
        includeInNightlyNumbers: Boolean(data?.include_in_nightly_numbers),
      };
    };

    const applySession = (session: Session | null) => {
      const currentUser = session?.user ?? null;
      const fallbackRole = getRoleFromUserMetadata(currentUser);

      setState((previous) => ({
        ...previous,
        loading: false,
        session,
        user: currentUser,
        role: fallbackRole,
        fullName:
          typeof currentUser?.user_metadata?.full_name === "string"
            ? String(currentUser.user_metadata.full_name)
            : null,
        includeInNightlyNumbers: false,
        error: null,
      }));

      if (!currentUser) return;

      void loadProfile(currentUser.id)
        .then((dbProfile) => {
          if (!isMounted) return;
          if (!dbProfile) return;

          setState((previous) => {
            if (previous.user?.id !== currentUser.id) {
              return previous;
            }

            return {
              ...previous,
              role: dbProfile.role ?? previous.role,
              fullName: dbProfile.fullName ?? previous.fullName,
              includeInNightlyNumbers: dbProfile.includeInNightlyNumbers,
            };
          });
        })
        .catch(() => {
          // Keep fallback role if profile lookup fails.
        });
    };

    const load = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (error) {
        setState((previous) => ({ ...previous, loading: false, error: error.message }));
        return;
      }

      applySession(data.session ?? null);
    };

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) return;

      applySession(newSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, [supabase]);

  return {
    ...state,
    accessToken: state.session?.access_token ?? null,
    signOut,
  };
}
