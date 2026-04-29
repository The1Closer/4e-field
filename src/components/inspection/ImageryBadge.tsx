"use client";

import React from "react";

type Props = {
  status: "idle" | "loading" | "ready" | "partial" | "failed";
};

export default function ImageryBadge({ status }: Props) {
  if (status === "idle") return null;

  let label = "";
  let className = "h3d-imagery-badge";
  if (status === "loading") {
    label = "Linking real imagery…";
    className += " h3d-imagery-badge--loading";
  } else if (status === "ready") {
    label = "Live property imagery";
    className += " h3d-imagery-badge--ready";
  } else if (status === "partial") {
    label = "Partial imagery";
    className += " h3d-imagery-badge--partial";
  } else {
    label = "Stylized model";
    className += " h3d-imagery-badge--stylized";
  }

  return (
    <div className={className} role="status" aria-live="polite">
      <span className="h3d-imagery-badge__dot" aria-hidden />
      <span className="h3d-imagery-badge__label">{label}</span>
    </div>
  );
}
