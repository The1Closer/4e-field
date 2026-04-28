"use client";

import React, { useState } from "react";
import type {
  DamageCause,
  InspectionPhotoDraft,
  PersonalPropertyRoom,
  PersonalPropertyRoomKey,
} from "@/types/inspection";
import InAppCamera from "./InAppCamera";
import PhotoGrid from "./PhotoGrid";

type Props = {
  rooms: PersonalPropertyRoom[];
  photos: InspectionPhotoDraft[];
  manualComplete: boolean;
  onClose: () => void;
  onAddRoom: (key: PersonalPropertyRoomKey, customLabel?: string) => string; // returns roomId
  onRemoveRoom: (roomId: string) => void;
  onUpdateRoom: (roomId: string, patch: Partial<PersonalPropertyRoom>) => void;
  onAddPhotos: (roomId: string, files: File[], cause: DamageCause, note: string) => Promise<InspectionPhotoDraft[]>;
  onRemovePhoto: (photoId: string) => void;
  onToggleManualComplete: () => void;
};

const FIXED_ROOMS: { key: PersonalPropertyRoomKey; label: string }[] = [
  { key: "living_room", label: "Living Room" },
  { key: "dining_room", label: "Dining Room" },
  { key: "kitchen", label: "Kitchen" },
  { key: "master_bedroom", label: "Master Bed" },
  { key: "bedroom_2", label: "Bedroom 2" },
  { key: "bedroom_3", label: "Bedroom 3" },
  { key: "bathroom", label: "Bathroom" },
  { key: "office", label: "Office" },
  { key: "basement", label: "Basement" },
];

const DAMAGE_CAUSES: { value: DamageCause; label: string }[] = [
  { value: "none", label: "None" },
  { value: "hail", label: "Hail" },
  { value: "wind", label: "Wind" },
  { value: "other", label: "Water / Other" },
];

function roomLabel(room: PersonalPropertyRoom): string {
  if (room.key.startsWith("custom:")) return room.customLabel || "Custom Room";
  return FIXED_ROOMS.find((r) => r.key === room.key)?.label ?? room.key;
}

export default function PersonalPropertyDrawer({
  rooms,
  photos,
  manualComplete,
  onClose,
  onAddRoom,
  onRemoveRoom,
  onUpdateRoom,
  onAddPhotos,
  onRemovePhoto,
  onToggleManualComplete,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customName, setCustomName] = useState("");
  const [cameraRoomId, setCameraRoomId] = useState<string | null>(null);

  function ensureRoom(key: PersonalPropertyRoomKey, customLabel?: string): string {
    const existing = rooms.find((r) => r.key === key);
    if (existing) return existing.id;
    return onAddRoom(key, customLabel);
  }

  function toggleFixedRoom(key: PersonalPropertyRoomKey) {
    const id = ensureRoom(key);
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function addCustomRoom() {
    const name = customName.trim();
    if (!name) return;
    const id = onAddRoom(`custom:${crypto.randomUUID()}`, name);
    setCustomName("");
    setShowCustomInput(false);
    setExpandedId(id);
  }

  return (
    <>
      {cameraRoomId ? (
        <InAppCamera
          sectionLabel={`Personal Property — ${roomLabel(rooms.find((r) => r.id === cameraRoomId)!)}`}
          captureSection="interior"
          photoCount={rooms.find((r) => r.id === cameraRoomId)?.photoIds.length ?? 0}
          onCapture={async (files, tags) => {
            const room = rooms.find((r) => r.id === cameraRoomId);
            if (!room) return;
            const newPhotos = await onAddPhotos(cameraRoomId, files, tags.cause, tags.note);
            onUpdateRoom(cameraRoomId, { photoIds: [...room.photoIds, ...newPhotos.map((p) => p.id)] });
            setCameraRoomId(null);
          }}
          onClose={() => setCameraRoomId(null)}
        />
      ) : null}

      <div className="section-drawer pp-drawer" role="dialog" aria-label="Personal Property">
        <div className="section-drawer__header">
          <h3 className="section-drawer__title">Personal Property</h3>
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

        <p className="pp-helper">
          Flag rooms with damaged contents. Tap a room to expand, add photos, and set a damage cause.
        </p>

        {/* Room chip rail — fixed rooms */}
        <div className="pp-room-rail">
          {FIXED_ROOMS.map((r) => {
            const room = rooms.find((x) => x.key === r.key);
            const documented = !!(room && (room.photoIds.length > 0 || room.note.trim()));
            return (
              <button
                key={r.key}
                type="button"
                className={`chip${room ? " active" : ""}${documented ? " pp-chip--documented" : ""}`}
                onClick={() => toggleFixedRoom(r.key)}
              >
                {documented ? "● " : ""}{r.label}
              </button>
            );
          })}
          {showCustomInput ? (
            <span className="pp-custom-row">
              <input
                className="pp-custom-input"
                type="text"
                placeholder="Room name…"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCustomRoom();
                  if (e.key === "Escape") { setCustomName(""); setShowCustomInput(false); }
                }}
                autoFocus
              />
              <button type="button" className="chip active" onClick={addCustomRoom}>Save</button>
              <button type="button" className="chip" onClick={() => { setCustomName(""); setShowCustomInput(false); }}>Cancel</button>
            </span>
          ) : (
            <button type="button" className="chip pp-chip--add" onClick={() => setShowCustomInput(true)}>
              + Add room
            </button>
          )}
        </div>

        {/* Custom rooms appear as their own chips */}
        {rooms.filter((r) => r.key.startsWith("custom:")).length > 0 ? (
          <div className="pp-room-rail" style={{ marginTop: 4 }}>
            {rooms.filter((r) => r.key.startsWith("custom:")).map((room) => (
              <button
                key={room.id}
                type="button"
                className="chip active pp-chip--documented"
                onClick={() => setExpandedId((prev) => (prev === room.id ? null : room.id))}
              >
                ● {room.customLabel || "Custom"}
              </button>
            ))}
          </div>
        ) : null}

        {/* Expanded room panel */}
        {(() => {
          const expanded = rooms.find((r) => r.id === expandedId);
          if (!expanded) {
            return rooms.length === 0 ? (
              <p className="section-drawer__empty">No rooms inspected yet — tap a room above to start.</p>
            ) : (
              <p className="section-drawer__empty">Tap a room chip to expand its panel.</p>
            );
          }
          const roomPhotos = photos.filter((p) => expanded.photoIds.includes(p.id));
          return (
            <div className="pp-room-card">
              <div className="pp-room-card__header">
                <span className="pp-room-card__title">{roomLabel(expanded)}</span>
                <button
                  type="button"
                  className="pp-room-card__remove"
                  onClick={() => {
                    onRemoveRoom(expanded.id);
                    setExpandedId(null);
                  }}
                  aria-label="Remove room"
                >
                  Remove
                </button>
              </div>

              {/* Photo bar */}
              <div className="section-drawer__photo-bar">
                <span className="section-drawer__photo-count">
                  {expanded.photoIds.length} photo{expanded.photoIds.length !== 1 ? "s" : ""}
                </span>
                <div className="section-drawer__add-btns">
                  <button type="button" className="photo-add-btn" onClick={() => setCameraRoomId(expanded.id)}>
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
                          const newPhotos = await onAddPhotos(expanded.id, files, expanded.damageCause, expanded.note);
                          onUpdateRoom(expanded.id, { photoIds: [...expanded.photoIds, ...newPhotos.map((p) => p.id)] });
                        }
                        e.target.value = "";
                      }}
                      style={{ display: "none" }}
                    />
                  </label>
                </div>
              </div>

              <PhotoGrid
                photos={roomPhotos}
                onRemove={(photoId) => {
                  onRemovePhoto(photoId);
                  onUpdateRoom(expanded.id, { photoIds: expanded.photoIds.filter((id) => id !== photoId) });
                }}
              />

              {/* Damage cause */}
              <div className="section-drawer__condition">
                <span className="section-drawer__field-label">Damage cause</span>
                <div className="section-drawer__condition-btns">
                  {DAMAGE_CAUSES.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      className={`chip${expanded.damageCause === d.value ? " active" : ""}`}
                      onClick={() => onUpdateRoom(expanded.id, { damageCause: d.value })}
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
                  value={expanded.note}
                  onChange={(e) => onUpdateRoom(expanded.id, { note: e.target.value })}
                  placeholder="Describe damaged items in this room…"
                  rows={3}
                />
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}
