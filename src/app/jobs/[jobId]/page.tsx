"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/StatusPill";
import { formatDate, jobSubtitle, jobTitle } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useAuthSession } from "@/lib/use-auth-session";
import type { JobRecord, JsonRecord } from "@/types/models";
import { crmApi } from "@/lib/crm-api";

type NoteRecord = JsonRecord & {
  id: string;
  created_at?: string;
};

type MentionableProfile = {
  id: string;
  full_name: string | null;
  role?: string | null;
  is_active?: boolean | null;
};

type MentionContext = {
  start: number;
  end: number;
  query: string;
};

type Homeowner = JsonRecord & {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

type JobRep = JsonRecord & {
  profile_id?: string | null;
  profiles?:
    | (JsonRecord & {
        id?: string | null;
        full_name?: string | null;
      })
    | Array<
        JsonRecord & {
          id?: string | null;
          full_name?: string | null;
        }
      >
    | null;
};

type PipelineStage = JsonRecord & {
  id?: number | null;
  name?: string | null;
  sort_order?: number | null;
};

function asText(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function getHomeowner(job: JobRecord | null): Homeowner | null {
  if (!job) return null;
  const related = job.homeowners as Homeowner | Homeowner[] | null | undefined;
  if (!related) return null;
  return Array.isArray(related) ? related[0] ?? null : related;
}

function getAssignedRepNames(job: JobRecord | null) {
  if (!job) return [];
  const related = job.job_reps as JobRep[] | null | undefined;
  if (!related || related.length === 0) return [];

  const names = related
    .map((entry) => {
      const profiles = entry.profiles;
      const profile = Array.isArray(profiles) ? profiles[0] ?? null : profiles;
      return asText(profile?.full_name ?? null);
    })
    .filter(Boolean);

  return Array.from(new Set(names));
}

function buildHomeownerAddress(job: JobRecord | null, homeowner: Homeowner | null) {
  const street = asText(homeowner?.address ?? null) || asText(job?.property_address);
  const city = asText(homeowner?.city ?? null) || asText(job?.city);
  const state = asText(homeowner?.state ?? null) || asText(job?.state);
  const zip = asText(homeowner?.zip ?? null) || asText(job?.zip);
  const cityStateZip = [city, state, zip].filter(Boolean).join(" ");
  const full = [street, cityStateZip].filter(Boolean).join(", ");
  return full || "No address available";
}

function getJobStatusValue(job: JobRecord | null) {
  if (!job) return "Unknown";
  const relatedStage = job.pipeline_stages as
    | PipelineStage
    | PipelineStage[]
    | null
    | undefined;
  const stage = Array.isArray(relatedStage) ? relatedStage[0] ?? null : relatedStage;
  return (
    asText(stage?.name ?? null) ||
    asText(job.stage_name) ||
    asText(job.status) ||
    asText(job.job_status) ||
    asText(job.pipeline_stage_name) ||
    "Unknown"
  );
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value: unknown) {
  const amount = toNumber(value);
  if (amount === null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatOverviewDate(value: unknown) {
  const text = asText(value);
  if (!text) return "-";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleDateString();
}

function normalizeMentionSyntax(text: string) {
  return text.replace(
    /@([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)+)/g,
    (_match, mentionWords: string) => {
      const parts = mentionWords
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      return `@${parts.join(".")}`;
    },
  );
}

function normalizeMentionHandle(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.+/g, ".");
}

function buildMentionHandle(fullName: string | null | undefined) {
  return normalizeMentionHandle(fullName) || "user";
}

function getMentionContext(value: string, caretIndex: number): MentionContext | null {
  const beforeCaret = value.slice(0, caretIndex);
  const match = beforeCaret.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/);

  if (!match) {
    return null;
  }

  return {
    start: caretIndex - match[1].length - 1,
    end: caretIndex,
    query: match[1].toLowerCase(),
  };
}

export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const jobId = params.jobId;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    user,
    loading,
    role,
    signOut,
    accessToken,
    error: authError,
    profileImageUrl,
    fullName,
  } = useAuthSession();
  const [supabaseReady, setSupabaseReady] = useState(false);

  const [job, setJob] = useState<JobRecord | null>(null);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [noteText, setNoteText] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [loadingData, setLoadingData] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mentionProfiles, setMentionProfiles] = useState<MentionableProfile[]>([]);
  const [mentionContext, setMentionContext] = useState<MentionContext | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);

  const load = async () => {
    if (!supabaseReady) return;

    const supabase = getSupabaseBrowserClient();
    setLoadingData(true);
    setError(null);

    const [jobResult, notesResult] = await Promise.all([
      supabase
        .from("jobs")
        .select(
          `
          *,
          pipeline_stages (
            id,
            name,
            sort_order
          ),
          homeowners (*),
          job_reps (
            profile_id,
            profiles (
              id,
              full_name
            )
          )
        `,
        )
        .eq("id", jobId)
        .maybeSingle(),
      supabase.from("notes").select("*").eq("job_id", jobId).order("created_at", { ascending: false }),
    ]);

    if (jobResult.error) {
      setError(jobResult.error.message);
    } else {
      setJob((jobResult.data as JobRecord | null) ?? null);
    }

    if (notesResult.error) {
      setError(notesResult.error.message);
    } else {
      setNotes((notesResult.data ?? []) as NoteRecord[]);
    }

    setLoadingData(false);
  };

  useEffect(() => {
    getSupabaseBrowserClient();
    setSupabaseReady(true);
  }, []);

  useEffect(() => {
    if (!supabaseReady || !user) return;
    load();
  }, [supabaseReady, user]);

  useEffect(() => {
    if (!supabaseReady || !user) return;
    let active = true;

    const loadMentionProfiles = async () => {
      const supabase = getSupabaseBrowserClient();
      const { data, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, role, is_active")
        .eq("is_active", true)
        .order("full_name", { ascending: true });

      if (!active) return;
      if (profilesError) {
        setMentionProfiles([]);
        return;
      }

      setMentionProfiles((data ?? []) as MentionableProfile[]);
    };

    void loadMentionProfiles();

    return () => {
      active = false;
    };
  }, [supabaseReady, user]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?redirectTo=/jobs/${jobId}`);
    }
  }, [jobId, loading, router, user]);

  const mentionSuggestions = useMemo(() => {
    if (!mentionContext) {
      return [];
    }

    const loweredQuery = mentionContext.query.trim().toLowerCase();

    return mentionProfiles
      .filter((profile) => {
        const fullName = (profile.full_name ?? "").toLowerCase();
        const handle = buildMentionHandle(profile.full_name);

        if (!loweredQuery) {
          return true;
        }

        return (
          fullName.includes(loweredQuery) ||
          handle.includes(loweredQuery) ||
          handle.startsWith(loweredQuery)
        );
      })
      .slice(0, 6);
  }, [mentionContext, mentionProfiles]);

  useEffect(() => {
    if (activeMentionIndex < mentionSuggestions.length) {
      return;
    }
    setActiveMentionIndex(0);
  }, [activeMentionIndex, mentionSuggestions.length]);

  function syncMentionContext(nextValue: string, caretIndex: number) {
    const nextContext = getMentionContext(nextValue, caretIndex);
    setMentionContext(nextContext);

    if (!nextContext) {
      setActiveMentionIndex(0);
    }
  }

  function applyMention(profile: MentionableProfile) {
    if (!mentionContext) {
      return;
    }

    const handle = buildMentionHandle(profile.full_name);
    const nextValue = `${noteText.slice(0, mentionContext.start)}@${handle} ${noteText.slice(
      mentionContext.end,
    )}`;
    const nextCaretIndex = mentionContext.start + handle.length + 2;

    setNoteText(nextValue);
    setMentionContext(null);
    setActiveMentionIndex(0);

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaretIndex, nextCaretIndex);
    });
  }

  const submitNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) {
      setError("No session token found.");
      return;
    }
    const normalizedNoteText = normalizeMentionSyntax(noteText).trim();
    if (!normalizedNoteText) return;

    setWorking(true);
    setError(null);
    setSuccess(null);

    try {
      await crmApi.createJobNote(jobId, accessToken, normalizedNoteText);
      setNoteText("");
      setMentionContext(null);
      setActiveMentionIndex(0);
      setSuccess("Note posted.");
      await load();
    } catch (noteError) {
      const message = noteError instanceof Error ? noteError.message : "Failed to create note.";
      if (message.includes("Request failed: 500") || message.includes(" 500")) {
        setError(
          `${message} CRM notes endpoint is returning server error. Check CRM env/DB note route configuration.`,
        );
      } else {
        setError(message);
      }
    } finally {
      setWorking(false);
    }
  };

  const uploadFile = async () => {
    if (!accessToken || !file) {
      setError("Choose a file first.");
      return;
    }

    setWorking(true);
    setError(null);
    setSuccess(null);

    try {
      const init = await crmApi.initJobUpload(jobId, accessToken, {
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      });

      const upload = init.upload;
      if (!upload?.filePath || !upload.token) {
        throw new Error(
          "Signed upload payload was not returned by CRM API. Confirm /api/jobs/[jobId]/uploads contract.",
        );
      }

      const supabase = getSupabaseBrowserClient();

      const signedUpload = await supabase.storage
        .from("job-files")
        .uploadToSignedUrl(upload.filePath, upload.token, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (signedUpload.error) {
        throw new Error(signedUpload.error.message);
      }

      await crmApi.finalizeJobUpload(jobId, accessToken, {
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        filePath: upload.filePath,
      });

      setFile(null);
      setSuccess("Upload completed.");
      await load();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return <main className="layout">Loading session...</main>;
  }

  if (!user) {
    return <main className="layout">Redirecting to sign in...</main>;
  }

  const homeowner = getHomeowner(job);
  const homeownerName = asText(homeowner?.name ?? null);
  const homeownerPhone = asText(homeowner?.phone ?? null);
  const homeownerEmail = asText(homeowner?.email ?? null);
  const homeownerAddress = buildHomeownerAddress(job, homeowner);
  const assignedRepNames = getAssignedRepNames(job);
  const jobStatus = getJobStatusValue(job);
  const displayTitle = homeownerName || (job ? jobTitle(job) : `Job ${jobId.slice(0, 8)}`);

  return (
    <AppShell
      role={role}
      profileName={fullName}
      profileImageUrl={profileImageUrl}
      onSignOut={signOut}
      debug={{
        userId: user.id,
        role,
        accessToken,
        authError,
      }}
    >
      <section className="panel">
        <div className="row">
          <h2 style={{ margin: 0 }}>{displayTitle}</h2>
          <Link href="/jobs" className="tab">
            Back to Jobs
          </Link>
        </div>
        {job ? <p className="muted">{homeownerAddress || jobSubtitle(job)}</p> : null}
        {loadingData ? <p className="hint">Loading job...</p> : null}
      </section>

      <section className="panel">
        <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
          <div>
            <p
              className="hint"
              style={{
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "var(--brand)",
                fontWeight: 700,
                fontSize: "0.74rem",
              }}
            >
              Overview
            </p>
            <h3 style={{ margin: "4px 0 0 0" }}>Homeowner, claim, and production snapshot</h3>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="hint" style={{ margin: 0 }}>
              Status
            </span>
            <StatusPill value={jobStatus} />
          </div>
        </div>
        <div
          className="grid"
          style={{
            marginTop: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Homeowner
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {homeownerName || "No homeowner name on this job"}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Phone
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {homeownerPhone ? <a href={`tel:${homeownerPhone}`}>{homeownerPhone}</a> : "No phone"}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Email
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {homeownerEmail ? <a href={`mailto:${homeownerEmail}`}>{homeownerEmail}</a> : "No email"}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Address
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>{homeownerAddress}</p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Claim Number
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {asText(job?.claim_number) || "-"}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Insurance Carrier
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {asText(job?.insurance_carrier) || "-"}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Assigned Team
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {assignedRepNames.length > 0 ? assignedRepNames.join(", ") : "No one assigned"}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Deductible
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>{formatMoney(job?.deductible)}</p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Adjuster Name
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {asText(job?.adjuster_name) || "-"}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Adjuster Phone
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {asText(job?.adjuster_phone) || "-"}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Adjuster Email
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {asText(job?.adjuster_email) || "-"}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Type of Loss
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {asText(job?.type_of_loss) || "-"}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Date of Loss
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {formatOverviewDate(job?.date_of_loss)}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Install Date
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {formatOverviewDate(job?.install_date)}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Contract Signed
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {formatOverviewDate(job?.contract_signed_date)}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Shingle Name
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {asText(job?.shingle_name) || "-"}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Contract Amount
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>{formatMoney(job?.contract_amount)}</p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Supplemented Amount
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {formatMoney(job?.supplemented_amount)}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Deposit Collected
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {formatMoney(job?.deposit_collected)}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Remaining Balance
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {formatMoney(job?.remaining_balance)}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Created
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {asText(job?.created_at) ? formatDate(String(job?.created_at)) : "-"}
            </p>
          </article>
          <article className="job-card">
            <p className="hint" style={{ marginTop: 0 }}>
              Last Updated
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              {asText(job?.updated_at) ? formatDate(String(job?.updated_at)) : "-"}
            </p>
          </article>
        </div>
      </section>

      <section className="panel">
        <h3>Notes</h3>
        <form onSubmit={submitNote} className="stack">
          <div className="mention-wrap">
            <textarea
              ref={textareaRef}
              value={noteText}
              onChange={(event) => {
                const nextValue = event.target.value;
                setNoteText(nextValue);
                syncMentionContext(nextValue, event.target.selectionStart);
              }}
              onClick={(event) => {
                syncMentionContext(event.currentTarget.value, event.currentTarget.selectionStart);
              }}
              onKeyUp={(event) => {
                syncMentionContext(event.currentTarget.value, event.currentTarget.selectionStart);
              }}
              onKeyDown={(event) => {
                if (!mentionContext || mentionSuggestions.length === 0) {
                  return;
                }

                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveMentionIndex((current) => (current + 1) % mentionSuggestions.length);
                  return;
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveMentionIndex((current) =>
                    current === 0 ? mentionSuggestions.length - 1 : current - 1,
                  );
                  return;
                }

                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  applyMention(mentionSuggestions[activeMentionIndex]);
                  return;
                }

                if (event.key === "Escape") {
                  setMentionContext(null);
                  setActiveMentionIndex(0);
                }
              }}
              rows={4}
              placeholder="Add context for this job... Type @ to tag a teammate."
            />

            {mentionContext && mentionSuggestions.length > 0 ? (
              <div className="mention-menu">
                <div className="mention-heading">Mention someone</div>
                {mentionSuggestions.map((profile, index) => {
                  const handle = buildMentionHandle(profile.full_name);
                  const isActive = index === activeMentionIndex;

                  return (
                    <button
                      key={profile.id}
                      type="button"
                      className={isActive ? "mention-item mention-item-active" : "mention-item"}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        applyMention(profile);
                      }}
                    >
                      <span>{profile.full_name || "Unnamed user"}</span>
                      <span className="hint">@{handle}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="row">
            <button type="submit" disabled={working || !noteText.trim()}>
              {working ? "Posting..." : "Post note"}
            </button>
            <span className="hint">Write path: CRM `/api/jobs/[jobId]/notes`</span>
          </div>
          <p className="hint">Use `@First Last` or `@first.last` to notify that user in CRM.</p>
        </form>
        <div className="grid" style={{ marginTop: 10 }}>
          {notes.map((note) => (
            <article key={note.id} className="job-card">
              <p style={{ marginTop: 0 }}>{String(note.content ?? note.body ?? note.note ?? "Note")}</p>
              <p className="hint">{formatDate(note.created_at)}</p>
            </article>
          ))}
          {notes.length === 0 ? <p className="hint">No notes found.</p> : null}
        </div>
      </section>

      <section className="panel">
        <h3>Upload File</h3>
        <div className="stack">
          <input
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            accept="image/*,.pdf,.doc,.docx,.txt"
          />
          <div className="row">
            <button onClick={uploadFile} disabled={working || !file}>
              {working ? "Uploading..." : "Upload"}
            </button>
            <span className="hint">Write path: CRM `/api/jobs/[jobId]/uploads`</span>
          </div>
        </div>
      </section>

      {error ? <p className="error">{error}</p> : null}
      {success ? <p>{success}</p> : null}
    </AppShell>
  );
}
