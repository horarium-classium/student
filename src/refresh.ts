export const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

// Native scheduler ticks drive this clock even while the window is hidden.
// A late tick (for example after sleep) makes one request, without catch-up bursts.
export class ScheduleRefresh {
  private nextAttempt: number;
  private running = false;
  constructor(private refresh: () => Promise<void>, private canRefresh: () => boolean,
    private now = Date.now) {
    this.nextAttempt = now() + REFRESH_INTERVAL_MS;
  }
  reset(): void { this.nextAttempt = this.now() + REFRESH_INTERVAL_MS; }
  async tick(): Promise<void> {
    if (this.running || this.now() < this.nextAttempt || !this.canRefresh()) return;
    this.running = true;
    this.reset();
    try { await this.refresh(); }
    finally { this.running = false; }
  }
}
