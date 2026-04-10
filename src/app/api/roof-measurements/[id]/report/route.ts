export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRouteSupabaseClient, getRouteUserId } from "@/lib/server-supabase";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

async function getId(context: RouteContext) {
  const resolved = await context.params;
  return resolved.id;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getRouteUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const measurementId = await getId(context);
    const body = (await request.json().catch(() => ({}))) as {
      linkedJobId?: string | null;
      title?: string;
      payload?: Record<string, unknown>;
    };

    const supabase = getRouteSupabaseClient(request);
    const fileName = `measurement-report-${measurementId}.json`;
    const filePath = `${userId}/reports/measurements/${measurementId}/${Date.now()}-${fileName}`;

    const { data, error } = await supabase
      .from("inspection_reports")
      .insert({
        measurement_id: measurementId,
        rep_id: userId,
        linked_job_id: body.linkedJobId ?? null,
        report_type: "measurement",
        title: body.title ?? "Roof Measurement Report",
        file_name: fileName,
        file_path: filePath,
        content_type: "application/json",
        payload: body.payload ?? {},
      })
      .select("*")
      .single();

    if (error || !data) throw new Error(error?.message || "Failed to create measurement report record.");

    return NextResponse.json({ report: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to generate measurement report." }, { status: 500 });
  }
}
