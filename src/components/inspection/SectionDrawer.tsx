"use client";

import React, { useState } from "react";
import type { HubSectionKey, SectionCondition, InspectionPhotoDraft, CaptureSection } from "@/types/inspection";
import InAppCamera from "./InAppCamera";

type SectionConfig = {
  key: HubSectionKey;
  label: string;
  captureSection: CaptureSection;
  suggestedPhotoCount?: number;
  /** Hide condition selector (e.g., perimeter is all photos) */
  hideCondition?: boolean;
};

type Props = {
  config: SectionConfig;
  photos: InspectionPhotoDraft[];
  condition: SectionCondition | null;
  note: string;
  manualComplete: boolean;
  onClose: () => void;
  onAddPhotos: (files: File[], tags: { cause: import("@/types/inspection").DamageCause; slope: import("@/types/inspection").DamageSlope | ""; note: string }, captureSection: CaptureSection) => void;
  onRemovePhoto: (photoId: string) => void;
  onConditionChange: (condition: SectionCondition) => void;
  onNoteChange: (note: string) => void;
  onToggleManualComplete: () => void;
};

const CONDITIONS: { value: SectionCondition; label: string; color: string }[] = [
  { value: "good", label: "Good", color: "#2f8a46" },
  { value: "damaged", label: "Damaged", color: "#c0312f" },
  { value: "missing", label: "Missing", color: "#d6b37a" },
  { value: "not_visible", label: "Not Visible", color: "#6b6f76" },
];

export default function SectionDrawer({
  config,
  photos,
  condition,
  note,
  manualComplete,
  onClose,
  onAddPhotos,
  onRemovePhoto,
  onConditionChange,
  onNoteChange,
  onToggleManualComplete,
}: Props) {
  const [showCamera, setShowCamera] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = React.useRef<any>(null);

  function startVoice() {
    type SpeechRecognitionCtor = new () => {
      continuous: boolean;
      interimResults: boolean;
      onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } }; length: number } }) => void) | null;
      start: () => void;
      stop: () => void;
    };
    const win = window as unknown as Record<string, unknown>;
    const SR = (win["SpeechRecognition"] ?? win["webkitSpeechRecognition"]) as SpeechRecognitionCtor | undefined;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) {
        parts.push(e.results[i][0].transcript);
      }
      setVoiceTranscript(parts.join(" "));
    };
    rec.start();
    recognitionRef.current = rec;
    setVoiceRecording(true);
  }

  function stopVoice() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setVoiceRecording(false);
    if (voiceTranscript) {
      onNoteChange(note ? `${note}\n${voiceTranscript}` : voiceTranscript);
      setVoiceTranscript("");
    }
  }

  const photoCount = photos.length;
  const suggested = config.suggestedPhotoCount ?? 0;
  const hasMinimum = suggested === 0 || photoCount >= suggested;

  return (
    <>
      {showCamera ? (
        <InAppCamera
          sectionLabel={config.label}
          captureSection={config.captureSection}
          photoCount={photoCount}
          suggestedCount={config.suggestedPhotoCount}
          onCapture={(files, tags) => {
            onAddPhotos(files, tags, config.captureSection);
            setShowCamera(false);
          }}
          onClose={() => setShowCamera(false)}
        />
      ) : null}

      <div className="section-drawer" role="dialog" aria-label={`${config.label} section`}>
        {/* Header */}
        <div className="section-drawer__header">
          <h3 className="section-drawer__title">{config.label}</h3>
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

        {/* Photo counter + add buttons */}
        <div className="section-drawer__photo-bar">
          <span className="section-drawer__photo-count">
            {photoCount} photo{photoCount !== 1 ? "s" : ""}
            {suggested > 0 ? ` / ${suggested} suggested` : ""}
            {!hasMinimum ? <span className="section-drawer__photo-warn"> ⚠</span> : null}
          </span>
          <div className="section-drawer__add-btns">
            <button type="button" className="photo-add-btn" onClick={() => setShowCamera(true)}>
              📷 Camera
            </button>
            <label className="photo-add-btn">
              🖼 Library
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) onAddPhotos(files, { cause: "none", slope: "", note: "" }, config.captureSection);
                  e.target.value = "";
                }}
                style={{ display: "none" }}
              />
            </label>
          </div>
        </div>

        {/* Photo grid */}
        {photoCount > 0 ? (
          <div className="section-drawer__photo-grid">
            {photos.map((photo) => {
              const url = URL.createObjectURL(photo.file);
              return (
                <div key={photo.id} className="section-drawer__photo-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="section-drawer__photo-img" />
                  <button
                    type="button"
                    className="section-drawer__photo-remove"
                    onClick={() => onRemovePhoto(photo.id)}
                    aria-label="Remove photo"
                  >
                    ✕
                  </button>
                  {photo.slopeTag ? (
                    <span className="section-drawer__photo-badge">{photo.slopeTag}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="section-drawer__empty">No photos yet</p>
        )}

        {/* Condition selector */}
        {!config.hideCondition ? (
          <div className="section-drawer__condition">
            <span className="section-drawer__field-label">Condition</span>
            <div className="section-drawer__condition-btns">
              {CONDITIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className="condition-btn"
                  style={{
                    borderColor: condition === c.value ? c.color : "var(--border)",
                    background: condition === c.value ? `${c.color}22` : "transparent",
                    color: condition === c.value ? c.color : "var(--text-muted)",
                  }}
                  onClick={() => onConditionChange(c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Note */}
        <div className="section-drawer__note">
          <span className="section-drawer__field-label">Notes</span>
          <div className="section-drawer__note-row">
            <textarea
              className="section-drawer__note-input"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Add a section note…"
              rows={3}
            />
            <button
              type="button"
              className={`voice-btn${voiceRecording ? " recording" : ""}`}
              onPointerDown={startVoice}
              onPointerUp={stopVoice}
              aria-label={voiceRecording ? "Stop recording" : "Hold to record voice note"}
            >
              🎤
            </button>
          </div>
          {voiceRecording && voiceTranscript ? (
            <p className="voice-preview">{voiceTranscript}</p>
          ) : null}
        </div>
      </div>
    </>
  );
}
