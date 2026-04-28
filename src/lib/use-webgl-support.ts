"use client";

import { useEffect, useState } from "react";

type Support = "checking" | "supported" | "unsupported";

let cached: Support | null = null;

function detect(): Support {
  if (typeof window === "undefined") return "checking";
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl2") as WebGL2RenderingContext | null) ||
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return "unsupported";
    // Coerce a small operation to verify the context isn't a stub.
    if (typeof (gl as WebGLRenderingContext).getParameter !== "function") return "unsupported";
    return "supported";
  } catch {
    return "unsupported";
  }
}

export function useWebGLSupport(): Support {
  const [support, setSupport] = useState<Support>(() => cached ?? "checking");

  useEffect(() => {
    if (cached) {
      setSupport(cached);
      return;
    }
    const result = detect();
    cached = result;
    setSupport(result);
  }, []);

  return support;
}

export function useThemeBg(): string {
  const [bg, setBg] = useState<string>("#0f1320");

  useEffect(() => {
    if (typeof window === "undefined") return;
    function read() {
      const root = document.documentElement;
      const isLight = root.classList.contains("theme-light");
      setBg(isLight ? "#eef3f8" : "#0f1320");
    }
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return bg;
}

export function useThemeIsLight(): boolean {
  const [light, setLight] = useState(false);
  useEffect(() => {
    function read() {
      setLight(document.documentElement.classList.contains("theme-light"));
    }
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return light;
}
