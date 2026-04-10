export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRouteSupabaseClient, getRouteUserId } from "@/lib/server-supabase";

export async function GET(request: NextRequest) {
  try {
    const userId = await getRouteUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getRouteSupabaseClient(request);
    const { data, error } = await supabase
      .from("sync_operations")
      .select("id,client_operation_id,operation_type,resource_type,resource_id,status,attempts,last_error,queued_at,synced_at")
      .eq("rep_id", userId)
      .order("queued_at", { ascending: true })
      .limit(500);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ operations: data ?? [] }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync pull failed." },
      { status: 500 },
    );
  }
}
