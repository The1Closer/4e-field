"use client";

import { useEffect, useState } from "react";
import type { UserRole } from "@/types/models";

type ProbeState = {
  label: string;
  status: "idle" | "loading" | "ok" | "error";
  detail: string;
};

type Props = {
  userId: string | null;
  role: UserRole | null;
  accessToken: string | null;
  authError: string | null;
};

const ENDPOINTS = [
  { label: "CRM Tasks", path: "/api/tasks" },
  { label: "CRM Notifications", path: "/api/notifications?view=unread-count" },
];

async function runProbe(path: string, accessToken: string): Promise<ProbeState> {
  try {
    const response = await fetch(`/api/crm${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const bodyText = await response.text();

    if (response.ok) {
      return {
        label: "",
        status: "ok",
        detail: `OK ${response.status}`,
      };
    }

    let message = `HTTP ${response.status}`;
    try {
      const payload = JSON.parse(bodyText) as { error?: string; message?: string };
      message = payload.error || payload.message || message;
    } catch {
      if (bodyText.trim().length > 0) {
        message = bodyText.slice(0, 120);
      }
    }

    return {
      label: "",
      status: "error",
      detail: message,
    };
  } catch (error) {
    return {
      label: "",
      status: "error",
      detail: error instanceof Error ? error.message : "Network error",
    };
  }
}

export function DebugBanner({ userId, role, accessToken, authError }: Props) {
  const [probes, setProbes] = useState<ProbeState[]>(
    ENDPOINTS.map((endpoint) => ({
      label: endpoint.label,
      status: "idle",
      detail: "Not checked",
    })),
  );

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!accessToken) {
        setProbes(
          ENDPOINTS.map((endpoint) => ({
            label: endpoint.label,
            status: "error",
            detail: "Missing access token",
          })),
        );
        return;
      }

      setProbes(
        ENDPOINTS.map((endpoint) => ({
          label: endpoint.label,
          status: "loading",
          detail: "Checking...",
        })),
      );

      const results = await Promise.all(
        ENDPOINTS.map(async (endpoint) => {
          const probe = await runProbe(endpoint.path, accessToken);
          return {
            ...probe,
            label: endpoint.label,
          };
        }),
      );

      if (!active) return;
      setProbes(results);
    };

    run();

    return () => {
      active = false;
    };
  }, [accessToken, userId]);

  return (
    <section className="panel" style={{ borderColor: "#f3c969" }}>
      <div className="row">
        <h3 style={{ margin: 0 }}>Debug Auth</h3>
        <span className="hint">Temporary diagnostics</span>
      </div>
      <p className="hint">
        User: {userId ?? "none"} | Role: {role ?? "unknown"} | Token:{" "}
        {accessToken ? `present (${accessToken.slice(0, 12)}...)` : "missing"}
      </p>
      {authError ? <p className="error">Auth: {authError}</p> : null}
      <div className="grid">
        {probes.map((probe) => (
          <article key={probe.label} className="job-card">
            <div className="row">
              <strong>{probe.label}</strong>
              <span className={probe.status === "ok" ? "pill pill-green" : "pill"}>
                {probe.status}
              </span>
            </div>
            <p className="hint">{probe.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
