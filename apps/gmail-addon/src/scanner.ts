import { BUCKETS, type Bucket } from "./logic";
import { LABEL_DONE, ensureLabels, markProcessed, me, parseFrom } from "./gmail";
import { triageMessage } from "./triage";
import { audit, getSettings, saveSummary } from "./store";

const BUDGET_MS = 270_000; // stay inside the 6-minute trigger limit

/** Triage new inbox threads: labels, drafts, summary. Called every 5 minutes and from "Scan inbox now". */
export function scanInbox(limit = 25): { processed: number; errors: string[] } {
  const started = Date.now();
  const s = getSettings();
  ensureLabels();
  const threads = GmailApp.search(`in:inbox newer_than:14d -label:"${LABEL_DONE}"`, 0, limit);
  const errors: string[] = [];
  let processed = 0;
  for (const thread of threads) {
    if (Date.now() - started > BUDGET_MS) break;
    const last = thread.getMessages().filter((m) => parseFrom(m.getFrom()).email !== me().toLowerCase()).pop();
    if (!last) continue;
    try {
      triageMessage(last.getId(), { apply: true, draft: s.autoDraft });
      markProcessed(thread);
      processed++;
    } catch (e) {
      errors.push(`${last.getSubject()}: ${(e as Error).message}`);
    }
  }
  refreshSummary();
  if (s.digest) sendReviewDigest();
  audit("scan", {}, `${processed} threads triaged${errors.length ? `, ${errors.length} errors` : ""}`);
  return { processed, errors };
}

export function refreshSummary() {
  const counts = {} as Record<Bucket, number>;
  for (const b of Object.keys(BUCKETS) as Bucket[]) counts[b] = GmailApp.search(`in:inbox label:"${BUCKETS[b].label}"`, 0, 100).length;
  const review = GmailApp.search(`in:inbox label:"${BUCKETS.review.label}"`, 0, 5).map((t) => {
    const m = t.getMessages().pop()!;
    return { messageId: m.getId(), subject: m.getSubject(), reason: "" };
  });
  saveSummary({ at: new Date().toISOString(), counts, review });
}

/** Notify the mailbox owner (to self only) about items that need a person. Off by default. */
function sendReviewDigest() {
  const threads = GmailApp.search(`in:inbox is:unread label:"${BUCKETS.review.label}"`, 0, 10);
  if (!threads.length) return;
  const lines = threads.map((t) => `• ${t.getFirstMessageSubject()} (from ${t.getMessages().pop()!.getFrom()})`);
  GmailApp.sendEmail(me(), `Triagedesk: ${threads.length} email(s) need your review`, `These were not answered automatically because they look sensitive, unsafe or uncertain:\n\n${lines.join("\n")}\n\nOpen Gmail → label "${BUCKETS.review.label}".`);
}

export function installScanTrigger() {
  removeScanTrigger();
  ScriptApp.newTrigger("scanInbox").timeBased().everyMinutes(5).create();
}
export function removeScanTrigger() {
  for (const t of ScriptApp.getProjectTriggers()) if (t.getHandlerFunction() === "scanInbox") ScriptApp.deleteTrigger(t);
}
export const scanTriggerInstalled = () => ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === "scanInbox");
