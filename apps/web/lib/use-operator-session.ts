"use client";
import { createContext, useContext } from "react";

/**
 * The BFF session summary (never a token). The identity fields are present only when signed in.
 * `expiresAt` is in milliseconds since the epoch.
 */
export interface SessionInfo {
  authenticated: boolean; configured: boolean; roles: string[];
  subject?: string; username?: string; displayName?: string; agencyId?: string; departmentId?: string; expiresAt?: number;
}

const text = (value: unknown, max = 200): string | undefined => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
/** Re-validates the session answer: only known fields, bounded strings, roles as a string list. */
export function cleanSession(value: unknown): SessionInfo {
  const data = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const authenticated = data.authenticated === true;
  const roles = Array.isArray(data.roles) ? data.roles.filter((role): role is string => typeof role === "string").slice(0, 10) : [];
  const expires = typeof data.expiresAt === "number" && Number.isFinite(data.expiresAt) && data.expiresAt > 0 ? (data.expiresAt < 1e12 ? data.expiresAt * 1000 : data.expiresAt) : undefined;
  if (!authenticated) return { authenticated: false, configured: data.configured === true, roles: [] };
  return {
    authenticated: true, configured: data.configured === true, roles,
    subject: text(data.subject), username: text(data.username, 80), displayName: text(data.displayName, 120),
    agencyId: text(data.agencyId, 60), departmentId: text(data.departmentId, 60), expiresAt: expires,
  };
}

/** Filled by components/session-provider.tsx, which app/layout.tsx mounts once for the whole app. `null` while loading. */
export const SessionContext = createContext<SessionInfo | null>(null);

/** The signed-in session, read once for the whole app. `null` while loading. */
export function useOperatorSession(): SessionInfo | null {
  return useContext(SessionContext);
}
