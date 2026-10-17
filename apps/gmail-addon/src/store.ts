import type { Bucket, MailType } from "./logic";

// Settings, per-message results, user corrections and the audit sheet. Script and user properties
// are small key-value stores; results are cached so opening an email is instant after a scan.

export interface Settings {
  model: string;
  autoScan: boolean;
  autoDraft: boolean;
  applyLabels: boolean;
  digest: boolean; // email the mailbox owner a digest of items needing review (to self only)
  signature: string;
  dashboardUrl: string;
}

const DEFAULTS: Settings = {
  model: "gemini-3.5-flash-lite",
  autoScan: true,
  autoDraft: true,
  applyLabels: true,
  digest: false,
  signature: "Regards",
  dashboardUrl: "",
};

const up = () => PropertiesService.getUserProperties();

export function getSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(up().getProperty("settings") ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}
export function saveSettings(s: Partial<Settings>) {
  up().setProperty("settings", JSON.stringify({ ...getSettings(), ...s }));
}

export interface TriageRecord {
  messageId: string;
  threadId: string;
  at: string;
  from: string;
  fromEmail: string;
  subject: string;
  type: MailType;
  bucket: Bucket;
  bucketReason: string;
  urgency: string;
  importance: string;
  confidence: number;
  agreement: string;
  trust: number;
  trustReasons: string[];
  spoofedUrgency: boolean;
  sensitiveReasons: string[];
  rulesWhy: string;
  ai: { type: string; confidence: number; reason: string } | null;
  aiError: string | null;
  facts: { kind: string; value: string; quote: string }[];
  dueInDays: number | null;
  owner: string | null;
  senderPrior: number;
  draftId: string | null;
  draftStatus: "created" | "skipped" | "needs_human" | "failed" | "none";
  draftNote: string;
  draftPreview: string;
}

const cache = () => CacheService.getUserCache();

export function saveRecord(r: TriageRecord) {
  const json = JSON.stringify(r);
  cache()?.put(`rec:${r.messageId}`, json, 21600);
  up().setProperty(`rec:${r.messageId}`, json.length < 8000 ? json : JSON.stringify({ ...r, draftPreview: r.draftPreview.slice(0, 500) }));
}
export function getRecord(messageId: string): TriageRecord | null {
  const raw = cache()?.get(`rec:${messageId}`) ?? up().getProperty(`rec:${messageId}`);
  return raw ? (JSON.parse(raw) as TriageRecord) : null;
}

/** User corrections become few-shot examples for the next classifications (newest 15 kept). */
export function addFeedback(text: string, type: MailType) {
  const list = getFeedbackExamples().filter((f) => f.text !== text);
  list.unshift({ text: text.slice(0, 280), type });
  up().setProperty("feedback", JSON.stringify(list.slice(0, 15)));
}
export function getFeedbackExamples(): { text: string; type: MailType }[] {
  try {
    return JSON.parse(up().getProperty("feedback") ?? "[]");
  } catch {
    return [];
  }
}

export function saveSummary(s: { at: string; counts: Record<Bucket, number>; review: { messageId: string; subject: string; reason: string }[] }) {
  up().setProperty("summary", JSON.stringify(s));
}
export function getSummary(): { at: string; counts: Record<Bucket, number>; review: { messageId: string; subject: string; reason: string }[] } | null {
  const raw = up().getProperty("summary");
  return raw ? JSON.parse(raw) : null;
}

/** Audit trail in a Google Sheet the add-on creates on first use. */
export function audit(event: string, r: Partial<TriageRecord>, detail = "") {
  try {
    const id = up().getProperty("auditSheet");
    let ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
    if (id) ss = SpreadsheetApp.openById(id);
    else {
      ss = SpreadsheetApp.create("Triagedesk audit log");
      ss.getSheets()[0].appendRow(["time", "event", "message", "from", "subject", "type", "bucket", "confidence", "trust", "draft", "detail"]);
      up().setProperty("auditSheet", ss.getId());
    }
    ss.getSheets()[0].appendRow([new Date(), event, r.messageId ?? "", r.fromEmail ?? "", r.subject ?? "", r.type ?? "", r.bucket ?? "", r.confidence ?? "", r.trust ?? "", r.draftStatus ?? "", detail]);
  } catch (e) {
    console.warn("audit failed", e);
  }
}
export const auditSheetUrl = () => {
  const id = up().getProperty("auditSheet");
  return id ? `https://docs.google.com/spreadsheets/d/${id}` : null;
};
