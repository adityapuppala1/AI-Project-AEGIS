// Opt-in public report intake (quarantine only). Reports are unverified and never become cases.
export type HazardKey = "flood" | "waterlogging" | "wildfire" | "landslide" | "cyclone" | "other";
export const HAZARDS: { key: HazardKey; label: string; hint: string }[] = [
  { key: "flood", label: "Flood", hint: "River or canal overflow" },
  { key: "waterlogging", label: "Waterlogging", hint: "Water standing on roads" },
  { key: "wildfire", label: "Wildfire", hint: "Fire in vegetation" },
  { key: "landslide", label: "Landslide", hint: "Slope or debris movement" },
  { key: "cyclone", label: "Cyclone", hint: "Storm or surge damage" },
  { key: "other", label: "Other", hint: "Something else" },
];
export const PRESET_LOCATIONS = [
  { label: "Hyderabad", lat: 17.385, lon: 78.4867 }, { label: "Delhi", lat: 28.6139, lon: 77.209 },
  { label: "Mumbai", lat: 19.076, lon: 72.8777 }, { label: "Chennai", lat: 13.0827, lon: 80.2707 },
  { label: "Kolkata", lat: 22.5726, lon: 88.3639 }, { label: "Bengaluru", lat: 12.9716, lon: 77.5946 },
  { label: "Guwahati", lat: 26.1445, lon: 91.7362 }, { label: "Kochi", lat: 9.9312, lon: 76.2673 },
] as const;

export const LIMITS = { title: [3, 100], description: [10, 1000], lat: [5, 38], lon: [65, 100] } as const;
export const CONTACT_MESSAGE = "Please remove personal contact details and links; reports are reviewed without identifying anyone.";

export interface QuarantinedReport {
  id: string; submitted_at: string; title: string; description: string;
  hazard_type: HazardKey; lat: number; lon: number; status: "quarantined";
}
export interface IntakeDraft { title: string; description: string; hazard_type: HazardKey | ""; lat: string; lon: string }
export type DraftErrors = Partial<Record<keyof IntakeDraft, string>>;

// Best-effort screens mirroring the server; a human reviewer still reads every report.
const AT = "(?:@|\\[\\s*at\\s*\\]|\\(\\s*at\\s*\\))", DOT = "(?:\\.|\\[\\s*dot\\s*\\]|\\(\\s*dot\\s*\\))";
const EMAIL = new RegExp(`[\\w.+-]+\\s*${AT}\\s*[\\w-]+(?:\\s*${DOT}\\s*[\\w-]+)+`, "i");
const URL_LIKE = /(?:https?:\/\/|hxxps?:\/\/|www\.|\b[a-z0-9-]+\.[a-z]{2,24}(?:\/|\b))/i;
const LONG_NUMBER = /(?:\d[^A-Za-z0-9]{0,3}){8,}/;
const DIGIT_WORDS = /(?:\b(?:zero|one|two|three|four|five|six|seven|eight|nine)\b[\s,.-]*){7,}/i;
/** NFKC-fold, map CJK stops and drop invisible format characters, as the server does before checking. */
export const normaliseText = (text: string) => text.normalize("NFKC").replace(/[。｡]/g, ".").replace(/\p{Cf}/gu, "").replace(/[ \t]+/g, " ").trim();
export const containsContactDetails = (raw: string) => {
  const text = normaliseText(raw);
  return EMAIL.test(text) || URL_LIKE.test(text) || LONG_NUMBER.test(text) || DIGIT_WORDS.test(text);
};

export function validateDraft(draft: IntakeDraft): DraftErrors {
  const errors: DraftErrors = {};
  const title = draft.title.trim(), description = draft.description.trim();
  if (title.length < LIMITS.title[0] || title.length > LIMITS.title[1]) errors.title = `Use ${LIMITS.title[0]}–${LIMITS.title[1]} characters.`;
  else if (containsContactDetails(title)) errors.title = CONTACT_MESSAGE;
  if (description.length < LIMITS.description[0] || description.length > LIMITS.description[1]) errors.description = `Use ${LIMITS.description[0]}–${LIMITS.description[1]} characters.`;
  else if (containsContactDetails(description)) errors.description = CONTACT_MESSAGE + " Use the location fields instead of typing coordinates.";
  if (!draft.hazard_type) errors.hazard_type = "Choose what you are reporting.";
  const lat = Number(draft.lat), lon = Number(draft.lon);
  if (draft.lat.trim() === "" || !Number.isFinite(lat) || lat < LIMITS.lat[0] || lat > LIMITS.lat[1]) errors.lat = `Latitude must be ${LIMITS.lat[0]}–${LIMITS.lat[1]}.`;
  if (draft.lon.trim() === "" || !Number.isFinite(lon) || lon < LIMITS.lon[0] || lon > LIMITS.lon[1]) errors.lon = `Longitude must be ${LIMITS.lon[0]}–${LIMITS.lon[1]}.`;
  return errors;
}
