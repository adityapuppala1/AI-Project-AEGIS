"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toneIcon } from "./status";
import { TONE_CLASS, type Tone } from "./helpers";

interface ToastValue { notify: (message: string, tone?: Tone) => void }
const ToastContext = createContext<ToastValue>({ notify: () => undefined });

/** `const { notify } = useToast(); notify(savedMessage, "success")`. Messages are already translated. No-op without a provider. */
export const useToast = () => useContext(ToastContext);

/**
 * Provides ONE polite live region for the whole page (AppShell mounts it). Messages are announced and shown briefly;
 * they never carry an action, so anything needed to proceed must stay in the page itself.
 */
export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toast, setToast] = useState<{ message: string; tone: Tone; key: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);
  const notify = useCallback((message: string, tone: Tone = "info") => {
    counter.current += 1;
    setToast({ message, tone, key: counter.current });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const value = useMemo(() => ({ notify }), [notify]);
  const Icon = toast ? toneIcon(toast.tone) : null;
  return <ToastContext.Provider value={value}>
    {children}
    <div role="status" aria-live="polite" aria-atomic="true" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:justify-end">
      {toast && Icon && <p key={toast.key} className={`sheet-in pointer-events-auto flex max-w-md items-center gap-2 rounded-lg border border-stroke bg-surface px-4 py-3 text-sm font-semibold shadow-panel ring-1 ${TONE_CLASS[toast.tone]}`}>
        <Icon size={16} aria-hidden="true" />{toast.message}</p>}
    </div>
  </ToastContext.Provider>;
}
