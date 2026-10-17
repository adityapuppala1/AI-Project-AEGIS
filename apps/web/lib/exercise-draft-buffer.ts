// Recovery is opt-in, tab-scoped and never an authorization or server save.
const RECOVERY_KEY = "aegis.exercise.unsaved.v1";
const RETENTION_MS = 8 * 60 * 60 * 1000;
type RecoveryStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const browserStore = () => typeof window === "undefined" ? null : window.sessionStorage;
export function clearExerciseDraftRecovery(): void {
  try { browserStore()?.removeItem(RECOVERY_KEY); } catch { /* Storage may be blocked. */ }
}
export class ExerciseDraftBuffer {
  private scope = "";
  private entries = new Map<string, string>();
  private expiresAt = 0;
  constructor(private storage: () => RecoveryStore | null = browserStore,
              private clock: () => number = Date.now) {}
  private discardRecovery(): void {
    this.expiresAt = 0;
    try { this.storage()?.removeItem(RECOVERY_KEY); } catch { /* Keep page memory usable. */ }
  }
  recoveryEnabled(): boolean {
    if (this.expiresAt && this.expiresAt <= this.clock()) this.discardRecovery();
    return this.expiresAt > this.clock();
  }
  setRecovery(enabled: boolean): boolean {
    if (!enabled || !this.scope) this.discardRecovery();
    else { this.expiresAt = this.clock() + RETENTION_MS; this.persist(); }
    return this.recoveryEnabled();
  }
  private persist(): void {
    if (!this.recoveryEnabled()) return;
    try {
      const store = this.storage();
      if (!store) { this.discardRecovery(); return; }
      store.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, scope: this.scope,
        expiresAt: this.expiresAt, entries: [...this.entries] }));
    } catch { this.discardRecovery(); }
  }
  setScope(subject: string, agency: string): boolean {
    const next = subject && agency ? JSON.stringify([subject, agency]) : "";
    if (!next) this.discardRecovery();
    if (next === this.scope) { this.recoveryEnabled(); return false; }
    const prior = this.scope;
    this.entries.clear(); this.scope = next; this.expiresAt = 0;
    // Only a freshly verified session may restore; identity changes erase recovery.
    if (prior || !next) { this.discardRecovery(); return true; }
    try {
      const raw = this.storage()?.getItem(RECOVERY_KEY);
      if (!raw) return true;
      if (raw.length > 50000) throw new Error("Oversized recovery");
      const data = JSON.parse(raw);
      if (data.version !== 1 || data.scope !== next || !Number.isFinite(data.expiresAt) ||
          data.expiresAt <= this.clock() || data.expiresAt > this.clock() + RETENTION_MS ||
          !Array.isArray(data.entries) || data.entries.length > 10) throw new Error("Invalid recovery");
      const recovered = new Map<string, string>();
      for (const pair of data.entries) {
        if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" ||
            typeof pair[1] !== "string" || pair[1].length > 2000) throw new Error("Invalid entry");
        const target = JSON.parse(pair[0]);
        if (!Array.isArray(target) || target.length !== 2 || typeof target[0] !== "string" ||
            typeof target[1] !== "string" || this.key(target[0], target[1]) !== pair[0] ||
            recovered.has(pair[0])) throw new Error("Invalid target");
        recovered.set(pair[0], pair[1]);
      }
      this.entries = recovered; this.expiresAt = data.expiresAt;
    } catch { this.discardRecovery(); }
    return true;
  }
  private key(incident: string, action: string): string | null {
    return this.scope && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(incident) &&
      ["internal_triage", "prepare_warning", "propose_dispatch"].includes(action) ? JSON.stringify([incident, action]) : null;
  }
  read(incident: string, action: string): string {
    const key = this.key(incident, action); return key ? this.entries.get(key) || "" : "";
  }
  write(incident: string, action: string, text: string): void {
    const key = this.key(incident, action); if (!key) return;
    this.entries.delete(key);
    if (text) this.entries.set(key, text.slice(0, 2000));
    while (this.entries.size > 10) this.entries.delete(this.entries.keys().next().value!);
    this.persist();
  }
}
