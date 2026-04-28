export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getRouteSupabaseClient, getRouteUserId } from "@/lib/server-supabase";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

async function getId(context: RouteContext) {
  const resolved = await context.params;
  return resolved.id;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const inspectionId = await getId(context).catch(() => null);
  try {
    const userId = await getRouteUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!inspectionId) return NextResponse.json({ error: "Missing inspection id" }, { status: 400 });

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
      clientReportId?: string | null;
    };

    const supabase = getRouteSupabaseClient(request);
    const fileName = body.fileName?.trim() || `inspection-report-${inspectionId}.pdf`;
    const filePath = body.filePath?.trim() || `${userId}/reports/${inspectionId}/${Date.now()}-${fileName}`;
    const contentType = body.contentType?.trim() || "application/pdf";
    const sizeBytes = Number(body.sizeBytes);
    const clientReportId = body.clientReportId?.trim() || null;

    const baseRow = {
      inspection_id: inspectionId,
      rep_id: userId,
      linked_job_id: body.linkedJobId ?? null,
      report_type: "inspection" as const,
      title: body.title ?? "Inspection Report",
      file_name: fileName,
      file_path: filePath,
      content_type: contentType,
      size_bytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
      selected_photo_ids: body.selectedPhotoIds ?? [],
      crm_document_id: body.crmDocumentId ?? null,
      crm_job_id: body.crmJobId ?? null,
      payload: body.payload ?? {},
      ...(clientReportId ? { client_report_id: clientReportId } : {}),
    };

    // Idempotency: if the client supplied a clientReportId, treat (inspection_id, client_report_id)
    // as the natural key. Otherwise (legacy callers / no UUID) fall back to a plain insert.
    let data: Record<string, unknown> | null = null;
    let upsertError: { message: string } | null = null;
    if (clientReportId) {
      const existing = await supabase
        .from("inspection_reports")
        .select("id")
        .eq("inspection_id", inspectionId)
        .eq("client_report_id", clientReportId)
        .eq("rep_id", userId)
        .maybeSingle();
      if (existing.data?.id) {
        const update = await supabase
          .from("inspection_reports")
          .update(baseRow)
          .eq("id", existing.data.id)
          .select("*")
          .single();
        data = update.data as Record<string, unknown> | null;
        upsertError = update.error ? { message: update.error.message } : null;
      } else {
        const insert = await supabase.from("inspection_reports").insert(baseRow).select("*").single();
        data = insert.data as Record<string, unknown> | null;
        upsertError = insert.error ? { message: insert.error.message } : null;
        // If the unique index existed and a race created it concurrently, fall back to update.
        if (upsertError && /duplicate key|unique/i.test(upsertError.message)) {
          const refetch = await supabase
            .from("inspection_reports")
            .select("id")
            .eq("inspection_id", inspectionId)
            .eq("client_report_id", clientReportId)
            .eq("rep_id", userId)
            .maybeSingle();
          if (refetch.data?.id) {
            const fallbackUpdate = await supabase
              .from("inspection_reports")
              .update(baseRow)
              .eq("id", refetch.data.id)
              .select("*")
              .single();
            data = fallbackUpdate.data as Record<string, unknown> | null;
            upsertError = fallbackUpdate.error ? { message: fallbackUpdate.error.message } : null;
          }
        }
      }
    } else {
      const insert = await supabase.from("inspection_reports").insert(baseRow).select("*").single();
      data = insert.data as Record<string, unknown> | null;
      upsertError = insert.error ? { message: insert.error.message } : null;
    }

    if (upsertError || !data) {
      throw new Error(upsertError?.message || "Failed to create inspection report record.");
    }

    try {
      revalidatePath(`/inspections/${inspectionId}`);
    } catch {
      // revalidate may fail outside RSC contexts — non-fatal.
    }

    return NextResponse.json({ report: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate report.";
    console.error(JSON.stringify({
      level: "error",
      route: "/api/inspections/[id]/report",
      inspectionId,
      message,
    }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
