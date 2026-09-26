import { validateSchedule } from "./schedule";
import type { Schedule } from "./types";

export interface Publication {
  formatVersion: 1;
  publicId: string;
  revision: number;
  publishedAt: string;
  schoolName: string;
  className: string;
  timezone: string;
  schedule: Schedule;
}
export interface PublicationConfig { environment: string; key: string; }
export interface PublicationCache {
  version: 2;
  environment: string;
  publicId: string;
  publication: Publication | null; // null is a durable invalidation, never an offline fallback.
}
export class PublicationError extends Error {
  constructor(public readonly kind: "config" | "code" | "network" | "payload" | "format" | "timeout", message: string) { super(message); }
}
export const unavailableMessage = "Դասարանը հասանելի չէ կամ դեռ հրապարակված չէ։";
export function publicId(value: string): string {
  const id = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    throw new PublicationError("code", "Մուտքագրեք դասարանի ամբողջական UUID կոդը։");
  }
  return id;
}
export function environmentId(value: unknown): string {
  if (typeof value !== "string") throw new Error("Missing URL");
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, "") !== "" ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("Invalid URL");
  return url.origin;
}
export function publicationConfig(url: unknown, key: unknown): PublicationConfig {
  try {
    const environment = environmentId(url);
    if (typeof key !== "string" || !key.trim() || key.startsWith("sb_secret_")) throw new Error("Missing public key");
    // Legacy local anon JWTs are supported; never accept a service-role token.
    if (!key.startsWith("sb_publishable_")) {
      const payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.role !== "anon") throw new Error("Not an anon key");
    }
    return { environment, key: key.trim() };
  } catch {
    throw new PublicationError("config", "Հավելվածի Supabase կարգավորումները բացակայում են կամ անվավեր են։ Դիմեք հավելվածը տրամադրողին։");
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid object");
  return value as Record<string, unknown>;
}
export function validatePublication(value: unknown, requestedId: string): Publication {
  try {
    const row = object(value);
    if (!Number.isSafeInteger(row.formatVersion) || Number(row.formatVersion) < 1) throw new Error("Missing format version");
    if (row.formatVersion !== 1) throw new PublicationError("format", "Հրապարակման ձևաչափը չի աջակցվում։ Թարմացրեք հավելվածը։");
    if (typeof row.publicId !== "string" || publicId(row.publicId) !== publicId(requestedId)) throw new Error("Wrong class");
    if (!Number.isSafeInteger(row.revision) || Number(row.revision) <= 0) throw new Error("Invalid revision");
    if (typeof row.publishedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(row.publishedAt) || !Number.isFinite(Date.parse(row.publishedAt))) throw new Error("Invalid date");
    const datePart = row.publishedAt.slice(0, 10);
    if (new Date(`${datePart}T00:00:00Z`).toISOString().slice(0, 10) !== datePart) throw new Error("Invalid calendar date");
    for (const field of ["schoolName", "className", "timezone"]) if (typeof row[field] !== "string" || !(row[field] as string).trim()) throw new Error("Missing name/timezone");
    const timezone = row.timezone as string;
    if (/^[+-]/.test(timezone)) throw new Error("Expected IANA timezone");
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return { formatVersion: 1, publicId: publicId(row.publicId as string), revision: row.revision as number,
      publishedAt: row.publishedAt, schoolName: (row.schoolName as string).trim(), className: (row.className as string).trim(),
      timezone, schedule: validateSchedule(row.schedule) };
  } catch (error) {
    if (error instanceof PublicationError && error.kind === "format") throw error;
    throw new PublicationError("payload", "Սերվերը վերադարձրել է անվավեր հրապարակում։");
  }
}
export function validateCache(value: unknown): PublicationCache {
  const row = object(value);
  if (row.version !== 2) throw new Error("Պահոցի ձևաչափը չի աջակցվում։ Ֆայլը չի փոփոխվել։");
  const id = publicId(String(row.publicId));
  const environment = environmentId(row.environment);
  return { version: 2, environment, publicId: id, publication: row.publication === null ? null : validatePublication(row.publication, id) };
}
export function matchingCache(cache: PublicationCache | null, environment: string, id: string): Publication | null {
  return cache?.environment === environment && cache.publicId === id ? cache.publication : null;
}
export async function fetchPublication(config: PublicationConfig, code: string, fetcher: typeof fetch = fetch): Promise<Publication | null> {
  const id = publicId(code);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(`${config.environment}/rest/v1/rpc/get_published_schedule`, {
      method: "POST", headers: { apikey: config.key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_public_id: id }), cache: "no-store", signal: controller.signal,
    });
    if (!response.ok) throw new PublicationError("network", `Սերվերը հասանելի չէ (HTTP ${response.status})։`);
    let value: unknown;
    try { value = await response.json(); } catch { throw new PublicationError("payload", "Սերվերի պատասխանը վավեր JSON չէ։"); }
    return value === null ? null : validatePublication(value, id);
  } catch (error) {
    if (controller.signal.aborted) throw new PublicationError("timeout", "Բեռնման 10 վայրկյանը լրացավ։ Կրկին փորձեք։");
    if (error instanceof PublicationError) throw error;
    throw new PublicationError("network", "Ցանցային կապը հասանելի չէ։ Կրկին փորձեք։");
  } finally { clearTimeout(timeout); }
}
