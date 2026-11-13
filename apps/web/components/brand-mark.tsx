"use client";

// The logo slot. A fixed square box: an uploaded logo is contained inside it (never stretched, never shifts the
// layout, whatever its proportions); without one, or if the image fails to load, the built-in mark is shown.
import { useEffect, useState } from "react";
import { Command } from "lucide-react";
import { brandLogoUrl } from "../lib/brand";
import { useBrand } from "./brand-provider";

export function BrandMark({ size = 18, box = 32, className = "" }: Readonly<{ size?: number; box?: number; className?: string }>) {
  const { brand } = useBrand();
  const url = brandLogoUrl(brand);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) return <Command size={size} aria-hidden="true" className={className} />;
  return <img src={url} alt="" aria-hidden="true" width={box} height={box} onError={() => setFailed(true)}
    className={`brand-logo ${className}`} style={{ width: box, height: box, objectFit: "contain", display: "block" }} />;
}

/** The configured product name as plain text. */
export function BrandName() {
  return <>{useBrand().brand.name}</>;
}
