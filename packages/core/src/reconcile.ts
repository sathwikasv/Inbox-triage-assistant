import type { AnalyzedEmail } from "./analyze.js";
import type { Decision, DueEntry, Fact, ProposedActions, Purpose, TaskStatus, ThreadFacts, Urgency } from "./types.js";
import { QUARANTINE, type ThreadAssignment } from "./threading.js";
import { classifyUrgency } from "./classify.js";

const ACTION_PURPOSES = new Set(["request", "correction", "blocker", "question"]);
const time = (a: AnalyzedEmail) => (a.email.received_at ? Date.parse(a.email.received_at) : Number.POSITIVE_INFINITY);

function ev(a: AnalyzedEmail, quote: string | null | undefined): Fact["evidence"] {
  // Evidence must be an exact substring of the source body; fall back to the whole fresh text.
  const q = quote && a.email.body.includes(quote) ? quote : a.fresh;
  return { email_id: a.email.email_id, quote: q };
}

/** Build per-email decisions and per-thread facts. Emails must be sorted by received_at. */
export function reconcile(items: AnalyzedEmail[], assign: Map<string, ThreadAssignment>): { decisions: Decision[]; threads: ThreadFacts[] } {
  const byThread = new Map<string, AnalyzedEmail[]>();
  for (const a of items) {
    const k = assign.get(a.email.email_id)!.thread_key;
    byThread.set(k, [...(byThread.get(k) ?? []), a]);
  }

  const decisions = new Map<string, Decision>();
  const threads: ThreadFacts[] = [];

  for (const [key, list] of byThread) {
    list.sort((x, y) => time(x) - time(y) || x.email.email_id.localeCompare(y.email.email_id, "en", { numeric: true }));
    const t: ThreadFacts = {
      thread_key: key,
      title: assign.get(list[0].email.email_id)!.title,
      due_history: [],
      status: key === QUARANTINE ? "quarantined" : "open",
      action_needed: false,
      references: [],
      attachment_claimed: false,
      attachment_verified: false,
      suppress_chaser: false,
      escalation: null,
      duplicate_count: 0,
      watch_date: null,
      clarify: [],
      constraints: [],
      inferred_links: [],
      draft_mode: "none",
      draft_reason: "",
      email_ids: list.map((a) => a.email.email_id),
      next_action: { kind: "archive", label: "", reason: "" }, // set by route()
      escalations: [],
      last_activity: null,
      age_days: null,
    };
    let hadWork = false;
    let noChase = false;

    for (const a of list) {
      const id = a.email.email_id;
      const as = assign.get(id)!;
      if (as.inferred) t.inferred_links.push({ email_id: id, rule: as.rule });
      const facts: Fact[] = [];
      const notes: string[] = [];
      const purpose: Purpose = as.exact_duplicate_of ? "duplicate" : a.purpose;
      const d: Decision = {
        email_id: id,
        subject: a.email.subject,
        body: a.email.body,
        received_at: a.email.received_at,
        thread_key: key,
        purpose,
        urgency: "low",
        action_needed: false,
        status: "open",
        facts,
        proposed: { labels: [], archive: false, reason: "" },
        explain: { purpose: as.exact_duplicate_of ? `identical text to ${as.exact_duplicate_of}` : a.purpose_why, urgency: "", thread: as.rule },
        notes,
        age_days: null,
        ai: a.ai,
        review: a.review,
      };
      if (a.quoted) notes.push("quoted history ignored for facts and actions");
      const dueDates = a.dates.filter((x) => x.date && (x.cue === "due" || purpose === "correction"));

      switch (purpose) {
        case "injection":
          for (const f of a.injection.findings) facts.push({ kind: "injection", value: f.why, evidence: ev(a, f.quote) });
          t.escalation = "suspicious instruction; route to a human for security review";
          notes.push("no task, draft or label/archive action is created from this email; policy is unchanged");
          break;

        case "request": {
          hadWork = true;
          if (t.status === "closed") notes.push("new request after the item was closed; reopened");
          if (!t.task || t.status === "closed") t.task = a.task ?? undefined;
          if (a.task) facts.push({ kind: "task", value: a.task, evidence: ev(a, a.fresh.split(/(?<=[.;!?])\s/)[0]) });
          if (a.owner?.kind === "named") {
            t.owner = a.owner.owner;
            t.escalation = null;
            facts.push({ kind: "owner", value: a.owner.owner, evidence: ev(a, a.owner.quote) });
          } else if (a.owner?.kind === "unowned") {
            t.owner = null;
            t.escalation = "no confirmed owner; assign one before work starts";
            facts.push({ kind: "escalation", value: "no confirmed owner", evidence: ev(a, a.owner.quote) });
          }
          t.status = t.owner === null ? "needs_review" : "open";
          d.action_needed = true;
          break;
        }

        case "correction":
          hadWork = true;
          d.action_needed = true;
          if (!dueDates.length) notes.push("correction without a date; nothing to supersede");
          break;

        case "duplicate":
          t.duplicate_count++;
          notes.push("counted once: no new task is created");
          break;

        case "resolution":
          t.status = "closed";
          t.suppress_chaser = true;
          facts.push({ kind: "status", value: "resolved", evidence: ev(a, a.status.resolved) });
          if (a.status.no_chase) {
            noChase = true;
            facts.push({ kind: "status", value: "do not chase", evidence: ev(a, a.status.no_chase) });
          }
          break;

        case "status_update":
          if (t.status !== "closed") t.status = "in_progress";
          facts.push({ kind: "status", value: "in progress (not complete)", evidence: ev(a, a.status.in_progress) });
          notes.push('"almost done" is not completion; the item stays open');
          break;

        case "blocker":
          hadWork = true;
          if (!t.task) t.task = a.task ?? undefined;
          t.status = "blocked";
          if (a.task) facts.push({ kind: "task", value: a.task, evidence: ev(a, a.status.blocked) });
          d.action_needed = true;
          break;

        case "fyi":
          if (a.already_tracked) notes.push("already tracked elsewhere; no new ticket");
          break;

        case "commitment":
          if (a.task) facts.push({ kind: "commitment", value: `sender will ${a.task}`, evidence: ev(a, a.fresh) });
          notes.push("the sender's action, not ours; watch for it");
          break;

        case "question":
          hadWork = true;
          t.clarify.push(...a.clarify);
          if (a.clarify.length) facts.push({ kind: "clarify", value: a.clarify.join("; "), evidence: ev(a, a.fresh) });
          d.action_needed = true;
          break;
      }

      // Facts that can appear on any purpose (except quarantined content, which is never trusted).
      if (purpose !== "injection") {
        for (const r of a.references) {
          if (!t.references.includes(r)) t.references.push(r);
          facts.push({ kind: "reference", value: r, evidence: ev(a, a.already_tracked ? a.fresh : r) });
        }
        if (a.status.attachment_claim) {
          t.attachment_claimed = true;
          facts.push({ kind: "attachment_claim", value: "claimed, unverified", evidence: ev(a, a.status.attachment_claim) });
        }
        if (a.status.constraint) {
          t.constraints.push(a.status.constraint.replace(/[.;!]+$/, ""));
          facts.push({ kind: "constraint", value: a.status.constraint.replace(/[.;!]+$/, ""), evidence: ev(a, a.status.constraint) });
        }
        if (purpose === "commitment") {
          const w = a.dates.find((x) => x.date);
          if (w) t.watch_date = w.date;
        } else {
          for (const x of dueDates) {
            const entry: DueEntry = { date: x.date!, email_id: id, quote: x.sentence, from_correction: purpose === "correction" };
            const fact: Fact = { kind: "due", value: x.date!, evidence: ev(a, x.sentence) };
            if (entry.from_correction) {
              const replaced = t.due_history.filter((h) => !h.superseded_by);
              replaced.forEach((h) => (h.superseded_by = id));
              if (replaced.length) fact.supersedes = replaced.map((h) => h.email_id);
            } else if (t.due_history.some((h) => h.from_correction && !h.superseded_by)) {
              // A plain date never overrides an explicit correction, even if it arrives later.
              entry.superseded_by = t.due_history.find((h) => h.from_correction && !h.superseded_by)!.email_id;
              notes.push("date is older than an explicit correction in this thread; ignored");
            } else {
              t.due_history.filter((h) => !h.superseded_by).forEach((h) => (h.superseded_by = id));
            }
            t.due_history.push(entry);
            facts.push(fact);
          }
        }
      }

      if (a.email.received_at === null && purpose !== "injection") {
        notes.push("received_at is unknown (null); not used for ordering or relative dates; needs review");
        d.action_needed = true;
      }
      d.status = statusFor(purpose, t.status, a.email.received_at);
      decisions.set(id, d);
    }

    // Close out the thread.
    t.latest_due = t.due_history.find((h) => !h.superseded_by)?.date ?? null;
    for (const h of t.due_history) {
      if (!h.superseded_by) continue;
      for (const f of decisions.get(h.email_id)!.facts) if (f.kind === "due" && f.value === h.date) f.superseded_by = h.superseded_by;
    }
    const firstRequest = list.find((a) => a.purpose === "request");
    for (const a of list) {
      const d = decisions.get(a.email.email_id)!;
      if (d.purpose !== "duplicate") continue;
      const orig = assign.get(a.email.email_id)!.exact_duplicate_of ?? firstRequest?.email.email_id;
      if (orig && orig !== d.email_id) d.duplicate_of = orig;
      else d.notes.push("duplicate of a request that is not in this import; needs review");
    }
    t.action_needed = key !== QUARANTINE && hadWork && ["open", "needs_review", "blocked"].includes(t.status) && list.some((a) => ACTION_PURPOSES.has(a.purpose));
    if (key === QUARANTINE) [t.draft_mode, t.draft_reason] = ["none", "quarantined: no reply is drafted; a human reviews it"];
    else if (t.status === "closed" && noChase) [t.draft_mode, t.draft_reason] = ["none", "resolved and the sender asked not to chase"];
    else if (t.status === "closed") [t.draft_mode, t.draft_reason] = hadWork ? ["ack", "acknowledge the resolution"] : ["none", "resolved; nothing to reply to"];
    else if (t.action_needed) [t.draft_mode, t.draft_reason] = ["reply", t.escalation ? "reply and ask for an owner" : "reply to the open request"];
    else if (list.some((a) => a.purpose === "commitment")) [t.draft_mode, t.draft_reason] = ["ack", "optional acknowledgement of the sender's commitment"];
    else [t.draft_mode, t.draft_reason] = ["none", "informational; no reply needed"];
    threads.push(t);
  }

  // Duplicates take the status of the request they repeat.
  for (const d of decisions.values()) if (d.duplicate_of && decisions.has(d.duplicate_of)) d.status = decisions.get(d.duplicate_of)!.status;

  // Urgency: originals first, then duplicates (which sit one level below their original).
  const tByKey = new Map(threads.map((t) => [t.thread_key, t]));
  const ordered = items.map((a) => a.email.email_id);
  for (const pass of [false, true]) {
    for (const a of items) {
      const d = decisions.get(a.email.email_id)!;
      if ((d.purpose === "duplicate") !== pass) continue;
      const own = d.facts.find((f) => f.kind === "due" && !f.superseded_by)?.value ?? d.facts.find((f) => f.kind === "due")?.value;
      const u = classifyUrgency({
        purpose: d.purpose,
        text: a.fresh,
        received_at: a.email.received_at,
        due: own ?? null,
        owner_missing: d.facts.some((f) => f.kind === "escalation"),
        original_urgency: d.duplicate_of ? decisions.get(d.duplicate_of)?.urgency : undefined,
      });
      d.urgency = u.urgency;
      d.explain.urgency = u.why;
      d.proposed = propose(d, tByKey.get(d.thread_key)!);
    }
  }
  return { decisions: ordered.map((id) => decisions.get(id)!), threads };
}

function statusFor(purpose: string, threadStatus: TaskStatus, receivedAt: string | null): TaskStatus {
  if (purpose === "injection") return "quarantined";
  if (receivedAt === null) return "needs_review";
  if (purpose === "fyi") return "closed";
  return threadStatus;
}

/** Label/archive suggestions for the preview panel. Never executed by any part of the system. */
function propose(d: Decision, t: ThreadFacts): ProposedActions {
  const urgent: Urgency[] = ["high"];
  if (d.purpose === "injection") return { labels: ["Quarantine", "Security review"], archive: false, reason: "suspicious mail is never archived automatically" };
  if (d.purpose === "duplicate") return { labels: ["Duplicate"], archive: true, reason: `merged into ${d.duplicate_of ?? "the original request"}` };
  if (t.status === "closed") return { labels: ["Resolved"], archive: true, reason: "thread is resolved" };
  if (d.purpose === "fyi") return { labels: ["FYI", ...t.references.map((r) => `Tracked: ${r}`)], archive: true, reason: "informational; already tracked" };
  if (d.purpose === "commitment") return { labels: ["Waiting on sender", ...(t.watch_date ? [`Follow up ${t.watch_date}`] : [])], archive: false, reason: "watch for the sender's action" };
  if (d.purpose === "status_update") return { labels: ["In progress"], archive: false, reason: "not complete yet" };
  const labels = ["Action"];
  if (urgent.includes(d.urgency)) labels.push("Urgent");
  if (t.escalation) labels.push("Needs owner");
  if (t.status === "blocked") labels.push("Blocked");
  return { labels, archive: false, reason: "open work stays in the inbox" };
}
