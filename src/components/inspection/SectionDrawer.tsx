"use client";

import React, { useState } from "react";
import type { HubSectionKey, SectionCondition, InspectionPhotoDraft, CaptureSection } from "@/types/inspection";
import InAppCamera from "./InAppCamera";
import PhotoGrid from "./PhotoGrid";

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
      onerror: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    const win = window as unknown as Record<string, unknown>;
    const SR = (win["SpeechRecognition"] ?? win["webkitSpeechRecognition"]) as SpeechRecognitionCtor | undefined;
    if (!SR) {
      alert("Voice notes are not supported in this browser.");
      return;
    }
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
    rec.onerror = () => {
      stopVoice();
    };
    rec.start();
    recognitionRef.current = rec;
    setVoiceRecording(true);
  }

  function stopVoice() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setVoiceRecording(false);
    setVoiceTranscript((transcript) => {
      if (transcript) {
        onNoteChange(note ? `${note}\n${transcript}` : transcript);
      }
      return "";
    });
  }

  const [showDoneConfirm, setShowDoneConfirm] = useState(false);

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
              onClick={() => {
                if (!manualComplete && suggested > 0 && photoCount < suggested) {
                  setShowDoneConfirm(true);
                } else {
                  onToggleManualComplete();
                }
              }}
            >
              {manualComplete ? "✓ Done" : "Mark Done"}
            </button>
            {showDoneConfirm ? (
              <div className="done-confirm-overlay" role="dialog" aria-modal="true" aria-label="Confirm mark done">
                <div className="done-confirm-dialog">
                  <p className="done-confirm-msg">
                    Only {photoCount} of {suggested} suggested photos added. Mark done anyway?
                  </p>
                  <div className="done-confirm-actions">
                    <button type="button" className="chip active" onClick={() => { setShowDoneConfirm(false); onToggleManualComplete(); }}>
                      Mark Done
                    </button>
                    <button type="button" className="chip" onClick={() => setShowDoneConfirm(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
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
        <PhotoGrid photos={photos} onRemove={onRemovePhoto} />

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
              value={voiceRecording && voiceTranscript ? `${note}${note ? "\n" : ""}${voiceTranscript}` : note}
              onChange={(e) => !voiceRecording && onNoteChange(e.target.value)}
              placeholder="Add a section note…"
              rows={3}
              readOnly={voiceRecording}
            />
            {voiceRecording ? (
              <button
                type="button"
                className="voice-btn recording"
                onClick={stopVoice}
                aria-label="Stop recording"
              >
                ⏹
              </button>
            ) : (
              <button
                type="button"
                className="voice-btn"
                onClick={startVoice}
                aria-label="Start voice note"
              >
                🎤
              </button>
            )}
          </div>
          {voiceRecording ? (
            <p className="voice-preview">
              <span className="voice-listening-dot" />
              Listening… {voiceTranscript ? `"${voiceTranscript.slice(0, 60)}${voiceTranscript.length > 60 ? "…" : ""}"` : ""}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
