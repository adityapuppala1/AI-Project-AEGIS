// Content-Security-Policy for every page. middleware.ts creates one fresh nonce per request; only scripts carrying
// that nonce (and scripts they load) may run, so injected markup cannot execute. The browser may contact this site
// only: every public data source and map tile is fetched server-side through /api/alert-journey/relay.
export function buildCsp(nonce: string, development = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used by React and the map library; they cannot run code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ].join("; ");
}
