// Map tiles are fetched through the AEGIS relay, so tile servers never see an operator's network address and the
// page's Content-Security-Policy can stay "this site only". Used as MapLibre's transformRequest.
export function relayTileRequest(url: string): { url: string } {
  if (typeof window === "undefined" || !url.startsWith("https://")) return { url };
  return { url: window.location.origin + "/api/alert-journey/relay?u=" + encodeURIComponent(url) };
}
