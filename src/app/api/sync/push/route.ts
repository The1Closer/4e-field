export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRouteSupabaseClient, getRouteUserId } from "@/lib/server-supabase";

type PushOperation = {
  clientOperationId: string;
  operationType: "insert" | "update" | "upsert" | "delete";
  resourceType: string;
  resourceId?: string | null;
  payload: Record<string, unknown>;
  queuedAt?: string;
};

export async function POST(request: NextRequest) {
  try {
    const userId = await getRouteUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      operations?: PushOperation[];
    };

    const operations = Array.isArray(body.operations) ? body.operations : [];
    if (operations.length === 0) {
      return NextResponse.json({ acceptedClientOperationIds: [] }, { status: 200 });
    }

    const supabase = getRouteSupabaseClient(request);
    const acceptedClientOperationIds: string[] = [];

    for (const operation of operations.slice(0, 500)) {
      const clientOperationId = String(operation.clientOperationId ?? "").trim();
      if (!clientOperationId) continue;

      const payload = {
        rep_id: userId,
        client_operation_id: clientOperationId,
        operation_type: operation.operationType,
        resource_type: operation.resourceType,
        resource_id: operation.resourceId ?? null,
        payload: operation.payload ?? {},
        status: "queued",
        queued_at: operation.queuedAt ?? new Date().toISOString(),
      };

      const { error } = await supabase
        .from("sync_operations")
        .upsert(payload, { onConflict: "rep_id,client_operation_id" });

      if (!error) {
        acceptedClientOperationIds.push(clientOperationId);
      }
    }

    return NextResponse.json({ acceptedClientOperationIds }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync push failed." },
      { status: 500 },
    );
  }
}
