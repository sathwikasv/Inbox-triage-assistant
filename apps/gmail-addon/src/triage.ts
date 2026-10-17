import { runTriage, lintDraft, daysBetween, type Decision, type ThreadFacts } from "@c16/core";
import { combineType, decideBucket, detectSensitive, trustScore, type Level, type MailType } from "./logic";
import { aiEnabled, classifyWithGemini, draftWithGemini, type DraftFacts, type MailContext } from "./gemini";
import { applyTriageLabels, iso, loadMessage, me, replaceDraft, type LoadedMessage } from "./gmail";
import { audit, getRecord, getSettings, saveRecord, type TriageRecord } from "./store";

const RANK: Record<Level, number> = { low: 0, medium: 1, high: 2 };
const LEVELS: Level[] = ["low", "medium", "high"];

/** Run the C16 rules engine over the thread so facts (deadlines, owners, corrections, duplicates) come from rules. */
function rulesFor(L: LoadedMessage): { d: Decision; t: ThreadFacts; template: string | null } | null {
  const emails = [...L.earlier.slice(-8), L.msg]
    .map((m) => ({ email_id: m.getId(), subject: m.getSubject() || "(no subject)", body: m.getId() === L.id ? L.body : m.getPlainBody(), received_at: iso(m.getDate()) }))
    .filter((e) => e.body.trim().length > 0);
  if (!emails.some((e) => e.email_id === L.id)) return null;
  const r = runTriage({ case_id: "C16", records: { emails, policy: { draft_only: true, auto_send: false } } });
  const d = r.decisions.find((x) => x.email_id === L.id)!;
  const t = r.threads.find((x) => x.thread_key === d.thread_key)!;
  return { d, t, template: r.drafts.find((x) => x.thread_key === t.thread_key && x.lint_ok)?.body ?? null };
}

function context(L: LoadedMessage, trust: number, trustReasons: string[]): MailContext {
  return {
    mailboxOwner: me(),
    sender: { name: L.from.name, email: L.from.email, prior: L.prior, replied: L.replied, trust, trustReasons },
    subject: L.subject,
    body: L.body,
    thread: L.earlier.slice(-5).map((m) => ({ from: m.getFrom(), date: iso(m.getDate()), body: m.getPlainBody().slice(0, 1200) })),
    senderRecent: L.senderRecent,
  };
}

export function triageMessage(messageId: string, opts: { apply: boolean; draft: boolean }): TriageRecord {
  const settings = getSettings();
  const L = loadMessage(messageId);
  const rules = rulesFor(L);
  const previous = getRecord(messageId);

  const sens = detectSensitive(`${L.subject}\n${L.body}`);
  const hasAsk = !!rules && (rules.d.action_needed || rules.d.facts.some((f) => f.kind === "due"));
  const trust = trustScore({ fromName: L.from.name, fromEmail: L.from.email, replyTo: L.replyTo, authResults: L.auth, priorMessages: L.prior, userReplied: L.replied, subject: L.subject, body: L.body, links: L.links, hasAsk });
  const ctx = context(L, trust.score, trust.reasons);

  const ai = aiEnabled() ? classifyWithGemini(ctx) : null;
  const aiValue = ai && ai.ok ? ai.value : null;
  const ruleType = (rules?.d.purpose ?? "fyi") as MailType;
  const fallback = !rules || /no rule matched/.test(rules.d.review.reason);
  let combined = combineType({ type: ruleType, fallback }, aiValue ? { type: aiValue.type, confidence: aiValue.confidence } : null);
  // Bulk mail (List-Unsubscribe) with no personal ask is a promotion, whatever its wording ("the sale is live").
  if (L.hasUnsubscribe && !hasAsk && !["injection", "sensitive"].includes(combined.type)) combined = { ...combined, type: "promotion", confidence: Math.max(combined.confidence, 0.8) };

  // Urgency: rules and AI; urgency words alone (spoofed urgency) never raise it.
  const rulesUrgency: Level = rules ? (rules.d.urgency === "n/a" ? "low" : rules.d.urgency) : "low";
  const aiUrgency = aiValue?.urgency ?? rulesUrgency;
  let urgency = LEVELS[Math.max(RANK[rulesUrgency], RANK[aiUrgency])];
  if (trust.spoofedUrgency) urgency = LEVELS[Math.min(RANK[rulesUrgency], RANK[aiUrgency])];
  const importance: Level = aiValue?.importance ?? (rules?.d.action_needed ? "high" : "low");
  const t = rules?.t;
  const today = iso(new Date());
  const dueInDays = t?.latest_due ? daysBetween(today, t.latest_due) : null;
  const owner = t?.owner !== undefined ? t.owner : (aiValue?.owner ?? undefined);
  const actionNeeded = !!rules?.d.action_needed || (!!aiValue?.reply_needed && !["fyi", "promotion", "resolution", "status_update"].includes(combined.type));
  const reviewFlag = combined.agreement === "disagree" ? `rules said ${ruleType}, AI said ${aiValue?.type}` : null;

  const { bucket, reason } = decideBucket({
    type: combined.type,
    urgency,
    importance,
    actionNeeded,
    owner,
    me: me(),
    dueInDays,
    sensitive: sens.sensitive || !!aiValue?.sensitive,
    trust: trust.score,
    confidence: combined.confidence,
    reviewFlag,
  });

  const rec: TriageRecord = {
    messageId,
    threadId: L.thread.getId(),
    at: new Date().toISOString(),
    from: L.from.name || L.from.email,
    fromEmail: L.from.email,
    subject: L.subject,
    type: combined.type,
    bucket,
    bucketReason: reason,
    urgency,
    importance,
    confidence: Math.round(combined.confidence * 100) / 100,
    agreement: combined.agreement,
    trust: trust.score,
    trustReasons: trust.reasons,
    spoofedUrgency: trust.spoofedUrgency,
    sensitiveReasons: [...sens.reasons, ...(aiValue?.sensitive && aiValue.sensitive_reason ? [aiValue.sensitive_reason] : [])],
    rulesWhy: rules?.d.explain.purpose ?? "no rules result",
    ai: aiValue ? { type: aiValue.type, confidence: aiValue.confidence, reason: aiValue.reason } : null,
    aiError: ai && !ai.ok ? ai.error : null,
    facts: (rules?.d.facts ?? []).filter((f) => !f.superseded_by).map((f) => ({ kind: f.kind, value: f.value, quote: f.evidence.quote })),
    dueInDays,
    owner: owner ?? null,
    senderPrior: L.prior,
    draftId: previous?.draftId ?? null,
    draftStatus: previous?.draftStatus ?? "none",
    draftNote: previous?.draftNote ?? "",
    draftPreview: previous?.draftPreview ?? "",
  };

  if (opts.apply && settings.applyLabels) applyTriageLabels(L.thread, bucket, combined.type, bucket === "fyi");
  if (opts.draft) makeDraft(rec, L, rules, ctx);
  saveRecord(rec);
  audit("triage", rec, reason);
  return rec;
}

/** Grounded draft: Gemini (2 tries, each checked by the lint) → rules template → otherwise a person. Never sent. */
export function makeDraft(rec: TriageRecord, L: LoadedMessage, rules: ReturnType<typeof rulesFor>, ctx: MailContext) {
  const settings = getSettings();
  if (rec.bucket === "review" || rec.bucket === "fyi") {
    rec.draftStatus = rec.bucket === "review" ? "needs_human" : "skipped";
    rec.draftNote = rec.bucket === "review" ? `no draft: ${rec.bucketReason}` : "no reply needed";
    return;
  }
  const t = rules?.t;
  const facts: DraftFacts = {
    task: t?.task,
    owner: t?.owner,
    latestDue: t?.latest_due ?? null,
    references: t?.references ?? [],
    clarify: t?.clarify ?? [],
    constraints: t?.constraints ?? [],
    attachmentClaimed: !!t?.attachment_claimed,
    type: rec.type,
    bucket: rec.bucket,
  };
  let body: string | null = null;
  let note = "";
  if (aiEnabled()) {
    let problems: string[] = [];
    for (let attempt = 0; attempt < 2 && !body; attempt++) {
      const r = draftWithGemini(ctx, facts, settings.signature, problems);
      if (!r.ok) {
        note = `AI draft failed: ${r.error}`;
        break;
      }
      if (r.needsHuman) {
        rec.draftStatus = "needs_human";
        rec.draftNote = `the AI declined: ${r.reason}`;
        return;
      }
      const lint = t ? lintDraft(r.reply, t) : { ok: true, violations: [] };
      if (lint.ok && r.reply) body = r.reply;
      else problems = lint.violations.map((v) => `"${v.term}": ${v.reason}`);
    }
    if (!body && !note) note = "AI drafts failed the claims check twice; used the rules template";
  }
  if (!body && rules?.template) body = rules.template;
  if (!body) {
    rec.draftStatus = "failed";
    rec.draftNote = note || "no safe draft could be written; a person should reply";
    return;
  }
  rec.draftId = replaceDraft(L.msg, rec.draftId, body);
  rec.draftStatus = "created";
  rec.draftNote = note || (aiEnabled() ? "written by AI from the thread and facts; passed the claims check" : "rules template; passed the claims check");
  rec.draftPreview = body.slice(0, 1200);
  audit("draft", rec, rec.draftNote);
}

/** Re-draft on demand from the card. */
export function redraft(messageId: string): TriageRecord {
  const rec = triageMessage(messageId, { apply: false, draft: false });
  const L = loadMessage(messageId);
  const ctx = context(L, rec.trust, rec.trustReasons);
  makeDraft(rec, L, rulesFor(L), ctx);
  saveRecord(rec);
  return rec;
}
