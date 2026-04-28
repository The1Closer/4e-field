"use client";

import React, { useMemo, useState } from "react";
import type {
  DamageCause,
  ExteriorCollateralItem,
  ExteriorCollateralType,
  InspectionPhotoDraft,
  SectionCondition,
} from "@/types/inspection";
import {
  COLLATERAL_TYPES,
  COLLATERAL_GROUP_LABELS,
  collateralLabel,
  collateralMeta,
} from "@/lib/exterior-collateral-taxonomy";
import InAppCamera from "./InAppCamera";
import PhotoGrid from "./PhotoGrid";

type Props = {
  items: ExteriorCollateralItem[];
  photos: InspectionPhotoDraft[];
  manualComplete: boolean;
  onClose: () => void;
  onAddItem: (type: ExteriorCollateralType, customLabel?: string) => string; // returns itemId
  onRemoveItem: (itemId: string) => void;
  onUpdateItem: (itemId: string, patch: Partial<ExteriorCollateralItem>) => void;
  onAddPhotos: (itemId: string, files: File[], cause: DamageCause, note: string) => Promise<InspectionPhotoDraft[]>;
  onRemovePhoto: (photoId: string) => void;
  onToggleManualComplete: () => void;
};

const CONDITIONS: { value: SectionCondition; label: string; color: string }[] = [
  { value: "good", label: "Good", color: "#2f8a46" },
  { value: "damaged", label: "Damaged", color: "#c0312f" },
  { value: "missing", label: "Missing", color: "#d6b37a" },
  { value: "not_visible", label: "Not Visible", color: "#6b6f76" },
];

const DAMAGE_CAUSES: { value: DamageCause; label: string }[] = [
  { value: "none", label: "None" },
  { value: "hail", label: "Hail" },
  { value: "wind", label: "Wind" },
  { value: "other", label: "Other" },
];

export default function ExteriorCollateralDrawer({
  items,
  photos,
  manualComplete,
  onClose,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  onAddPhotos,
  onRemovePhoto,
  onToggleManualComplete,
}: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cameraItemId, setCameraItemId] = useState<string | null>(null);

  const groupedTypes = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    const filtered = q
      ? COLLATERAL_TYPES.filter((t) => t.label.toLowerCase().includes(q) || t.key.includes(q))
      : COLLATERAL_TYPES;
    const groups: Record<string, typeof COLLATERAL_TYPES> = {};
    for (const t of filtered) {
      (groups[t.group] ||= []).push(t);
    }
    return groups;
  }, [pickerSearch]);

  function pickType(type: ExteriorCollateralType) {
    const meta = collateralMeta(type);
    const id = onAddItem(type);
    if (meta.defaultDamageHint) {
      onUpdateItem(id, { damageCause: meta.defaultDamageHint });
    }
    setExpandedId(id);
    setShowPicker(false);
    setPickerSearch("");
  }

  return (
    <>
      {cameraItemId ? (
        <InAppCamera
          sectionLabel={`Collateral — ${collateralLabel(items.find((i) => i.id === cameraItemId)!.type, items.find((i) => i.id === cameraItemId)!.customTypeLabel)}`}
          captureSection="collateral_damage"
          photoCount={items.find((i) => i.id === cameraItemId)?.photoIds.length ?? 0}
          onCapture={(files, tags) => {
            const item = items.find((i) => i.id === cameraItemId);
            if (!item) return;
            void onAddPhotos(cameraItemId, files, tags.cause, tags.note).then((newPhotos) => {
              onUpdateItem(cameraItemId, { photoIds: [...item.photoIds, ...newPhotos.map((p) => p.id)] });
              setCameraItemId(null);
            });
          }}
          onClose={() => setCameraItemId(null)}
        />
      ) : null}

      <div className="section-drawer ec-drawer" role="dialog" aria-label="Exterior Collateral">
        <div className="section-drawer__header">
          <h3 className="section-drawer__title">Exterior Collateral</h3>
          <div className="section-drawer__header-actions">
            <button
              type="button"
              className={`section-complete-btn${manualComplete ? " active" : ""}`}
              onClick={onToggleManualComplete}
            >
              {manualComplete ? "✓ Done" : "Mark Done"}
            </button>
            <button type="button" className="section-drawer__close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <p className="ec-helper">
          Document everything outside the home that storms could damage. Add one item at a time.
        </p>

        <div className="ec-add-row">
          <button type="button" className="ec-add-btn" onClick={() => setShowPicker(true)}>
            + Add item
          </button>
          <span className="ec-count">{items.length} item{items.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Item cards */}
        {items.length === 0 ? (
          <p className="section-drawer__empty">No items yet — tap "+ Add item" to start.</p>
        ) : (
          <div className="ec-item-list">
            {items.map((item) => {
              const meta = collateralMeta(item.type);
              const isExpanded = expandedId === item.id;
              const itemPhotos = photos.filter((p) => item.photoIds.includes(p.id));
              return (
                <div key={item.id} className={`ec-item-card${isExpanded ? " expanded" : ""}`}>
                  <button
                    type="button"
                    className="ec-item-card__head"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  >
                    <span className="ec-item-card__icon" aria-hidden>{meta.icon}</span>
                    <span className="ec-item-card__title">{collateralLabel(item.type, item.customTypeLabel)}</span>
                    {item.condition ? (
                      <span
                        className="ec-item-card__badge"
                        style={{
                          color: CONDITIONS.find((c) => c.value === item.condition)?.color,
                          borderColor: CONDITIONS.find((c) => c.value === item.condition)?.color,
                        }}
                      >
                        {CONDITIONS.find((c) => c.value === item.condition)?.label}
                      </span>
                    ) : null}
                    <span className="ec-item-card__photo-count">
                      📷 {item.photoIds.length}
                    </span>
                    <span className="ec-item-card__chev">{isExpanded ? "▾" : "▸"}</span>
                  </button>

                  {isExpanded ? (
                    <div className="ec-item-card__body">
                      {item.type === "other" ? (
                        <input
                          className="ec-custom-input"
                          type="text"
                          placeholder="Describe item…"
                          value={item.customTypeLabel ?? ""}
                          onChange={(e) => onUpdateItem(item.id, { customTypeLabel: e.target.value })}
                        />
                      ) : null}

                      {/* Photo bar */}
                      <div className="section-drawer__photo-bar">
                        <span className="section-drawer__photo-count">
                          {item.photoIds.length} photo{item.photoIds.length !== 1 ? "s" : ""}
                        </span>
                        <div className="section-drawer__add-btns">
                          <button type="button" className="photo-add-btn" onClick={() => setCameraItemId(item.id)}>
                            📷 Camera
                          </button>
                          <label className="photo-add-btn">
                            🖼 Library
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={async (e) => {
                                const files = Array.from(e.target.files ?? []);
                                if (files.length > 0) {
                                  const newPhotos = await onAddPhotos(item.id, files, item.damageCause, item.note);
                                  onUpdateItem(item.id, { photoIds: [...item.photoIds, ...newPhotos.map((p) => p.id)] });
                                }
                                e.target.value = "";
                              }}
                              style={{ display: "none" }}
                            />
                          </label>
                        </div>
                      </div>

                      <PhotoGrid
                        photos={itemPhotos}
                        onRemove={(photoId) => {
                          onRemovePhoto(photoId);
                          onUpdateItem(item.id, { photoIds: item.photoIds.filter((id) => id !== photoId) });
                        }}
                      />

                      {/* Condition */}
                      <div className="section-drawer__condition">
                        <span className="section-drawer__field-label">Condition</span>
                        <div className="section-drawer__condition-btns">
                          {CONDITIONS.map((c) => (
                            <button
                              key={c.value}
                              type="button"
                              className="condition-btn"
                              style={{
                                borderColor: item.condition === c.value ? c.color : "var(--border)",
                                background: item.condition === c.value ? `${c.color}22` : "transparent",
                                color: item.condition === c.value ? c.color : "var(--ink-soft)",
                              }}
                              onClick={() => onUpdateItem(item.id, { condition: c.value })}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Damage cause */}
                      <div className="section-drawer__condition">
                        <span className="section-drawer__field-label">Damage cause</span>
                        <div className="section-drawer__condition-btns">
                          {DAMAGE_CAUSES.map((d) => (
                            <button
                              key={d.value}
                              type="button"
                              className={`chip${item.damageCause === d.value ? " active" : ""}`}
                              onClick={() => onUpdateItem(item.id, { damageCause: d.value })}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Note */}
                      <div className="section-drawer__note">
                        <span className="section-drawer__field-label">Notes</span>
                        <textarea
                          className="section-drawer__note-input"
                          value={item.note}
                          onChange={(e) => onUpdateItem(item.id, { note: e.target.value })}
                          placeholder="Describe location and damage…"
                          rows={2}
                        />
                      </div>

                      <button
                        type="button"
                        className="ec-item-remove-btn"
                        onClick={() => {
                          onRemoveItem(item.id);
                          if (expandedId === item.id) setExpandedId(null);
                        }}
                      >
                        Remove item
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {/* Type picker modal */}
        {showPicker ? (
          <div className="ec-picker-overlay" onClick={() => setShowPicker(false)}>
            <div className="ec-picker-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="ec-picker-header">
                <h4 className="ec-picker-title">Pick item type</h4>
                <button type="button" className="hub-footer-btn" onClick={() => setShowPicker(false)}>
                  Cancel
                </button>
              </div>
              <input
                className="ec-picker-search"
                type="text"
                placeholder="Search types…"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                autoFocus
              />
              <div className="ec-picker-grid-wrap">
                {Object.entries(groupedTypes).map(([group, types]) => (
                  <div key={group} className="ec-picker-group">
                    <div className="ec-picker-group-title">{COLLATERAL_GROUP_LABELS[group as keyof typeof COLLATERAL_GROUP_LABELS]}</div>
                    <div className="ec-picker-grid">
                      {types.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          className="ec-picker-tile"
                          onClick={() => pickType(t.key)}
                        >
                          <span className="ec-picker-tile__icon" aria-hidden>{t.icon}</span>
                          <span className="ec-picker-tile__label">{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
