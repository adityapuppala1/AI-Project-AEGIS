// Ephemeral page memory only: no browser storage, token, or server write.
export class ExerciseDraftBuffer {
  private scope = "";
  private entries = new Map<string, string>();
  setScope(subject: string, agency: string): boolean {
    const next = subject && agency ? JSON.stringify([subject, agency]) : "";
    if (next === this.scope) return false;
    this.entries.clear(); this.scope = next; return true;
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
  }
}
