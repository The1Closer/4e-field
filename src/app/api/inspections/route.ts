export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRouteSupabaseClient, getRouteUserId } from "@/lib/server-supabase";

function normalizeComponentPresence(input: unknown) {
  if (!input || typeof input !== "object") return {};
  const entries = Object.entries(input as Record<string, unknown>).map(([key, value]) => {
    if (typeof value === "boolean") {
      return [key, { present: value, quantity: value ? 1 : null }];
    }
    if (value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      const present = Boolean(v.present);
      const quantityRaw = Number(v.quantity);
      return [
        key,
        {
          present,
          quantity: present && Number.isFinite(quantityRaw) && quantityRaw >= 0 ? Math.floor(quantityRaw) : null,
        },
      ];
    }
    return [key, { present: false, quantity: null }];
  });
  return Object.fromEntries(entries);
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getRouteUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getRouteSupabaseClient(request);
    const { data, error } = await supabase
      .from("inspections")
      .select("*")
      .eq("rep_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);
    return NextResponse.json({ inspections: data ?? [] }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to list inspections." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getRouteUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const supabase = getRouteSupabaseClient(request);

    const payload = {
      rep_id: userId,
      session_id: body.sessionId ?? null,
      knock_event_id: body.knockEventId ?? null,
      linked_job_id: body.linkedJobId ?? null,
      status: body.status ?? "in_progress",
      current_step: body.currentStep ?? "precheck",
      homeowner_name: body.homeownerName ?? null,
      homeowner_phone: body.homeownerPhone ?? null,
      homeowner_email: body.homeownerEmail ?? null,
      homeowner_address: body.homeownerAddress ?? null,
      signature_rep_name: body.signatureRepName ?? null,
      signature_signed_at: body.signatureSignedAt ?? null,
      perimeter_findings: body.perimeterFindings ?? {},
      component_presence: normalizeComponentPresence(body.componentPresence),
      metadata: body.metadata ?? {},
    };

    const { data, error } = await supabase.from("inspections").insert(payload).select("*").single();
    if (error || !data) throw new Error(error?.message || "Failed to create inspection.");

    return NextResponse.json({ inspection: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create inspection." }, { status: 500 });
  }
}
