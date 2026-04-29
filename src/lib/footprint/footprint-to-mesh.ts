// Convert a building-footprint polygon (lng/lat) into the geometry data
// HouseScene needs to render a personalized 3D house: wall ring, dimensions,
// hotspot anchor positions, decoration positions.
//
// All output is in three.js coordinates: x = horizontal, y = up, z = depth
// (with +z toward the front of the house). Sized to fit the existing camera
// framing (~10m × 7m envelope) so House3D's camera/zoom controls don't change.

import type { BuildingFootprint } from "@/types/inspection";

// Generous envelope so real building proportions actually read on screen.
// The lawn is 28×22m so we have plenty of room to render at near-real scale.
const TARGET_WIDTH = 14;
const TARGET_DEPTH = 11;
const WALL_HEIGHT = 3.8;
const ROOF_HEIGHT = 2.0;
const FOUNDATION_HEIGHT = 0.4;

export type AnchorBox = {
  position: [number, number, number];
  size: [number, number, number];
};

export type FootprintHouseGeometry = {
  /** Wall polygon ring as [x, z] pairs in three.js meters, closed (first === last). */
  ring: Array<[number, number]>;
  /** Bounding box dimensions of the ring. */
  width: number;
  depth: number;
  wallHeight: number;
  roofHeight: number;
  foundationHeight: number;
  /** Anchor boxes for each hotspot, multiple entries per section as needed. */
  hotspots: {
    roof: AnchorBox;
    gutters: AnchorBox;
    sidingLeft: AnchorBox;
    sidingRight: AnchorBox;
    sidingFrontTop: AnchorBox;
    sidingFrontBottom: AnchorBox;
    windowsLeft: AnchorBox;
    windowsRight: AnchorBox;
    interior: AnchorBox;
    attic: AnchorBox;
    personalProperty: AnchorBox;
    perimeter: AnchorBox;
    exteriorCollateralLeft: AnchorBox;
    exteriorCollateralRight: AnchorBox;
  };
  /** Front-face center, on the front wall plane, used for Street View texture. */
  frontFace: {
    center: [number, number, number];
    width: number;
    height: number;
  };
  /** Decoration positions tuned to the actual footprint. */
  decorations: {
    chimney: [number, number, number];
    ac: [number, number, number];
    deck: [number, number, number];
    mailbox: [number, number, number];
    tree: [number, number, number];
    shrubs: [number, number, number];
    sidewalkCenter: [number, number, number];
  };
};

/**
 * Build geometry from a footprint. Returns null on a degenerate polygon —
 * caller falls back to the generic hardcoded geometry in HouseScene.
 */
export function footprintToHouseGeometry(
  footprint: BuildingFootprint,
): FootprintHouseGeometry | null {
  const { polygon, centroid } = footprint;
  if (!polygon || polygon.length < 4) return null;

  // 1. Project to local meters centered on centroid.
  const cosLat = Math.cos((centroid[1] * Math.PI) / 180);
  const mPerDeg = 111_111;
  const mPerDegLng = mPerDeg * cosLat;
  const localXY: Array<[number, number]> = polygon.map(([lng, lat]) => [
    (lng - centroid[0]) * mPerDegLng,
    (lat - centroid[1]) * mPerDeg,
  ]);

  // 2. Find longest edge — its direction becomes the "front face" axis.
  let longestLen = 0;
  let longestAngle = 0;
  for (let i = 0; i < localXY.length - 1; i++) {
    const [x0, y0] = localXY[i];
    const [x1, y1] = localXY[i + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len > longestLen) {
      longestLen = len;
      longestAngle = Math.atan2(dy, dx);
    }
  }
  if (longestLen < 1) return null;

  // 3. Rotate so the longest edge is along the x-axis (i.e. the wall it
  //    represents will face front/back of the camera).
  const cos = Math.cos(-longestAngle);
  const sin = Math.sin(-longestAngle);
  const rotated: Array<[number, number]> = localXY.map(([x, y]) => [
    x * cos - y * sin,
    x * sin + y * cos,
  ]);

  // 4. Bounding box.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of rotated) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const naturalWidth = maxX - minX;
  const naturalDepth = maxY - minY;
  if (naturalWidth < 1 || naturalDepth < 1) return null;

  // 5. Scale down to fit the target envelope, but NEVER scale up. A 6×4m
  //    cottage should look smaller than an 18×12m house — that's the whole
  //    point of using the real footprint.
  const fitScale = Math.min(TARGET_WIDTH / naturalWidth, TARGET_DEPTH / naturalDepth);
  const scale = Math.min(1, fitScale);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // 6. The longest edge sits at one of the y-bounds (min or max). Whichever
  //    edge has the most polygon mass on its near side becomes the front (+z).
  //    We test by projecting every vertex onto +y and picking the side with
  //    larger spread of vertices (more wall there → likely the long front face).
  let topCount = 0;
  let bottomCount = 0;
  const midY = cy;
  for (const [, y] of rotated) {
    if (y > midY) topCount++;
    else bottomCount++;
  }
  // Flip if needed so the side with the longest edge density faces +z (front).
  // We arbitrarily put the longest edge at +y (top) initially, then flip to +z.
  const flipFront = topCount < bottomCount;

  // 7. Build the centered, scaled ring in three.js x/z.
  //    Three.js: x = local x, z = +y_local mapped to either +z or -z depending on flipFront.
  //    Front of the house = +z (faces initial camera at [13, 10, 13]).
  const yToZSign = flipFront ? 1 : -1;
  const ring: Array<[number, number]> = rotated.map(([x, y]) => [
    (x - cx) * scale,
    yToZSign * (y - cy) * scale,
  ]);
  // Ensure ring is closed.
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);

  const width = naturalWidth * scale;
  const depth = naturalDepth * scale;
  const halfW = width / 2;
  const halfD = depth / 2;
  const wallTop = FOUNDATION_HEIGHT + WALL_HEIGHT;
  const wallMidY = FOUNDATION_HEIGHT + WALL_HEIGHT / 2;

  return {
    ring,
    width,
    depth,
    wallHeight: WALL_HEIGHT,
    roofHeight: ROOF_HEIGHT,
    foundationHeight: FOUNDATION_HEIGHT,
    hotspots: {
      roof: {
        position: [0, wallTop + ROOF_HEIGHT * 0.5, 0],
        size: [width, 0.4, depth],
      },
      gutters: {
        position: [0, wallTop - 0.05, 0],
        size: [width + 0.4, 0.12, depth + 0.4],
      },
      sidingLeft: {
        position: [-halfW - 0.05, wallMidY, 0],
        size: [0.04, WALL_HEIGHT * 0.95, depth - 0.1],
      },
      sidingRight: {
        position: [halfW + 0.05, wallMidY, 0],
        size: [0.04, WALL_HEIGHT * 0.95, depth - 0.1],
      },
      sidingFrontTop: {
        position: [0, wallTop - 0.4, halfD + 0.03],
        size: [width * 0.75, 0.6, 0.04],
      },
      sidingFrontBottom: {
        position: [0, FOUNDATION_HEIGHT + 0.5, halfD + 0.03],
        size: [width * 0.75, 0.5, 0.04],
      },
      windowsLeft: {
        position: [-width * 0.27, FOUNDATION_HEIGHT + WALL_HEIGHT * 0.6, halfD + 0.06],
        size: [1.55, 1.45, 0.04],
      },
      windowsRight: {
        position: [width * 0.27, FOUNDATION_HEIGHT + WALL_HEIGHT * 0.6, halfD + 0.06],
        size: [1.55, 1.45, 0.04],
      },
      interior: {
        position: [0, FOUNDATION_HEIGHT + WALL_HEIGHT * 0.35, halfD + 0.06],
        size: [1.4, 2.5, 0.04],
      },
      attic: {
        position: [0, wallTop + ROOF_HEIGHT * 0.5, halfD - 0.2],
        size: [width * 0.3, 0.6, 0.4],
      },
      personalProperty: {
        position: [width * 0.27, FOUNDATION_HEIGHT + WALL_HEIGHT * 0.7, -halfD - 0.05],
        size: [width * 0.4, WALL_HEIGHT * 0.7, 0.05],
      },
      perimeter: {
        position: [0, 0.05, halfD + 1.7],
        size: [Math.min(2.6, width * 0.3), 0.05, depth + 5],
      },
      exteriorCollateralLeft: {
        position: [-halfW - 0.6, FOUNDATION_HEIGHT + 0.5, depth * 0.18],
        size: [1.5, 1.6, 1.5],
      },
      exteriorCollateralRight: {
        position: [halfW + 0.7, FOUNDATION_HEIGHT + 0.5, -depth * 0.07],
        size: [1.8, 1.4, depth * 0.5],
      },
    },
    frontFace: {
      center: [0, FOUNDATION_HEIGHT + WALL_HEIGHT / 2, halfD + 0.01],
      width,
      height: WALL_HEIGHT,
    },
    decorations: {
      chimney: [width * 0.3, wallTop + ROOF_HEIGHT * 0.6, -depth * 0.1],
      ac: [-halfW - 0.6, FOUNDATION_HEIGHT + 0.6, depth * 0.18],
      deck: [halfW + 0.7, FOUNDATION_HEIGHT - 0.05, -depth * 0.07],
      mailbox: [halfW * 0.75, 1, halfD + 2.5],
      tree: [-halfW * 0.9, 0, halfD + 3.2],
      shrubs: [halfW * 0.55, 0.4, halfD + 2.0],
      sidewalkCenter: [0, 0.008, halfD + 2.5],
    },
  };
}
