"use client";

import React, { useState, useMemo } from "react";
import type {
  InspectionPhotoDraft,
  ComponentPresenceDraft,
  ComponentPresenceItem,
  ComponentStatus,
  ComponentCondition,
  RoofDamageMetrics,
  TestSquare,
  DamageSlope,
  DamageCause,
  CaptureSection,
} from "@/types/inspection";
import { migrateComponentItem } from "@/types/inspection";
import {
  ROOF_COMPONENTS,
  ROOF_COMPONENT_GROUP_LABELS,
  ROOF_COMPONENT_GROUP_ORDER,
  QUICK_ADD_KEYS,
  groupedComponents,
  ROOF_COMPONENT_BY_KEY,
} from "@/lib/roof-components";
import InAppCamera from "./InAppCamera";
import PhotoGrid from "./PhotoGrid";

type RoofCardKey = "overview" | "damage" | "components";

type Props = {
  photos: InspectionPhotoDraft[];
  shingleLengthInches: string;
  shingleWidthInches: string;
  dripEdgePresent: "yes" | "no" | "na" | null;
  estimatedRoofAgeYears: number | null;
  layerCount: "1" | "2" | "3+" | null;
  layerPhotoId: string | null;
  componentPresence: ComponentPresenceDraft;
  roofDamage: RoofDamageMetrics;
  onClose: () => void;
  onAddPhotos: (files: File[], tags: { cause: DamageCause; slope: DamageSlope | ""; note: string }, captureSection: CaptureSection) => Promise<InspectionPhotoDraft[]>;
  onRemovePhoto: (photoId: string) => void;
  onShingleLength: (v: string) => void;
  onShingleWidth: (v: string) => void;
  onDripEdge: (v: "yes" | "no" | "na" | null) => void;
  onRoofAge: (v: number | null) => void;
  onLayerCount: (v: "1" | "2" | "3+" | null) => void;
  onLayerPhoto: (photoId: string | null) => void;
  onComponentChange: (key: string, patch: Partial<ComponentPresenceItem>) => void;
  onRoofDamage: (patch: Partial<RoofDamageMetrics>) => void;
};

type CameraTarget = { section: CaptureSection; cause: DamageCause; slope: DamageSlope | ""; componentKey?: string } | null;

const STATUS_LABELS: Record<ComponentStatus, string> = {
  present: "Present",
  absent: "Absent",
  unknown: "Unknown",
};

const CONDITION_LABELS: Record<ComponentCondition, { label: string; color: string }> = {
  good: { label: "Good", color: "#2f8a46" },
  fair: { label: "Fair", color: "#d6a040" },
  poor: { label: "Poor", color: "#c0392b" },
};

export default function RoofSubHub({
  photos,
  shingleLengthInches,
  shingleWidthInches,
  dripEdgePresent,
  estimatedRoofAgeYears,
  layerCount,
  componentPresence,
  roofDamage,
  onClose,
  onAddPhotos,
  onRemovePhoto,
  onShingleLength,
  onShingleWidth,
  onDripEdge,
  onRoofAge,
  onLayerCount,
  onComponentChange,
  onRoofDamage,
}: Props) {
  const [activeCard, setActiveCard] = useState<RoofCardKey | null>(null);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget>(null);

  // Components card state
  const [compSearch, setCompSearch] = useState("");
  const [showOnlyNoted, setShowOnlyNoted] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [qtyErrors, setQtyErrors] = useState<Record<string, string>>({});

  const overviewPhotos = photos.filter((p) => p.captureSection === "roof_overview");
  const damagePhotos = photos.filter((p) => p.captureSection === "roof_damage" && !p.testSquareId);

  function getItem(key: string): ComponentPresenceItem {
    const raw = componentPresence[key];
    if (!raw) return { status: "unknown", quantity: null, condition: null, note: "" };
    if ("status" in raw) return raw as ComponentPresenceItem;
    return migrateComponentItem(raw as Record<string, unknown>);
  }

  function openCamera(section: CaptureSection, cause: DamageCause = "none", slope: DamageSlope | "" = "", componentKey?: string) {
    setCameraTarget({ section, cause, slope, componentKey });
  }

  function addTestSquare() {
    const ts: TestSquare = {
      id: crypto.randomUUID(),
      slope: "",
      photoId: null,
      hitCount: null,
      note: "",
      createdAt: new Date().toISOString(),
    };
    onRoofDamage({ testSquares: [...roofDamage.testSquares, ts] });
  }

  function updateTestSquare(id: string, patch: Partial<TestSquare>) {
    onRoofDamage({
      testSquares: roofDamage.testSquares.map((ts) => (ts.id === id ? { ...ts, ...patch } : ts)),
    });
  }

  function removeTestSquare(id: string) {
    onRoofDamage({ testSquares: roofDamage.testSquares.filter((ts) => ts.id !== id) });
  }

  function toggleGroup(group: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function handleQtyChange(key: string, raw: string) {
    const def = ROOF_COMPONENT_BY_KEY.get(key);
    const max = def?.qtyMax ?? 999;
    if (raw === "") {
      setQtyErrors((e) => ({ ...e, [key]: "" }));
      onComponentChange(key, { quantity: null });
      return;
    }
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setQtyErrors((e) => ({ ...e, [key]: "Must be 0 or more" }));
      return;
    }
    if (parsed > max) {
      setQtyErrors((e) => ({ ...e, [key]: `Max ${max}` }));
      return;
    }
    setQtyErrors((e) => ({ ...e, [key]: "" }));
    onComponentChange(key, { quantity: parsed });
  }

  // How many components are "noted" (status !== unknown) total
  const notedCount = ROOF_COMPONENTS.filter((c) => {
    const item = getItem(c.key);
    return item.status !== "unknown";
  }).length;

  const grouped = useMemo(() => {
    const search = compSearch.toLowerCase();
    return groupedComponents().map(({ group, label, items }) => ({
      group,
      label,
      items: items.filter((c) => {
        if (showOnlyNoted && getItem(c.key).status === "unknown") return false;
        if (search && !c.label.toLowerCase().includes(search) && !c.helper?.toLowerCase().includes(search)) return false;
        return true;
      }),
    })).filter((g) => g.items.length > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compSearch, showOnlyNoted, componentPresence]);

  // Effective open groups — auto-open groups that have noted items (or any match during search)
  const effectiveOpen = useMemo(() => {
    return new Set([
      ...Array.from(openGroups),
      ...(compSearch
        ? grouped.map((g) => g.group)
        : ROOF_COMPONENT_GROUP_ORDER.filter((grp) =>
            ROOF_COMPONENTS.some((c) => c.group === grp && getItem(c.key).status !== "unknown")
          )),
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openGroups, grouped, compSearch, componentPresence]);

  const CARDS: { key: RoofCardKey; label: string; emoji: string; summary: string }[] = [
    {
      key: "overview",
      label: "Overview",
      emoji: "🏠",
      summary: `${overviewPhotos.length} photo${overviewPhotos.length !== 1 ? "s" : ""} · ${shingleLengthInches && shingleWidthInches ? `${shingleLengthInches}"×${shingleWidthInches}"` : "dims needed"}`,
    },
    {
      key: "damage",
      label: "Damage",
      emoji: "⚠️",
      summary: `${damagePhotos.length} photo${damagePhotos.length !== 1 ? "s" : ""} · ${roofDamage.testSquares.length} test square${roofDamage.testSquares.length !== 1 ? "s" : ""}`,
    },
    {
      key: "components",
      label: "Components & Dims",
      emoji: "🔧",
      summary: `${notedCount} of ${ROOF_COMPONENTS.length} noted`,
    },
  ];

  return (
    <>
      {cameraTarget ? (
        <InAppCamera
          sectionLabel="Roof"
          captureSection={cameraTarget.section}
          photoCount={photos.filter((p) => p.captureSection === cameraTarget.section).length}
          suggestedCount={cameraTarget.section === "roof_overview" ? 8 : cameraTarget.section === "roof_damage" ? 3 : undefined}
          initialCause={cameraTarget.cause}
          initialSlope={cameraTarget.slope}
          onCapture={async (files, tags) => {
            const added = await onAddPhotos(files, tags, cameraTarget.section);
            // If opened from a component row, tag the first photo with component key
            if (cameraTarget.componentKey && added[0]) {
              // The photo's componentTag is set in the parent; nothing extra needed here
            }
            setCameraTarget(null);
          }}
          onClose={() => setCameraTarget(null)}
        />
      ) : null}

      <div className="section-drawer" role="dialog" aria-label="Roof inspection">
        <div className="section-drawer__header">
          <h3 className="section-drawer__title">Roof</h3>
          <button type="button" className="section-drawer__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Card selector */}
        {activeCard === null ? (
          <div className="roof-cards">
            {CARDS.map((card) => (
              <button
                key={card.key}
                type="button"
                className="roof-card"
                onClick={() => setActiveCard(card.key)}
              >
                <span className="roof-card__emoji">{card.emoji}</span>
                <span className="roof-card__label">{card.label}</span>
                <span className="roof-card__summary">{card.summary}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="roof-card-detail">
            <button type="button" className="roof-back-btn" onClick={() => setActiveCard(null)}>
              ← Back to Roof
            </button>

            {/* ── OVERVIEW ─────────────────────────────────────────────── */}
            {activeCard === "overview" ? (
              <div className="stack">
                <h4 className="roof-section-title">Overview Photos</h4>
                <div className="section-drawer__photo-bar">
                  <span className="section-drawer__photo-count">
                    {overviewPhotos.length} / 8 suggested
                    {overviewPhotos.length < 8 ? <span className="section-drawer__photo-warn"> ⚠</span> : null}
                  </span>
                  <div className="section-drawer__add-btns">
                    <button type="button" className="photo-add-btn" onClick={() => openCamera("roof_overview", "none", "")}>
                      📷 Camera
                    </button>
                    <label className="photo-add-btn">
                      🖼 Library
                      <input
                        type="file" accept="image/*" multiple
                        onChange={async (e) => {
                          const files = Array.from(e.target.files ?? []);
                          if (files.length > 0) await onAddPhotos(files, { cause: "none", slope: "", note: "" }, "roof_overview");
                          e.target.value = "";
                        }}
                        style={{ display: "none" }}
                      />
                    </label>
                  </div>
                </div>
                <PhotoGrid photos={overviewPhotos} onRemove={onRemovePhoto} />

                <h4 className="roof-section-title">Drip Edge</h4>
                <div className="chip-row">
                  {(["yes", "no", "na"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`chip${dripEdgePresent === v ? " active" : ""}`}
                      onClick={() => onDripEdge(v)}
                    >
                      {v === "yes" ? "Yes" : v === "no" ? "No" : "N/A"}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* ── DAMAGE ───────────────────────────────────────────────── */}
            {activeCard === "damage" ? (
              <div className="stack">
                <h4 className="roof-section-title">Damage Photos</h4>
                <div className="section-drawer__photo-bar">
                  <span className="section-drawer__photo-count">
                    {damagePhotos.length} / 3 suggested
                    {damagePhotos.length < 3 ? <span className="section-drawer__photo-warn"> ⚠</span> : null}
                  </span>
                  <div className="section-drawer__add-btns">
                    <button type="button" className="photo-add-btn" onClick={() => openCamera("roof_damage", "hail", "")}>
                      📷 Camera
                    </button>
                    <label className="photo-add-btn">
                      🖼 Library
                      <input
                        type="file" accept="image/*" multiple
                        onChange={async (e) => {
                          const files = Array.from(e.target.files ?? []);
                          if (files.length > 0) await onAddPhotos(files, { cause: "hail", slope: "", note: "" }, "roof_damage");
                          e.target.value = "";
                        }}
                        style={{ display: "none" }}
                      />
                    </label>
                  </div>
                </div>
                <PhotoGrid photos={damagePhotos} onRemove={onRemovePhoto} />

                <h4 className="roof-section-title">Damage Metrics</h4>
                <div className="form-row">
                  <label className="form-field">
                    <span>Wind Damaged Shingles</span>
                    <input
                      type="number"
                      min={0}
                      value={roofDamage.windShingleCount ?? ""}
                      onChange={(e) => onRoofDamage({ windShingleCount: e.target.value === "" ? null : Number(e.target.value) })}
                      placeholder="Count"
                    />
                  </label>
                  <label className="form-field">
                    <span>Total Hail Count</span>
                    <input
                      type="number"
                      min={0}
                      value={roofDamage.hailCount ?? ""}
                      onChange={(e) => onRoofDamage({ hailCount: e.target.value === "" ? null : Number(e.target.value) })}
                      placeholder="Count"
                    />
                  </label>
                </div>

                <h4 className="roof-section-title">Slopes Affected</h4>
                <div className="chip-row">
                  {(["front", "rear", "left", "right"] as const).map((s) => {
                    const active = roofDamage.slopesAffected.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        className={`chip${active ? " active" : ""}`}
                        onClick={() =>
                          onRoofDamage({
                            slopesAffected: active
                              ? roofDamage.slopesAffected.filter((x) => x !== s)
                              : [...roofDamage.slopesAffected, s],
                          })
                        }
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    );
                  })}
                </div>

                <h4 className="roof-section-title">Test Squares</h4>
                {roofDamage.testSquares.map((ts) => (
                  <TestSquareCard
                    key={ts.id}
                    testSquare={ts}
                    photos={photos}
                    onUpdate={(patch) => updateTestSquare(ts.id, patch)}
                    onRemove={() => removeTestSquare(ts.id)}
                    onAddPhoto={() => openCamera("roof_damage_test_square", "hail", ts.slope || "")}
                    onAddPhotoFromLibrary={async (files) => {
                      const added = await onAddPhotos(files, { cause: "hail", slope: ts.slope || "", note: "" }, "roof_damage_test_square");
                      const newPhoto = added[0];
                      if (newPhoto) updateTestSquare(ts.id, { photoId: newPhoto.id });
                    }}
                  />
                ))}
                <button type="button" className="secondary" onClick={addTestSquare}>
                  + Add Test Square
                </button>
              </div>
            ) : null}

            {/* ── COMPONENTS & DIMS ────────────────────────────────────── */}
            {activeCard === "components" ? (
              <div className="stack">
                {/* Roof Details */}
                <h4 className="roof-section-title">Roof Details</h4>
                <div className="form-row">
                  <label className="form-field">
                    <span>Estimated Roof Age (yrs)</span>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={estimatedRoofAgeYears ?? ""}
                      onChange={(e) => onRoofAge(e.target.value === "" ? null : Number(e.target.value))}
                      placeholder="e.g. 12"
                    />
                  </label>
                  <label className="form-field">
                    <span>Layer Count</span>
                    <div className="chip-row">
                      {(["1", "2", "3+"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={`chip${layerCount === v ? " active" : ""}`}
                          onClick={() => onLayerCount(v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </label>
                </div>

                <h4 className="roof-section-title">Shingle Dimensions</h4>
                <div className="form-row">
                  <label className="form-field">
                    <span>Length (in)</span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={shingleLengthInches}
                      onChange={(e) => onShingleLength(e.target.value)}
                      placeholder="e.g. 36"
                    />
                  </label>
                  <label className="form-field">
                    <span>Width (in)</span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={shingleWidthInches}
                      onChange={(e) => onShingleWidth(e.target.value)}
                      placeholder="e.g. 12"
                    />
                  </label>
                </div>

                {/* Components section */}
                <div className="comp-header-row">
                  <h4 className="roof-section-title" style={{ margin: 0 }}>Components</h4>
                  <span className="comp-noted-badge">{notedCount} of {ROOF_COMPONENTS.length} noted</span>
                </div>

                {/* Quick-add chips */}
                <div className="comp-quickadd">
                  <span className="comp-quickadd-label">Quick-add</span>
                  <div className="chip-row" style={{ flexWrap: "wrap" }}>
                    {QUICK_ADD_KEYS.map((key) => {
                      const def = ROOF_COMPONENT_BY_KEY.get(key);
                      if (!def) return null;
                      const item = getItem(key);
                      const isPresent = item.status === "present";
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`chip chip--sm${isPresent ? " active" : ""}`}
                          onClick={() => {
                            onComponentChange(key, { status: isPresent ? "unknown" : "present" });
                            // Auto-open the group
                            setOpenGroups((prev) => new Set([...prev, def.group]));
                          }}
                        >
                          {def.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Search + filter bar */}
                <div className="comp-search-row">
                  <input
                    type="search"
                    className="comp-search-input"
                    value={compSearch}
                    onChange={(e) => setCompSearch(e.target.value)}
                    placeholder="Search components…"
                  />
                  <button
                    type="button"
                    className={`chip chip--sm${showOnlyNoted ? " active" : ""}`}
                    onClick={() => setShowOnlyNoted((v) => !v)}
                    style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                  >
                    Noted only
                  </button>
                </div>

                {/* Accordion groups */}
                {grouped.length === 0 ? (
                  <p className="section-drawer__empty">No components match your filter.</p>
                ) : (
                  grouped.map(({ group, label, items }) => {
                    const groupNoted = items.filter((c) => getItem(c.key).status === "present").length;
                    const groupNeeds = items.filter((c) => getItem(c.key).condition === "poor").length;
                    const isOpen = effectiveOpen.has(group);

                    return (
                      <div key={group} className="comp-group">
                        <button
                          type="button"
                          className="comp-group-header"
                          onClick={() => toggleGroup(group)}
                          aria-expanded={isOpen}
                        >
                          <span className="comp-group-accent" />
                          <span className="comp-group-label">{label}</span>
                          <span className="comp-group-meta">
                            {groupNoted > 0 ? `${groupNoted} present` : ""}
                            {groupNeeds > 0 ? ` · ${groupNeeds} poor` : ""}
                          </span>
                          <span className="comp-group-chevron">{isOpen ? "▲" : "▼"}</span>
                        </button>

                        {isOpen ? (
                          <div className="comp-group-body">
                            {items.map((def) => {
                              const item = getItem(def.key);
                              const compPhotos = photos.filter(
                                (p) => p.captureSection === "roof_overview" && p.componentTag === def.key
                              );
                              const err = qtyErrors[def.key];

                              return (
                                <div
                                  key={def.key}
                                  className={`comp-row${item.status === "present" ? " comp-row--present" : item.status === "absent" ? " comp-row--absent" : ""}`}
                                >
                                  {/* Name + helper */}
                                  <div className="comp-row-info">
                                    <span className="comp-row-name">{def.label}</span>
                                    {def.helper ? <span className="comp-row-helper">{def.helper}</span> : null}
                                  </div>

                                  {/* 3-state status chips */}
                                  <div className="comp-row-chips">
                                    {(["present", "absent", "unknown"] as ComponentStatus[]).map((s) => (
                                      <button
                                        key={s}
                                        type="button"
                                        className={`chip chip--xs${item.status === s ? " active" : ""}`}
                                        style={
                                          item.status === s && s === "present"
                                            ? { borderColor: "#2f8a46", background: "#2f8a4622", color: "#2f8a46" }
                                            : item.status === s && s === "absent"
                                            ? { borderColor: "#c0392b", background: "#c0392b22", color: "#c0392b" }
                                            : {}
                                        }
                                        onClick={() => onComponentChange(def.key, { status: s })}
                                      >
                                        {STATUS_LABELS[s]}
                                      </button>
                                    ))}
                                  </div>

                                  {/* Expanded detail when Present */}
                                  {item.status === "present" ? (
                                    <div className="comp-row-detail">
                                      {/* Qty */}
                                      {def.hasQty ? (
                                        <div className="comp-detail-field">
                                          <label className="comp-detail-label">
                                            Qty {def.qtyUnit ? `(${def.qtyUnit})` : ""}
                                          </label>
                                          <input
                                            type="number"
                                            min={0}
                                            max={def.qtyMax ?? 999}
                                            className={`comp-qty-input${err ? " comp-qty-input--error" : ""}`}
                                            value={item.quantity ?? ""}
                                            onChange={(e) => handleQtyChange(def.key, e.target.value)}
                                            placeholder="0"
                                          />
                                          {err ? <span className="comp-qty-error">{err}</span> : null}
                                        </div>
                                      ) : null}

                                      {/* Condition */}
                                      <div className="comp-detail-field">
                                        <span className="comp-detail-label">Condition</span>
                                        <div className="chip-row">
                                          {(["good", "fair", "poor"] as ComponentCondition[]).map((c) => {
                                            const meta = CONDITION_LABELS[c];
                                            return (
                                              <button
                                                key={c}
                                                type="button"
                                                className="chip chip--xs"
                                                style={{
                                                  borderColor: item.condition === c ? meta.color : undefined,
                                                  background: item.condition === c ? `${meta.color}22` : "transparent",
                                                  color: item.condition === c ? meta.color : undefined,
                                                }}
                                                onClick={() =>
                                                  onComponentChange(def.key, {
                                                    condition: item.condition === c ? null : c,
                                                  })
                                                }
                                              >
                                                {meta.label}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>

                                      {/* Note */}
                                      <div className="comp-detail-field">
                                        <label className="comp-detail-label">Note</label>
                                        <input
                                          type="text"
                                          className="comp-note-input"
                                          value={item.note ?? ""}
                                          onChange={(e) => onComponentChange(def.key, { note: e.target.value })}
                                          placeholder="Optional detail…"
                                        />
                                      </div>

                                      {/* Per-component photos */}
                                      <div className="comp-detail-field">
                                        <span className="comp-detail-label">Photos ({compPhotos.length})</span>
                                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                          {compPhotos.map((ph) => (
                                            <div key={ph.id} className="section-drawer__photo-thumb" style={{ width: 64, height: 64 }}>
                                              {/* eslint-disable-next-line @next/next/no-img-element */}
                                              <img src={URL.createObjectURL(ph.file)} alt="" className="section-drawer__photo-img" />
                                              <button
                                                type="button"
                                                className="section-drawer__photo-remove"
                                                onClick={() => onRemovePhoto(ph.id)}
                                                aria-label="Remove photo"
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          ))}
                                          <button
                                            type="button"
                                            className="comp-add-photo-btn"
                                            onClick={() => openCamera("roof_overview", "none", "", def.key)}
                                            title="Add photo for this component"
                                          >
                                            + Photo
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

function TestSquareCard({
  testSquare,
  photos,
  onUpdate,
  onRemove,
  onAddPhoto,
  onAddPhotoFromLibrary,
}: {
  testSquare: TestSquare;
  photos: InspectionPhotoDraft[];
  onUpdate: (patch: Partial<TestSquare>) => void;
  onRemove: () => void;
  onAddPhoto: () => void;
  onAddPhotoFromLibrary: (files: File[]) => void;
}) {
  const linkedPhoto = photos.find((p) => p.id === testSquare.photoId);

  return (
    <div className="test-square-card">
      <div className="test-square-card__header">
        <span className="test-square-card__title">Test Square</span>
        <button type="button" className="test-square-card__remove" onClick={onRemove}>
          ✕
        </button>
      </div>

      <div className="chip-row">
        {(["front", "rear", "left", "right"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`chip chip--sm${testSquare.slope === s ? " active" : ""}`}
            onClick={() => onUpdate({ slope: s })}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="test-square-card__photo-row">
        {linkedPhoto ? (
          <div className="test-square-card__thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={URL.createObjectURL(linkedPhoto.file)} alt="Test square" className="section-drawer__photo-img" />
          </div>
        ) : (
          <div className="test-square-card__no-photo">
            <button type="button" className="photo-add-btn" onClick={onAddPhoto}>📷</button>
            <label className="photo-add-btn">
              🖼
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) onAddPhotoFromLibrary(files);
                  e.target.value = "";
                }}
                style={{ display: "none" }}
              />
            </label>
          </div>
        )}
        <label className="form-field" style={{ flex: 1 }}>
          <span>Hit Count</span>
          <input
            type="number"
            min={0}
            value={testSquare.hitCount ?? ""}
            onChange={(e) => onUpdate({ hitCount: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="# hail strikes"
          />
        </label>
      </div>

      <input
        type="text"
        className="test-square-card__note"
        value={testSquare.note}
        onChange={(e) => onUpdate({ note: e.target.value })}
        placeholder="Optional note…"
      />
    </div>
  );
}
