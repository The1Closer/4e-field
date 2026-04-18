"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useAuthSession } from "@/lib/use-auth-session";
import type { JsonRecord } from "@/types/models";

type ForeverContactRow = JsonRecord & {
  id: string;
  address: string;
  homeowner_name?: string | null;
  homeowner_phone?: string | null;
  homeowner_email?: string | null;
  contracted_ever?: boolean | null;
  last_seen_at?: string | null;
};

type ViewRow = {
  id: string;
  address: string;
  name: string;
  phone: string;
  email: string;
  contracted: boolean;
  completeness: number;
  lastSeenAt: string | null;
};

function textOrBlank(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function byCompletenessThenRecency(a: ViewRow, b: ViewRow) {
  if (b.completeness !== a.completeness) {
    return b.completeness - a.completeness;
  }

  const aMs = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
  const bMs = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
  if (bMs !== aMs) {
    return bMs - aMs;
  }

  return a.address.localeCompare(b.address);
}

export default function KnockingContactsPage() {
  const router = useRouter();
  const {
    user,
    loading,
    role,
    signOut,
    accessToken,
    error: authError,
    profileImageUrl,
    fullName,
  } = useAuthSession();

  const [rows, setRows] = useState<ForeverContactRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?redirectTo=/knocking/contacts");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const loadRows = async () => {
      setLoadingRows(true);
      setError(null);
      setMessage(null);

      try {
        const { error: refreshError } = await supabase.rpc("refresh_knock_address_contacts_forever");
        if (refreshError && active) {
          setMessage(`Lead List refresh warning: ${refreshError.message}`);
        }

        const { data, error: queryError } = await supabase
          .from("knock_address_contacts_forever")
          .select(
            "id,address,homeowner_name,homeowner_phone,homeowner_email,contracted_ever,last_seen_at",
          )
          .order("last_seen_at", { ascending: false })
          .limit(5000);

        if (queryError) {
          throw new Error(queryError.message);
        }

        if (!active) return;
        setRows((data ?? []) as ForeverContactRow[]);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Could not load Lead List.");
      } finally {
        if (active) {
          setLoadingRows(false);
        }
      }
    };

    void loadRows();

    return () => {
      active = false;
    };
  }, [supabase, user]);

  const viewRows = useMemo(() => {
    const mapped: ViewRow[] = rows.map((row) => {
      const name = textOrBlank(row.homeowner_name);
      const phone = textOrBlank(row.homeowner_phone);
      const email = textOrBlank(row.homeowner_email);
      const completeness = Number(Boolean(name)) + Number(Boolean(phone)) + Number(Boolean(email));

      return {
        id: row.id,
        address: textOrBlank(row.address),
        name,
        phone,
        email,
        contracted: Boolean(row.contracted_ever),
        completeness,
        lastSeenAt: typeof row.last_seen_at === "string" ? row.last_seen_at : null,
      };
    });

    mapped.sort(byCompletenessThenRecency);
    return mapped;
  }, [rows]);

  if (loading) {
    return <main className="layout">Loading session...</main>;
  }

  if (!user) {
    return <main className="layout">Redirecting to sign in...</main>;
  }

  return (
    <AppShell
      role={role}
      profileName={fullName}
      profileImageUrl={profileImageUrl}
      onSignOut={signOut}
      debug={{
        userId: user.id,
        role,
        accessToken,
        authError,
      }}
    >
      <section className="panel">
        <div className="row">
          <h2 style={{ margin: 0 }}>Lead List</h2>
          <p className="hint">{viewRows.length} addresses</p>
        </div>
        <p className="hint">
          Permanent address contacts. New non-empty knock details overwrite existing values for that address.
        </p>
        {message ? <p className="hint">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {loadingRows ? <p className="hint">Loading Lead List...</p> : null}

        {!loadingRows && viewRows.length === 0 ? (
          <p className="hint">No addresses yet.</p>
        ) : (
          <div className="lead-list-table-wrap">
            <table className="lead-list-table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Contracted</th>
                </tr>
              </thead>
              <tbody>
                {viewRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.address || ""}</td>
                    <td>{row.name || ""}</td>
                    <td>
                      {row.phone ? <a href={`tel:${row.phone}`}>{row.phone}</a> : ""}
                    </td>
                    <td>
                      {row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : ""}
                    </td>
                    <td>
                      <span className={row.contracted ? "pill pill-green" : "pill"}>
                        {row.contracted ? "Yes" : "No"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
