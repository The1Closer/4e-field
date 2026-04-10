export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRouteSupabaseClient, getRouteUserId } from "@/lib/server-supabase";

function normalizeComponentPresence(input: unknown) {
  if (!input || typeof input !== "object") return input ?? {};
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

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

async function getId(context: RouteContext) {
  const resolved = await context.params;
  return resolved.id;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getRouteUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = await getId(context);
    const supabase = getRouteSupabaseClient(request);

    const { data, error } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", id)
      .eq("rep_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ inspection: data }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load inspection." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getRouteUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = await getId(context);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const supabase = getRouteSupabaseClient(request);

    const payload = {
      status: body.status,
      current_step: body.currentStep,
      homeowner_name: body.homeownerName,
      homeowner_phone: body.homeownerPhone,
      homeowner_email: body.homeownerEmail,
      homeowner_address: body.homeownerAddress,
      signature_rep_name: body.signatureRepName,
      signature_signed_at: body.signatureSignedAt,
      completed_at: body.completedAt,
      perimeter_findings: body.perimeterFindings,
      component_presence: normalizeComponentPresence(body.componentPresence),
      metadata: body.metadata,
    };

    const { data, error } = await supabase
      .from("inspections")
      .update(payload)
      .eq("id", id)
      .eq("rep_id", userId)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ inspection: data }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update inspection." }, { status: 500 });
  }
}
