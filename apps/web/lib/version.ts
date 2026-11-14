// The one place the interface reads the product version from. The number itself lives only in apps/web/package.json
// (see docs/RELEASE_PROCESS.md); this file re-exports it so the sidebar footer, the What's new page and the account
// menu cannot disagree.
// next.config.ts copies only the version into NEXT_PUBLIC_APP_VERSION at build time, so the rest of package.json (its
// dependency list) is never bundled for the browser. The fallback is used where that is not set (tests, tooling) and
// must equal package.json: scripts/tests/release-notes.test.cjs checks it.
export const FALLBACK_VERSION = "0.3.0";
export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION || FALLBACK_VERSION;
/** "v0.3.0" for display. */
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
