"use client";

import { useMemo } from "react";
import * as THREE from "three";

const SIZE = 256;

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  return { canvas, ctx };
}

function finalizeTexture(canvas: HTMLCanvasElement, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// Subtle stucco/lap-siding noise — works on top of the wall base color.
export function useStuccoTexture(baseColor: string): THREE.CanvasTexture | null {
  return useMemo(() => {
    const made = makeCanvas();
    if (!made) return null;
    const { canvas, ctx } = made;
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Horizontal lap siding bands
    const bandHeight = 22;
    for (let y = 0; y < SIZE; y += bandHeight) {
      const grad = ctx.createLinearGradient(0, y, 0, y + bandHeight);
      grad.addColorStop(0, "rgba(255,255,255,0.06)");
      grad.addColorStop(0.5, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.10)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, SIZE, bandHeight);
    }

    // Speckle noise
    const imgData = ctx.getImageData(0, 0, SIZE, SIZE);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 14;
      data[i] = Math.max(0, Math.min(255, data[i] + n));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);

    return finalizeTexture(canvas, 4, 2);
  }, [baseColor]);
}

// Shingle row stripes for roofs.
export function useShingleTexture(baseColor: string, accentColor: string): THREE.CanvasTexture | null {
  return useMemo(() => {
    const made = makeCanvas();
    if (!made) return null;
    const { canvas, ctx } = made;
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Horizontal shingle rows
    const rowHeight = 32;
    for (let y = 0; y < SIZE; y += rowHeight) {
      // Row shadow
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(0, y, SIZE, 3);
      // Tab joints staggered every other row
      const offset = (y / rowHeight) % 2 === 0 ? 0 : SIZE / 6;
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      for (let x = 0; x < SIZE + offset; x += SIZE / 3) {
        ctx.fillRect(x - offset, y + 4, 1.5, rowHeight - 6);
      }
      // Subtle accent highlight
      ctx.fillStyle = accentColor;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(0, y + rowHeight - 6, SIZE, 4);
      ctx.globalAlpha = 1;
    }

    // Mild noise
    const imgData = ctx.getImageData(0, 0, SIZE, SIZE);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 10;
      data[i] = Math.max(0, Math.min(255, data[i] + n));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);

    return finalizeTexture(canvas, 8, 4);
  }, [baseColor, accentColor]);
}

// Lawn/grass speckle.
export function useLawnTexture(baseColor: string): THREE.CanvasTexture | null {
  return useMemo(() => {
    const made = makeCanvas();
    if (!made) return null;
    const { canvas, ctx } = made;
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Random speckle of grass blades
    for (let i = 0; i < 600; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const len = 1 + Math.random() * 2;
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "0,0,0"},${0.06 + Math.random() * 0.07})`;
      ctx.fillRect(x, y, 1, len);
    }

    // Soft patches
    for (let i = 0; i < 12; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const r = 18 + Math.random() * 28;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(255,255,255,${0.05 + Math.random() * 0.05})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    return finalizeTexture(canvas, 6, 4);
  }, [baseColor]);
}
