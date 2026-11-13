// The one source of truth for the product name and logo shown in the browser (docs/BRANDING.md).
// The default is "IndTrana" with the built-in mark. An administrator may set another name and logo on /admin/brand;
// the API stores them and the public read (/api/brand) returns only the name and the logo version.
// The configured name is display text only. It is never rendered as HTML and never reaches staff email, CAP blocks,
// exports or audit text, which keep the code constant. No React or DOM imports, so this file is unit tested directly.

export const DEFAULT_BRAND_NAME = "IndTrana";
export const BRAND_NAME_MIN = 2;
export const BRAND_NAME_MAX = 40;
export const BRAND_LOGO_MAX_BYTES = 256 * 1024;
export const BRAND_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const NAME = /^[A-Za-z0-9 .&'-]+$/;
// Control, format (zero-width, bidi), private-use and line/paragraph separator characters.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/;

export type Brand = { name: string; logoVersion: number | null; version: number };
export const DEFAULT_BRAND: Brand = { name: DEFAULT_BRAND_NAME, logoVersion: null, version: 0 };

/** Mirrors services/api/app/brand.py validate_name: returns the trimmed name or a fixed error code. */
export function checkBrandName(raw: unknown): { ok: true; name: string } | { ok: false; code: string } {
  if (typeof raw !== "string") return { ok: false, code: "brand_name_invalid" };
  if (UNSAFE.test(raw)) return { ok: false, code: "brand_name_control_character" };
  const name = raw.trim();
  if (name.length < BRAND_NAME_MIN || name.length > BRAND_NAME_MAX) return { ok: false, code: "brand_name_length" };
  if (!NAME.test(name) || name.includes("  ") || !/[A-Za-z0-9]/.test(name)) return { ok: false, code: "brand_name_characters" };
  return { ok: true, name };
}

const version = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** Accept a public brand read only when every field is well formed; anything else is the default brand. */
export function parseBrand(data: unknown): Brand {
  if (!data || typeof data !== "object" || Array.isArray(data)) return DEFAULT_BRAND;
  const record = data as Record<string, unknown>;
  const checked = checkBrandName(record.name);
  const current = version(record.version);
  if (!checked.ok || checked.name !== record.name || current === null) return DEFAULT_BRAND;
  const logo = record.logo_version === null ? null : version(record.logo_version);
  if (record.logo_version !== null && logo === null) return DEFAULT_BRAND;
  return { name: checked.name, logoVersion: logo, version: current };
}

/** The same-origin logo address, keyed by version so a new upload is not hidden by the short cache. */
export function brandLogoUrl(brand: Brand): string | null {
  return brand.logoVersion === null ? null : `/api/brand/logo?v=${brand.logoVersion}`;
}

/** Plain-text substitution of the default name. A no-op when the brand is unchanged. Never produces markup. */
export function brandText(text: string, name: string): string {
  if (!text || name === DEFAULT_BRAND_NAME || !text.includes(DEFAULT_BRAND_NAME)) return text;
  return text.split(DEFAULT_BRAND_NAME).join(name);
}

/** The media type of a logo decided by its first bytes (the API repeats this and the structural checks). */
export function sniffLogoType(bytes: Uint8Array): (typeof BRAND_LOGO_TYPES)[number] | null {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}
