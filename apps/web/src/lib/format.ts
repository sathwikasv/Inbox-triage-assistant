import { formatDate } from "@c16/core";

/** "2026-10-16T09:00:00+05:30" → "16 Oct, 09:00" in the sender's own offset (no browser timezone shift). */
export function formatReceived(iso: string | null): string {
  if (!iso) return "time unknown";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(iso.slice(8, 10))} ${months[Number(iso.slice(5, 7)) - 1]}, ${iso.slice(11, 16)}`;
}

export const formatDay = (ymd: string | null | undefined) => (ymd ? formatDate(ymd) : "—");

export function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
