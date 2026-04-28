import { rgb } from "pdf-lib";

type RgbColor = ReturnType<typeof rgb>;

export const THEME = {
  colors: {
    brandBlue: rgb(0.122, 0.314, 0.549),      // #1F5096
    brandBlueDark: rgb(0.09, 0.19, 0.35),      // #183060
    brandBlueMid: rgb(0.18, 0.39, 0.65),
    accent: rgb(0.839, 0.702, 0.478),           // #D6B37A
    ink: rgb(0.102, 0.122, 0.173),              // #1A1F2C
    body: rgb(0.18, 0.19, 0.22),               // body text
    muted: rgb(0.42, 0.44, 0.46),              // #6B7280
    light: rgb(0.68, 0.70, 0.72),
    white: rgb(1, 1, 1),
    surface: rgb(0.969, 0.973, 0.98),          // #F7F8FA card bg
    surfaceAlt: rgb(0.95, 0.965, 0.988),
    divider: rgb(0.898, 0.906, 0.918),         // #E5E7EB
    tableStripe: rgb(0.96, 0.972, 0.988),
    // Status
    good: rgb(0.184, 0.541, 0.275),            // #2F8A46
    goodBg: rgb(0.184, 0.541, 0.275),
    fair: rgb(0.839, 0.627, 0.251),            // #D6A040
    poor: rgb(0.753, 0.220, 0.169),            // #C0392B
    unknown: rgb(0.42, 0.44, 0.46),
  } as Record<string, RgbColor>,

  typography: {
    display: 26,
    h1: 18,
    h2: 13,
    h3: 11,
    body: 10,
    bodySmall: 9,
    caption: 8,
    micro: 7,
  },

  spacing: {
    margin: 44,
    cardPad: 10,
    sectionGap: 18,
    lineBody: 14,
    lineSmall: 12,
    lineMicro: 10,
  },

  page: {
    width: 612,
    height: 792,
  },
} as const;

export const CONDITION_STYLE: Record<string, { bg: RgbColor; text: RgbColor; label: string }> = {
  good:        { bg: rgb(0.184, 0.541, 0.275), text: rgb(1,1,1), label: "Good" },
  damaged:     { bg: rgb(0.753, 0.220, 0.169), text: rgb(1,1,1), label: "Damaged" },
  missing:     { bg: rgb(0.839, 0.627, 0.251), text: rgb(1,1,1), label: "Missing" },
  not_visible: { bg: rgb(0.42, 0.44, 0.46),   text: rgb(1,1,1), label: "N/V" },
  present:     { bg: rgb(0.184, 0.541, 0.275), text: rgb(1,1,1), label: "Present" },
  absent:      { bg: rgb(0.753, 0.220, 0.169), text: rgb(1,1,1), label: "Absent" },
  unknown:     { bg: rgb(0.42, 0.44, 0.46),   text: rgb(1,1,1), label: "Unknown" },
  good_comp:   { bg: rgb(0.184, 0.541, 0.275), text: rgb(1,1,1), label: "Good" },
  fair:        { bg: rgb(0.839, 0.627, 0.251), text: rgb(1,1,1), label: "Fair" },
  poor:        { bg: rgb(0.753, 0.220, 0.169), text: rgb(1,1,1), label: "Poor" },
};
