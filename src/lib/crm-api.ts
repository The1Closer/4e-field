export type UploadInitResponse = {
  upload?: {
    filePath: string;
    token: string;
    fileType: "photo" | "document";
    fileName: string;
  };
  document?: {
    id: string;
    file_name: string;
    file_path: string;
    file_type: "photo" | "document";
    created_at: string;
  };
  success?: boolean;
  updated?: number;
  notification?: Record<string, unknown>;
  note?: Record<string, unknown>;
  error?: string;
  notifications?: Array<Record<string, unknown>>;
  filePath?: string;
  documentId?: string;
  headers?: Record<string, string>;
  [key: string]: unknown;
};

type JsonValue = Record<string, unknown>;
type TaskListResponse = {
  tasks?: Array<Record<string, unknown>>;
};
type NotificationListResponse = {
  notifications?: Array<Record<string, unknown>>;
};
type TaskPatchInput = {
  taskId: string;
  status: "open" | "completed";
  title: string;
  kind?: string;
  description?: string | null;
  jobId?: string | null;
  presetId?: string | null;
  scheduledFor?: string | null;
  dueAt?: string | null;
  appointmentAddress?: string | null;
  assigneeIds?: string[];
};

type JobCreateInput = {
  homeownerName: string;
  phone?: string | null;
  address?: string | null;
  email?: string | null;
};

type TaskCreateInput = {
  jobId: string;
  title: string;
  description?: string | null;
  kind?: "task" | "appointment";
  scheduledFor?: string | null;
  dueAt?: string | null;
  appointmentAddress?: string | null;
};

class CrmApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CrmApiError";
    this.status = status;
  }
}

function getCrmFetchTimeoutMs() {
  const parsed = Number(process.env.NEXT_PUBLIC_CRM_FETCH_TIMEOUT_MS ?? 12000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 12000;
}

function buildHeaders(accessToken: string, init?: RequestInit) {
  const headers = new Headers(init?.headers ?? {});
  headers.set("Authorization", `Bearer ${accessToken}`);

  const method = (init?.method ?? "GET").toUpperCase();
  const hasBody = typeof init?.body !== "undefined" && init.body !== null;
  if (hasBody && !headers.has("Content-Type") && !["GET", "HEAD"].includes(method)) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function crmFetch<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const proxyUrl = `/api/crm${path}`;
  const timeoutMs = getCrmFetchTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const requestInit: RequestInit = {
    ...init,
    headers: buildHeaders(accessToken, init),
    signal: controller.signal,
  };

  let response: Response;
  try {
    response = await fetch(proxyUrl, requestInit);
  } catch (networkError) {
    if (networkError instanceof Error && networkError.name === "AbortError") {
      throw new Error(`CRM request timed out after ${timeoutMs}ms (${path}).`);
    }
    throw new Error(
      `CRM proxy request failed (${path}): ${asErrorMessage(networkError)}. ` +
        `Check field app dev server connectivity.`,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let detail = `Request failed: ${response.status}`;
    const responseText = await response.text();
    if (responseText.trim().length > 0) {
      try {
        const payload = JSON.parse(responseText) as { error?: string; message?: string; detail?: string };
        detail = payload.error || payload.message || payload.detail || detail;
      } catch {
        const compactText = responseText.trim();
        if (compactText.startsWith("<!DOCTYPE html") || compactText.startsWith("<html")) {
          detail = `CRM returned an HTML error page (HTTP ${response.status}). Check CRM deployment logs.`;
        } else {
          detail = responseText.slice(0, 260);
        }
      }
    }

    if (response.status === 401) {
      throw new CrmApiError("Unauthorized. Please sign out and sign in again.", 401);
    }

    throw new CrmApiError(detail, response.status);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

export const crmApi = {
  async listNotifications(accessToken: string) {
    return crmFetch<NotificationListResponse>(`/api/notifications`, accessToken, {
      method: "GET",
    });
  },

  async listTasks(accessToken: string) {
    return crmFetch<TaskListResponse>(`/api/tasks`, accessToken, {
      method: "GET",
    });
  },

  async createJob(input: JobCreateInput, accessToken: string) {
    return crmFetch<{ success?: boolean; jobId?: string; error?: string }>(`/api/jobs`, accessToken, {
      method: "POST",
      body: JSON.stringify({
        homeowner_name: input.homeownerName,
        phone: input.phone ?? "",
        address: input.address ?? "",
        email: input.email ?? "",
      }),
    });
  },

  async updateJobStage(jobId: string, stageId: number, accessToken: string) {
    return crmFetch<JsonValue>(`/api/jobs/${jobId}`, accessToken, {
      method: "PATCH",
      body: JSON.stringify({
        stage_id: stageId,
      }),
    });
  },

  async createTask(input: TaskCreateInput, accessToken: string) {
    return crmFetch<{ taskId?: string; error?: string }>(`/api/tasks`, accessToken, {
      method: "POST",
      body: JSON.stringify({
        jobId: input.jobId,
        title: input.title,
        description: input.description ?? "",
        kind: input.kind ?? "appointment",
        status: "open",
        scheduledFor: input.scheduledFor ?? null,
        dueAt: input.dueAt ?? null,
        appointmentAddress: input.appointmentAddress ?? "",
        assigneeIds: [],
      }),
    });
  },

  async createJobNote(jobId: string, accessToken: string, noteText: string) {
    const trimmedText = noteText.trim();
    const payloadVariants: Array<Record<string, string>> = [
      { body: trimmedText },
      { content: trimmedText },
    ];

    let lastError: unknown = null;

    for (let index = 0; index < payloadVariants.length; index += 1) {
      const payload = payloadVariants[index];
      const isLastAttempt = index === payloadVariants.length - 1;

      try {
        return await crmFetch<JsonValue>(`/api/jobs/${jobId}/notes`, accessToken, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } catch (error) {
        lastError = error;

        if (!(error instanceof CrmApiError)) {
          throw error;
        }

        if ([401, 403, 404].includes(error.status) || isLastAttempt) {
          throw error;
        }

        const message = error.message.toLowerCase();
        const likelyPayloadMismatch =
          error.status === 400 ||
          error.status === 422 ||
          error.status === 500 ||
          message.includes("note text") ||
          message.includes("body") ||
          message.includes("content") ||
          message.includes("invalid json");

        if (!likelyPayloadMismatch) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Could not create note.");
  },

  async updateTaskStatus(input: TaskPatchInput, accessToken: string) {
    return crmFetch<JsonValue>(`/api/tasks/${input.taskId}`, accessToken, {
      method: "PATCH",
      body: JSON.stringify({
        jobId: input.jobId ?? null,
        presetId: input.presetId ?? null,
        title: input.title,
        description: input.description ?? "",
        kind: input.kind ?? "task",
        status: input.status,
        scheduledFor: input.scheduledFor ?? null,
        dueAt: input.dueAt ?? null,
        appointmentAddress: input.appointmentAddress ?? "",
        assigneeIds: input.assigneeIds ?? [],
      }),
    });
  },

  async markNotificationRead(notificationId: string, accessToken: string) {
    return crmFetch<JsonValue>(`/api/notifications`, accessToken, {
      method: "PATCH",
      body: JSON.stringify({ notificationId, isRead: true }),
    });
  },

  async markAllNotificationsRead(accessToken: string) {
    return crmFetch<JsonValue>(`/api/notifications`, accessToken, {
      method: "PATCH",
      body: JSON.stringify({ markAll: true }),
    });
  },

  async initJobUpload(
    jobId: string,
    accessToken: string,
    payload: { fileName: string; contentType: string; size: number },
  ) {
    return crmFetch<UploadInitResponse>(`/api/jobs/${jobId}/uploads`, accessToken, {
      method: "POST",
      body: JSON.stringify({
        action: "create_signed_upload",
        fileName: payload.fileName,
        mimeType: payload.contentType,
      }),
    });
  },

  async finalizeJobUpload(
    jobId: string,
    accessToken: string,
    payload: { fileName: string; filePath?: string; contentType: string; documentId?: string },
  ) {
    return crmFetch<JsonValue>(`/api/jobs/${jobId}/uploads`, accessToken, {
      method: "POST",
      body: JSON.stringify({
        action: "finalize_signed_upload",
        fileName: payload.fileName,
        filePath: payload.filePath,
        fileType: payload.contentType,
      }),
    });
  },
};
