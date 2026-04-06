export type SessionStatus = "active" | "paused" | "ended";

export type KnockAction = "knock" | "door_hanger";
export type KnockOutcome = "no_answer" | "no" | "soft_set" | "inspection";

export type NightlyDelta = {
  knocks: number;
  talks: number;
  inspections: number;
  contingencies: number;
};

export const ZERO_DELTA: NightlyDelta = {
  knocks: 0,
  talks: 0,
  inspections: 0,
  contingencies: 0,
};

export function managerLike(role: string | null | undefined) {
  return (
    role === "admin" ||
    role === "manager" ||
    role === "sales_manager" ||
    role === "production_manager" ||
    role === "social_media_coordinator"
  );
}

export function getTodayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function sumDeltas(rows: NightlyDelta[]) {
  return rows.reduce(
    (acc, row) => ({
      knocks: acc.knocks + row.knocks,
      talks: acc.talks + row.talks,
      inspections: acc.inspections + row.inspections,
      contingencies: acc.contingencies + row.contingencies,
    }),
    { ...ZERO_DELTA },
  );
}

export function getEventDelta(params: {
  action: KnockAction;
  outcome?: KnockOutcome | null;
  contingent?: boolean;
}) {
  if (params.action === "door_hanger") {
    return { ...ZERO_DELTA, knocks: 1 };
  }

  const outcome = params.outcome ?? "no_answer";
  if (outcome === "no_answer" || outcome === "no") {
    return { ...ZERO_DELTA, knocks: 1 };
  }

  if (outcome === "soft_set") {
    return { ...ZERO_DELTA, knocks: 1, talks: 1 };
  }

  return {
    ...ZERO_DELTA,
    knocks: 1,
    talks: 1,
    inspections: 1,
    contingencies: params.contingent ? 1 : 0,
  };
}

export function getSessionElapsedSeconds(params: {
  startedAt: string;
  pausedAt?: string | null;
  totalPausedSeconds?: number | null;
  now?: number;
}) {
  const startMs = new Date(params.startedAt).getTime();
  const nowMs = params.now ?? Date.now();
  if (!Number.isFinite(startMs)) return 0;
  const pauseMs = params.pausedAt ? new Date(params.pausedAt).getTime() : null;
  const effectiveNow = pauseMs && Number.isFinite(pauseMs) ? pauseMs : nowMs;
  const activeMs = Math.max(0, effectiveNow - startMs);
  const pausedMs = Math.max(0, Number(params.totalPausedSeconds ?? 0) * 1000);
  return Math.max(0, Math.floor((activeMs - pausedMs) / 1000));
}
