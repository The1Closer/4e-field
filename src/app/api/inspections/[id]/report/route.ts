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

    const inspectionId = await getId(context);
    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      selectedPhotoIds?: string[];
      linkedJobId?: string | null;
      fileName?: string;
      filePath?: string;
      contentType?: string;
      sizeBytes?: number;
      crmDocumentId?: string | null;
      crmJobId?: string | null;
      payload?: Record<string, unknown>;
    };

    const supabase = getRouteSupabaseClient(request);
    const fileName = body.fileName?.trim() || `inspection-report-${inspectionId}.pdf`;
    const filePath = body.filePath?.trim() || `${userId}/reports/${inspectionId}/${Date.now()}-${fileName}`;
    const contentType = body.contentType?.trim() || "application/pdf";
    const sizeBytes = Number(body.sizeBytes);

    const { data, error } = await supabase
      .from("inspection_reports")
      .insert({
        inspection_id: inspectionId,
        rep_id: userId,
        linked_job_id: body.linkedJobId ?? null,
        report_type: "inspection",
        title: body.title ?? "Inspection Report",
        file_name: fileName,
        file_path: filePath,
        content_type: contentType,
        size_bytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
        selected_photo_ids: body.selectedPhotoIds ?? [],
        crm_document_id: body.crmDocumentId ?? null,
        crm_job_id: body.crmJobId ?? null,
        payload: body.payload ?? {},
      })
      .select("*")
      .single();

    if (error || !data) throw new Error(error?.message || "Failed to create inspection report record.");

    return NextResponse.json({ report: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to generate report." }, { status: 500 });
  }
}
