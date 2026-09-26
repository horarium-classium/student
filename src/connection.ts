import { fetchPublication, matchingCache, publicId, unavailableMessage, validateCache, type Publication, type PublicationCache, type PublicationConfig } from "./publication";

export interface ConnectionStorage {
  read(): Promise<unknown>;
  begin(): Promise<number>;
  commit(token: number, record: PublicationCache, cached: boolean): Promise<void>;
}
export interface ConnectionView {
  publication: Publication | null;
  source: "online" | "cached" | "unavailable";
  message?: string;
}
export class Connection {
  selection: PublicationCache | null = null;
  private epoch = 0;
  private candidate: { token: number; epoch: number; publication: Publication } | null = null;
  constructor(private config: PublicationConfig, private storage: ConnectionStorage,
    private changed: (view: ConnectionView) => void,
    private fetcher = fetchPublication) {}
  async restore(): Promise<boolean> {
    const value = await this.storage.read();
    const cache = value === null ? null : validateCache(value);
    this.selection = cache?.environment === this.config.environment ? cache : null;
    return this.selection !== null;
  }
  cancel(): void { this.epoch++; this.candidate = null; }
  private record(publication: Publication | null, id: string): PublicationCache {
    return { version: 2, environment: this.config.environment, publicId: id, publication };
  }
  async preview(code: string): Promise<Publication | null> {
    this.cancel();
    const epoch = this.epoch, id = publicId(code);
    const token = await this.storage.begin();
    if (epoch !== this.epoch) return null;
    const publication = await this.fetcher(this.config, id);
    if (epoch !== this.epoch) return null;
    if (!publication) {
      if (this.selection?.publicId === id) await this.invalidate(token, epoch, id);
      throw new Error(unavailableMessage);
    }
    this.candidate = { token, epoch, publication };
    return publication;
  }
  async confirm(): Promise<boolean> {
    const candidate = this.candidate;
    if (!candidate || candidate.epoch !== this.epoch) return false;
    const record = this.record(candidate.publication, candidate.publication.publicId);
    await this.storage.commit(candidate.token, record, false);
    if (candidate.epoch !== this.epoch) return false;
    this.selection = record; this.candidate = null;
    this.changed({ publication: record.publication, source: "online" });
    return true;
  }
  private async invalidate(token: number, epoch: number, id: string): Promise<void> {
    const record = this.record(null, id);
    // Clear visible/speech state even if persistent storage is unavailable.
    this.selection = record;
    this.changed({ publication: null, source: "unavailable", message: unavailableMessage });
    try { await this.storage.commit(token, record, false); }
    catch (error) {
      if (epoch === this.epoch) throw new Error(`${unavailableMessage} Չհաջողվեց պահպանել անվավերացումը․ մինչև ուղղելը offline վերագործարկումը կարող է օգտագործել հին ֆայլը։ ${String(error)}`);
    }
  }
  async refresh(): Promise<void> {
    if (!this.selection) return;
    this.cancel();
    const epoch = this.epoch, id = this.selection.publicId;
    const token = await this.storage.begin();
    if (epoch !== this.epoch) return;
    let publication: Publication | null;
    try { publication = await this.fetcher(this.config, id); }
    catch (error) {
      if (epoch !== this.epoch) return;
      const cached = matchingCache(this.selection, this.config.environment, id);
      if (!cached) throw error;
      await this.storage.commit(token, this.selection, true);
      if (epoch === this.epoch) this.changed({ publication: cached, source: "cached", message: String(error instanceof Error ? error.message : error) });
      return;
    }
    if (epoch !== this.epoch) return;
    if (!publication) { await this.invalidate(token, epoch, id); return; }
    const record = this.record(publication, id);
    await this.storage.commit(token, record, false);
    if (epoch !== this.epoch) return;
    this.selection = record;
    this.changed({ publication, source: "online" });
  }
}
