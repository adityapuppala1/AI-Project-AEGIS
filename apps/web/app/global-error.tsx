"use client";

import "@fontsource-variable/anek-latin/wdth.css";
import "./globals.css";

// Shown when the root layout itself fails, so it cannot rely on any provider. Plain text, English only.
export default function GlobalError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return <html lang="en"><body className="min-h-screen bg-canvas font-sans text-ink antialiased">
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-10">
      <strong className="mb-8 text-base font-bold tracking-[.12em]">AEGIS</strong>
      <div className="desk-strip mb-6 rounded-md border border-stroke"><span className="exercise-tape">EXERCISE<small>No live warnings or dispatch</small></span></div>
      <h1 className="t-display">AEGIS could not start this page</h1>
      <p className="mt-3 text-sm leading-6 text-muted">The application stopped while loading. No record was changed. Try again; if it keeps happening, tell your administrator.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" className="control control-primary" onClick={reset}>Retry</button>
        <a href="/" className="control">Back to Command Center</a>
      </div>
    </main>
  </body></html>;
}
