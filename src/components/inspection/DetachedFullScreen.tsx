"use client";

import React, { useState } from "react";
import type {
  CaptureSection,
  DamageCause,
  DamageSlope,
  DetachedBuilding,
  ExteriorCollateralItem,
  ExteriorCollateralType,
  HubSectionKey,
  InspectionPhotoDraft,
  PersonalPropertyRoom,
  PersonalPropertyRoomKey,
  SectionCondition,
  SectionState,
} from "@/types/inspection";
import DetachedHub, { hotspotKeysForVariant } from "./DetachedHub";
import SectionDrawer from "./SectionDrawer";
import PersonalPropertyDrawer from "./PersonalPropertyDrawer";
import ExteriorCollateralDrawer from "./ExteriorCollateralDrawer";
import type { HotspotState } from "./StructureHotspot";

const SECTION_LABELS: Record<HubSectionKey, string> = {
  roof: "Roof",
  perimeter: "Perimeter",
  siding: "Siding",
  gutters: "Gutters",
  windows: "Windows",
  interior: "Interior",
  attic: "Attic",
  personal_property: "Property",
  exterior_collateral: "Collateral",
  detached: "Detached",
};

type Props = {
  building: DetachedBuilding;
  photos: InspectionPhotoDraft[];
  onClose: () => void;
  onUpdate: (patch: Partial<DetachedBuilding>) => void;
  onAddPhotos: (
    files: File[],
    tags: { cause: DamageCause; slope: DamageSlope | ""; note: string },
    captureSection: CaptureSection,
  ) => Promise<InspectionPhotoDraft[]>;
  onRemovePhoto: (photoId: string) => void;
};

function defaultSectionState(): SectionState {
  return { condition: null, note: "", manualComplete: false, manualIncomplete: false };
}

function computeState(
  building: DetachedBuilding,
  key: HubSectionKey,
  photos: InspectionPhotoDraft[],
): HotspotState {
  if (key === "personal_property") {
    const rooms = building.personalProperty ?? [];
    if (rooms.length === 0) return "untouched";
    const documented = rooms.some((r) => r.photoIds.length > 0 || r.note.trim());
    return documented ? "in_progress" : "untouched";
  }
  if (key === "exterior_collateral") {
    const items = building.exteriorCollateral ?? [];
    return items.length > 0 ? "in_progress" : "untouched";
  }
  const state = building.sections?.[key];
  if (state?.manualComplete) return "override_complete";
  const photoCount = photos.filter((p) => (building.photoIds ?? []).includes(p.id) && p.captureSection === key).length;
  if (state?.condition) return state.condition === "good" || photoCount >= 1 ? "complete" : "in_progress";
  return photoCount > 0 ? "in_progress" : "untouched";
}

export default function DetachedFullScreen({
  building,
  photos,
  onClose,
  onUpdate,
  onAddPhotos,
  onRemovePhoto,
}: Props) {
  const [activeSection, setActiveSection] = useState<HubSectionKey | null>(null);

  const buildingPhotos = photos.filter((p) => (building.photoIds ?? []).includes(p.id));
  const sections = building.sections ?? {};
  const hotspotKeys = hotspotKeysForVariant(building.label);
  const hotspotInfo = hotspotKeys.map((k) => ({
    key: k,
    label: SECTION_LABELS[k] ?? k,
    state: computeState(building, k, photos),
  }));

  function updateSection(key: HubSectionKey, patch: Partial<SectionState>) {
    onUpdate({
      sections: {
        ...sections,
        [key]: { ...defaultSectionState(), ...sections[key], ...patch },
      },
    });
  }

  async function addPhotosForSection(
    files: File[],
    tags: { cause: DamageCause; slope: DamageSlope | ""; note: string },
    captureSection: CaptureSection,
  ): Promise<InspectionPhotoDraft[]> {
    const newPhotos = await onAddPhotos(files, tags, captureSection);
    onUpdate({
      photoIds: [...(building.photoIds ?? []), ...newPhotos.map((p) => p.id)],
    });
    return newPhotos;
  }

  const titleLabel =
    building.label === "other" && building.customLabel
      ? building.customLabel
      : building.label.charAt(0).toUpperCase() + building.label.slice(1);

  return (
    <div className="detached-fullscreen" role="dialog" aria-label={`${titleLabel} hub`}>
      <div className="detached-fullscreen__header">
        <button type="button" className="detached-fullscreen__back" onClick={onClose}>
          ← Back to Inspection
        </button>
        <div className="detached-fullscreen__title-wrap">
          <span className="detached-fullscreen__type">{building.label.toUpperCase()}</span>
          <h2 className="detached-fullscreen__title">{titleLabel}</h2>
        </div>
        <button
          type="button"
          className={`section-complete-btn${building.completedAt ? " active" : ""}`}
          onClick={() => onUpdate({ completedAt: building.completedAt ? null : new Date().toISOString() })}
        >
          {building.completedAt ? "✓ Done" : "Mark Done"}
        </button>
      </div>

      <div className="detached-fullscreen__body">
        <DetachedHub
          variant={building.label}
          hotspots={hotspotInfo}
          onTap={(key) => setActiveSection(key)}
        />

        {/* Drawer routing */}
        {activeSection === "personal_property" ? (
          <div className="hub-drawer-overlay">
            <PersonalPropertyDrawer
              rooms={building.personalProperty ?? []}
              photos={photos}
              manualComplete={sections.personal_property?.manualComplete ?? false}
              onClose={() => setActiveSection(null)}
              onAddRoom={(key, customLabel) => {
                const id = crypto.randomUUID();
                const room: PersonalPropertyRoom = { id, key, customLabel, damageCause: "none", note: "", photoIds: [] };
                onUpdate({ personalProperty: [...(building.personalProperty ?? []), room] });
                return id;
              }}
              onRemoveRoom={(roomId) => onUpdate({ personalProperty: (building.personalProperty ?? []).filter((r) => r.id !== roomId) })}
              onUpdateRoom={(roomId, patch) =>
                onUpdate({
                  personalProperty: (building.personalProperty ?? []).map((r) => (r.id === roomId ? { ...r, ...patch } : r)),
                })
              }
              onAddPhotos={async (_roomId, files, cause, note) =>
                addPhotosForSection(files, { cause, slope: "", note }, "interior" as CaptureSection)
              }
              onRemovePhoto={(photoId) => {
                onRemovePhoto(photoId);
                onUpdate({ photoIds: (building.photoIds ?? []).filter((id) => id !== photoId) });
              }}
              onToggleManualComplete={() =>
                updateSection("personal_property", { manualComplete: !(sections.personal_property?.manualComplete ?? false) })
              }
            />
          </div>
        ) : activeSection === "exterior_collateral" ? (
          <div className="hub-drawer-overlay">
            <ExteriorCollateralDrawer
              items={building.exteriorCollateral ?? []}
              photos={photos}
              manualComplete={sections.exterior_collateral?.manualComplete ?? false}
              onClose={() => setActiveSection(null)}
              onAddItem={(type: ExteriorCollateralType, customLabel) => {
                const id = crypto.randomUUID();
                const item: ExteriorCollateralItem = {
                  id,
                  type,
                  customTypeLabel: customLabel,
                  condition: null,
                  damageCause: "none",
                  note: "",
                  photoIds: [],
                };
                onUpdate({ exteriorCollateral: [...(building.exteriorCollateral ?? []), item] });
                return id;
              }}
              onRemoveItem={(itemId) => onUpdate({ exteriorCollateral: (building.exteriorCollateral ?? []).filter((i) => i.id !== itemId) })}
              onUpdateItem={(itemId, patch) =>
                onUpdate({
                  exteriorCollateral: (building.exteriorCollateral ?? []).map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
                })
              }
              onAddPhotos={async (_itemId, files, cause, note) =>
                addPhotosForSection(files, { cause, slope: "", note }, "collateral_damage" as CaptureSection)
              }
              onRemovePhoto={(photoId) => {
                onRemovePhoto(photoId);
                onUpdate({ photoIds: (building.photoIds ?? []).filter((id) => id !== photoId) });
              }}
              onToggleManualComplete={() =>
                updateSection("exterior_collateral", { manualComplete: !(sections.exterior_collateral?.manualComplete ?? false) })
              }
            />
          </div>
        ) : activeSection ? (
          <div className="hub-drawer-overlay">
            <SectionDrawer
              config={{
                key: activeSection,
                label: SECTION_LABELS[activeSection] ?? activeSection,
                captureSection: activeSection as CaptureSection,
              }}
              photos={buildingPhotos.filter((p) => p.captureSection === activeSection)}
              condition={sections[activeSection]?.condition ?? null}
              note={sections[activeSection]?.note ?? ""}
              manualComplete={sections[activeSection]?.manualComplete ?? false}
              onClose={() => setActiveSection(null)}
              onAddPhotos={async (files, tags, section) => {
                await addPhotosForSection(files, tags, section);
              }}
              onRemovePhoto={(photoId) => {
                onRemovePhoto(photoId);
                onUpdate({ photoIds: (building.photoIds ?? []).filter((id) => id !== photoId) });
              }}
              onConditionChange={(c: SectionCondition) => updateSection(activeSection, { condition: c })}
              onNoteChange={(n) => updateSection(activeSection, { note: n })}
              onToggleManualComplete={() =>
                updateSection(activeSection, { manualComplete: !(sections[activeSection]?.manualComplete ?? false) })
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
