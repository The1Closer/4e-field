import type { JobRecord, NotificationRecord, TaskRecord } from "@/types/models";

const asText = (value: unknown): string => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return "";
};

export function jobTitle(job: JobRecord): string {
  return (
    asText(job.job_name) ||
    asText(job.name) ||
    asText(job.claim_number) ||
    `Job ${job.id.slice(0, 8)}`
  );
}

export function jobSubtitle(job: JobRecord): string {
  return (
    asText(job.property_address) ||
    asText(job.address) ||
    asText(job.city) ||
    asText(job.state) ||
    asText(job.zip) ||
    "No location details"
  );
}

export function taskLabel(task: TaskRecord): string {
  return asText(task.title) || asText(task.kind) || `Task ${task.id.slice(0, 8)}`;
}

export function notificationText(item: NotificationRecord): string {
  return asText(item.title) || asText(item.message) || asText(item.body) || "Notification";
}

export function formatDate(value?: string | null): string {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString();
}
