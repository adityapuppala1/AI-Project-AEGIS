"use client";

// A provider's mark (docs/NETWORK_IDENTIFIER_MASTER.md): a bundled logo where one is available (Simple Icons 15.22.0,
// CC0; lib/network-logos.ts), otherwise the neutral kind icon and a monogram chip. Never a drawn or approximated logo.
import { Cable, Layers, RadioTower, Satellite, Signal, type LucideIcon } from "lucide-react";
import { LOGO_MARKS, LOGO_SET } from "../../lib/network-logos";
import { COLOURS, type Provider, type ProviderKind } from "../../lib/network-registry";

const KIND_ICON: Record<ProviderKind, LucideIcon> = { satellite: Satellite, terrestrial_mobile: Signal, terrestrial_fixed: Cable, tower_operator: RadioTower, public_reference: Layers };

/** The provider's mark: a bundled logo where one is available (Simple Icons, CC0), otherwise the kind icon and a monogram chip. */
export function ProviderMark({ provider, size = 36 }: Readonly<{ provider: Pick<Provider, "display_name" | "kind" | "monogram" | "colour_token" | "logo_key">; size?: number }>) {
  const logo = provider.logo_key ? LOGO_MARKS[provider.logo_key] : null;
  if (logo) return <span className="inline-flex shrink-0 items-center justify-center rounded-md border border-stroke bg-white" style={{ width: size, height: size }} title={`${logo.title} mark (${LOGO_SET.name}, ${LOGO_SET.licence})`}>
    <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} role="img" aria-label={`${logo.title} logo`}><path d={logo.path} fill={`#${logo.hex}`} /></svg>
  </span>;
  const Icon = KIND_ICON[provider.kind];
  return <span className="relative inline-flex shrink-0 items-center justify-center rounded-md text-white" style={{ width: size, height: size, background: COLOURS[provider.colour_token] }} aria-hidden="true">
    <span className="text-[11px] font-bold tracking-wide">{provider.monogram}</span>
    <Icon size={11} className="absolute bottom-0.5 right-0.5 opacity-80" />
  </span>;
}
