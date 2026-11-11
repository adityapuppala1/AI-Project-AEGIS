// One glyph and one colour per hazard, reused in tables, chips, legends and maps so a hazard looks the same on every
// page. Colours are "r g b" triplets (light theme, dark theme). The icon is named here and resolved to a lucide icon
// in components/ui/identity.tsx; this file has no React imports so it is unit tested directly.

export type HazardIcon = "tornado" | "waves" | "droplets" | "cloud-rain" | "activity" | "thermometer-sun" | "flame" | "mountain" | "cloud-lightning" | "wind" | "sun" | "triangle-alert";
export interface HazardStyle { key: string; label: string; icon: HazardIcon; light: string; dark: string }

const STYLES: HazardStyle[] = [
  { key: "cyclone", label: "Cyclone", icon: "tornado", light: "14 116 144", dark: "103 232 249" },
  { key: "river_flood", label: "River flood", icon: "waves", light: "29 78 216", dark: "147 197 253" },
  { key: "urban_flood", label: "Urban flooding", icon: "droplets", light: "3 105 161", dark: "125 211 252" },
  { key: "heavy_rain", label: "Heavy rain", icon: "cloud-rain", light: "51 65 85", dark: "203 213 225" },
  { key: "earthquake", label: "Earthquake", icon: "activity", light: "146 64 14", dark: "253 186 116" },
  { key: "heatwave", label: "Heatwave", icon: "thermometer-sun", light: "194 65 12", dark: "253 164 117" },
  { key: "wildfire", label: "Wildfire", icon: "flame", light: "185 28 28", dark: "252 165 165" },
  { key: "landslide", label: "Landslide", icon: "mountain", light: "113 63 18", dark: "234 179 8" },
  { key: "storm", label: "Storm", icon: "cloud-lightning", light: "133 77 14", dark: "253 224 71" },
  { key: "wind", label: "Strong wind", icon: "wind", light: "15 118 110", dark: "94 234 212" },
  { key: "drought", label: "Drought", icon: "sun", light: "161 98 7", dark: "250 204 21" },
  { key: "tsunami", label: "Tsunami", icon: "waves", light: "13 110 103", dark: "94 220 205" },
];
const OTHER: HazardStyle = { key: "other", label: "Other hazard", icon: "triangle-alert", light: "71 85 105", dark: "190 201 224" };

// Words the records use for the same hazard.
const ALIASES: Record<string, string> = {
  flood: "river_flood", flooding: "river_flood", river: "river_flood", river_discharge: "river_flood", riverine_flood: "river_flood", flash_flood: "river_flood",
  urban_flooding: "urban_flood", waterlogging: "urban_flood", rain: "heavy_rain", rainfall: "heavy_rain", heavy_rainfall: "heavy_rain", precipitation: "heavy_rain",
  heat: "heatwave", heat_wave: "heatwave", fire: "wildfire", forest_fire: "wildfire", wildfires: "wildfire", quake: "earthquake", seismic: "earthquake", earthquakes: "earthquake",
  tropical_cyclone: "cyclone", severe_storm: "storm", severe_storms: "storm", thunderstorm: "storm", lightning: "storm", storm_surge: "cyclone", landslides: "landslide",
  strong_wind: "wind", high_wind: "wind",
};

/** Style for a hazard code or label ("river_flood", "River flood", "Flood"). Anything unrecognised gets the neutral style. */
export function hazardStyle(value: string | null | undefined): HazardStyle {
  const key = (value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!key) return OTHER;
  const resolved = ALIASES[key] ?? key;
  return STYLES.find(style => style.key === resolved) ?? STYLES.find(style => key.includes(style.key)) ?? OTHER;
}
export const HAZARD_STYLES: readonly HazardStyle[] = STYLES;
