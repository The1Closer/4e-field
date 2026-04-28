"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { CaptureSection, DamageCause, DamageSlope } from "@/types/inspection";

type Props = {
  sectionLabel: string;
  captureSection: CaptureSection;
  photoCount: number;
  suggestedCount?: number;
  initialCause?: DamageCause;
  initialSlope?: DamageSlope | "";
  onCapture: (files: File[], tags: { cause: DamageCause; slope: DamageSlope | ""; note: string }) => void;
  onClose: () => void;
};

type CameraState = "idle" | "loading" | "active" | "unsupported";

export default function InAppCamera({
  sectionLabel,
  captureSection,
  photoCount,
  suggestedCount,
  initialCause = "none",
  initialSlope = "",
  onCapture,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [cause, setCause] = useState<DamageCause>(initialCause);
  const [slope, setSlope] = useState<DamageSlope | "">(initialSlope);
  const [note, setNote] = useState("");

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setCameraState("loading");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState("active");
    } catch {
      // Camera unavailable — fall through to file input
      setCameraState("unsupported");
    }
  }, []);

  useEffect(() => {
    if (typeof navigator?.mediaDevices?.getUserMedia === "function") {
      void startCamera();
    } else {
      setCameraState("unsupported");
    }
    return () => stopStream();
  }, [startCamera, stopStream]);

  function captureFrame() {
    const video = videoRef.current;
    if (!video || cameraState !== "active") return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `${captureSection}_${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture([file], { cause, slope, note });
      },
      "image/jpeg",
      0.9,
    );
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    onCapture(files, { cause, slope, note });
    e.target.value = "";
  }

  const counterText = suggestedCount
    ? `Photo ${photoCount + 1} of ${suggestedCount} suggested`
    : `${photoCount} photo${photoCount !== 1 ? "s" : ""} captured`;

  return (
    <div className="camera-overlay">
      <div className="camera-header">
        <span className="camera-section-pill">{sectionLabel}</span>
        <span className="camera-counter">{counterText}</span>
        <button type="button" className="camera-close" onClick={() => { stopStream(); onClose(); }}>
          ✕
        </button>
      </div>

      {/* Camera viewfinder */}
      <div className="camera-viewfinder">
        {cameraState === "loading" && (
          <div className="camera-placeholder">Starting camera…</div>
        )}
        {cameraState === "unsupported" && (
          <div className="camera-placeholder">Camera not available — use library below</div>
        )}
        {(cameraState === "active" || cameraState === "loading") && (
          <video
            ref={videoRef}
            className="camera-video"
            playsInline
            muted
            autoPlay
            style={{ display: cameraState === "active" ? "block" : "none" }}
          />
        )}
      </div>

      {/* Tag chips */}
      <div className="camera-tags">
        <div className="camera-tag-group">
          <span className="camera-tag-label">Slope</span>
          {(["", "front", "rear", "left", "right"] as const).map((s) => (
            <button
              key={s || "none"}
              type="button"
              className={`camera-chip${slope === s ? " active" : ""}`}
              onClick={() => setSlope(s)}
            >
              {s || "Any"}
            </button>
          ))}
        </div>
        <div className="camera-tag-group">
          <span className="camera-tag-label">Cause</span>
          {(["none", "hail", "wind", "other"] as const).map((c) => (
            <button
              key={c}
              type="button"
              className={`camera-chip${cause === c ? " active" : ""}`}
              onClick={() => setCause(c)}
            >
              {c === "none" ? "None" : c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
        <input
          className="camera-note-input"
          type="text"
          placeholder="Optional note…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {/* Controls */}
      <div className="camera-controls">
        {cameraState === "active" ? (
          <button type="button" className="camera-shutter" onClick={captureFrame} aria-label="Take photo">
            <span className="camera-shutter-ring" />
          </button>
        ) : null}

        <label className="camera-library-btn" aria-label="Choose from library">
          📷 Library
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={handleFileInput}
            style={{ display: "none" }}
          />
        </label>
      </div>
    </div>
  );
}
