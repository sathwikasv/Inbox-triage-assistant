import { BUCKETS, TYPES, TYPE_LABEL, type Bucket, type MailType } from "./logic";
import { applyTriageLabels } from "./gmail";
import { aiEnabled } from "./gemini";
import { redraft, triageMessage } from "./triage";
import { installScanTrigger, refreshSummary, removeScanTrigger, scanInbox, scanTriggerInstalled } from "./scanner";
import { seedDemoInbox } from "./seed";
import { addFeedback, audit, auditSheetUrl, getRecord, getSettings, getSummary, saveRecord, saveSettings, type TriageRecord } from "./store";

// Gmail sidebar UI (Card Service). Every action records to the audit sheet; nothing is ever sent.

const ICON = "https://www.gstatic.com/images/icons/material/system/1x/inbox_black_48dp.png";
const MAIL = "https://mail.google.com/mail/u/0/";
const labelUrl = (name: string) => `${MAIL}#label/${encodeURIComponent(name).replace(/%20/g, "+")}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const trustDot = (t: number) => (t >= 70 ? "🟢" : t >= 40 ? "🟡" : "🔴");

function action(fn: string, params: Record<string, string> = {}) {
  return CardService.newAction().setFunctionName(fn).setParameters(params);
}
function notify(text: string, card?: GoogleAppsScript.Card_Service.Card) {
  const b = CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(text));
  if (card) b.setNavigation(CardService.newNavigation().updateCard(card));
  return b.build();
}
const text = (top: string, main: string, bottom?: string, wrap = true) => {
  const w = CardService.newDecoratedText().setTopLabel(top).setText(main).setWrapText(wrap);
  if (bottom) w.setBottomLabel(bottom);
  return w;
};

/* ---------------- Home ---------------- */

export function homeCard(): GoogleAppsScript.Card_Service.Card {
  const sum = getSummary();
  const card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle("Triagedesk").setSubtitle("Inbox triage · drafts only, nothing is sent").setImageUrl(ICON));

  const glance = CardService.newCardSection().setHeader("Inbox at a glance");
  if (!sum) glance.addWidget(CardService.newTextParagraph().setText("No scan yet. Click <b>Scan inbox now</b>."));
  else
    for (const b of ["do_now", "review", "delegate", "schedule", "fyi"] as Bucket[]) {
      glance.addWidget(
        text(BUCKETS[b].hint, `${BUCKETS[b].emoji} <b>${BUCKETS[b].title}</b>  ·  ${sum.counts[b] ?? 0}`)
          .setOpenLink(CardService.newOpenLink().setUrl(labelUrl(BUCKETS[b].label)))
          .setEndIcon(CardService.newIconImage().setIcon(CardService.Icon.DESCRIPTION)),
      );
    }
  glance.addWidget(
    CardService.newButtonSet()
      .addButton(CardService.newTextButton().setText("Scan inbox now").setTextButtonStyle(CardService.TextButtonStyle.FILLED).setOnClickAction(action("onScanNow")))
      .addButton(CardService.newTextButton().setText("Settings").setOnClickAction(action("onSettings"))),
  );
  card.addSection(glance);

  if (sum?.review.length) {
    const rev = CardService.newCardSection().setHeader("🟣 Needs a person");
    for (const r of sum.review) rev.addWidget(text("open in Gmail", r.subject).setOpenLink(CardService.newOpenLink().setUrl(`${MAIL}#inbox/${r.messageId}`)));
    card.addSection(rev);
  }

  const status = CardService.newCardSection().setCollapsible(true).setHeader("Status");
  status.addWidget(text("AI type check", aiEnabled() ? `on · ${getSettings().model}` : "off: add GEMINI_API_KEY in Script Properties"));
  status.addWidget(text("Auto-scan", scanTriggerInstalled() ? "every 5 minutes" : "off"));
  if (sum) status.addWidget(text("Last scan", new Date(sum.at).toLocaleString()));
  card.addSection(status);
  return card.build();
}

/* ---------------- Message ---------------- */

export function messageCard(rec: TriageRecord): GoogleAppsScript.Card_Service.Card {
  const b = BUCKETS[rec.bucket];
  const card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle(`${b.emoji} ${b.title}`).setSubtitle(rec.bucketReason));

  const decision = CardService.newCardSection().setHeader("Decision");
  const agreement = { both: "rules and AI agree", ai: "decided by AI", rules: "rules (AI off)", disagree: "rules and AI disagree" }[rec.agreement] ?? rec.agreement;
  decision.addWidget(text("Type", `<b>${TYPE_LABEL[rec.type]}</b> · ${pct(rec.confidence)}`, agreement));
  decision.addWidget(text("Urgency · importance", `${rec.urgency} · ${rec.importance}`, rec.dueInDays != null ? `due in ${rec.dueInDays} day(s)` : undefined));
  if (rec.spoofedUrgency) decision.addWidget(text("Heads-up", "⚠️ Urgent wording in the subject, but the body has no real ask or deadline. Not treated as urgent."));
  if (rec.sensitiveReasons.length) decision.addWidget(text("Sensitive", `🔒 ${rec.sensitiveReasons.join("; ")}`, "no reply is drafted; a person handles it"));
  decision.addWidget(text("Why (rules)", rec.rulesWhy));
  if (rec.ai) decision.addWidget(text("Why (AI)", `${TYPE_LABEL[rec.ai.type as MailType] ?? rec.ai.type} at ${pct(rec.ai.confidence)}: ${rec.ai.reason}`));
  else if (rec.aiError) decision.addWidget(text("AI", `unavailable: ${rec.aiError}`, "rules only"));
  card.addSection(decision);

  if (rec.facts.length || rec.owner !== null) {
    const facts = CardService.newCardSection().setHeader("Facts from the email");
    if (rec.owner === null) facts.addWidget(text("Owner", "⚠️ nobody owns this yet"));
    for (const f of rec.facts.slice(0, 6)) facts.addWidget(text(f.kind.replace("_", " "), f.value, `“${f.quote.slice(0, 90)}”`));
    card.addSection(facts);
  }

  const sender = CardService.newCardSection().setHeader("Sender").setCollapsible(true).setNumUncollapsibleWidgets(1);
  sender.addWidget(text(rec.fromEmail, `${trustDot(rec.trust)} Trust ${rec.trust}/100 · ${rec.senderPrior} earlier email(s)`));
  for (const r of rec.trustReasons) sender.addWidget(CardService.newTextParagraph().setText(r));
  card.addSection(sender);

  const draft = CardService.newCardSection().setHeader("Reply draft");
  const status = { created: "✅ Draft saved in this thread (not sent)", needs_human: "🟣 Left for a person", failed: "⚠️ No safe draft", skipped: "No reply needed", none: "No draft yet" }[rec.draftStatus];
  draft.addWidget(text("Status", status, rec.draftNote || undefined));
  if (rec.draftPreview) draft.addWidget(CardService.newTextParagraph().setText(rec.draftPreview.replace(/\n/g, "<br>")));
  const buttons = CardService.newButtonSet();
  if (rec.bucket !== "review")
    buttons.addButton(
      CardService.newTextButton()
        .setText(rec.draftStatus === "created" ? "Regenerate draft" : "Draft reply")
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(action("onDraft", { messageId: rec.messageId })),
    );
  buttons.addButton(CardService.newTextButton().setText("Open drafts").setOpenLink(CardService.newOpenLink().setUrl(`${MAIL}#drafts`)));
  draft.addWidget(buttons);
  card.addSection(draft);

  const fix = CardService.newCardSection().setHeader("Correct it (teaches the model)").setCollapsible(true);
  const bucketSel = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setTitle("Priority").setFieldName("bucket");
  for (const k of Object.keys(BUCKETS) as Bucket[]) bucketSel.addItem(`${BUCKETS[k].emoji} ${BUCKETS[k].title}`, k, k === rec.bucket);
  const typeSel = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setTitle("Type").setFieldName("type");
  for (const t of TYPES) typeSel.addItem(TYPE_LABEL[t], t, t === rec.type);
  fix.addWidget(bucketSel).addWidget(typeSel);
  fix.addWidget(CardService.newTextButton().setText("Save correction").setOnClickAction(action("onCorrect", { messageId: rec.messageId })));
  card.addSection(fix);

  const act = CardService.newCardSection().setHeader("Hand off");
  act.addWidget(
    CardService.newButtonSet()
      .addButton(CardService.newTextButton().setText("🟣 Send to human review").setOnClickAction(action("onHuman", { messageId: rec.messageId })))
      .addButton(CardService.newTextButton().setText("🟢 Mark done").setOnClickAction(action("onDone", { messageId: rec.messageId }))),
  );
  card.addSection(act);
  return card.build();
}

/* ---------------- Settings ---------------- */

export function settingsCard(): GoogleAppsScript.Card_Service.Card {
  const s = getSettings();
  const sw = (field: string, title: string, on: boolean, hint: string) =>
    CardService.newDecoratedText().setTopLabel(hint).setText(title).setWrapText(true).setSwitchControl(CardService.newSwitch().setFieldName(field).setValue("on").setSelected(on));
  const sec = CardService.newCardSection()
    .addWidget(sw("autoScan", "Auto-scan every 5 minutes", scanTriggerInstalled(), "background triage of new mail"))
    .addWidget(sw("autoDraft", "Write reply drafts", s.autoDraft, "saved as Gmail drafts, never sent"))
    .addWidget(sw("applyLabels", "Apply colour labels", s.applyLabels, "Triage/… labels in Gmail"))
    .addWidget(sw("digest", "Email me a review digest", s.digest, "to yourself only"))
    .addWidget(CardService.newTextInput().setFieldName("model").setTitle("Gemini model").setValue(s.model))
    .addWidget(CardService.newTextInput().setFieldName("signature").setTitle("Draft signature").setValue(s.signature).setMultiline(true))
    .addWidget(CardService.newTextButton().setText("Save settings").setTextButtonStyle(CardService.TextButtonStyle.FILLED).setOnClickAction(action("onSaveSettings")));
  const tools = CardService.newCardSection().setHeader("Demo tools").setCollapsible(true);
  tools.addWidget(CardService.newTextParagraph().setText("Inserts the 12 C16 fixture emails and 10 realistic examples into this mailbox. Nothing is sent. Use a spare mailbox."));
  tools.addWidget(CardService.newTextButton().setText("Seed demo inbox").setOnClickAction(action("onSeed")));
  const url = auditSheetUrl();
  if (url) tools.addWidget(CardService.newTextButton().setText("Open audit log").setOpenLink(CardService.newOpenLink().setUrl(url)));
  tools.addWidget(text("AI key", aiEnabled() ? "set" : "missing", "Apps Script → Project settings → Script properties → GEMINI_API_KEY"));
  return CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle("Settings")).addSection(sec).addSection(tools).build();
}

/* ---------------- Handlers (wired as globals in main.ts) ---------------- */

type Ev = GoogleAppsScript.Addons.EventObject & { parameters?: Record<string, string>; formInput?: Record<string, string>; formInputs?: Record<string, string[]> };

export function onHomepage() {
  return homeCard();
}

export function onGmailMessage(e: Ev) {
  const messageId = e.gmail?.messageId;
  if (!messageId) return homeCard();
  if (e.gmail?.accessToken) GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  const rec = getRecord(messageId) ?? triageMessage(messageId, { apply: true, draft: false });
  return messageCard(rec);
}

export function onDraft(e: Ev) {
  const rec = redraft(e.parameters!.messageId);
  return notify(rec.draftStatus === "created" ? "Draft saved in the thread. Review and send it yourself." : rec.draftNote || "No draft written", messageCard(rec));
}

export function onCorrect(e: Ev) {
  const id = e.parameters!.messageId;
  const rec = getRecord(id) ?? triageMessage(id, { apply: false, draft: false });
  const bucket = (e.formInput?.bucket ?? rec.bucket) as Bucket;
  const type = (e.formInput?.type ?? rec.type) as MailType;
  if (type !== rec.type) addFeedback(`${rec.subject}: ${GmailApp.getMessageById(id).getPlainBody().slice(0, 240)}`, type);
  const updated = { ...rec, bucket, type, bucketReason: "corrected by you", agreement: "user" };
  applyTriageLabels(GmailApp.getMessageById(id).getThread(), bucket, type, bucket === "fyi");
  saveRecord(updated);
  audit("correction", updated, `${rec.bucket}/${rec.type} → ${bucket}/${type}`);
  refreshSummary();
  return notify("Saved. Future emails like this will be classified this way.", messageCard(updated));
}

export function onHuman(e: Ev) {
  const id = e.parameters!.messageId;
  const rec = getRecord(id) ?? triageMessage(id, { apply: false, draft: false });
  const updated: TriageRecord = { ...rec, bucket: "review", bucketReason: "sent to human review by you" };
  applyTriageLabels(GmailApp.getMessageById(id).getThread(), "review", rec.type, false);
  saveRecord(updated);
  audit("human_review", updated, "routed to a person");
  refreshSummary();
  return notify("Routed to human review and starred.", messageCard(updated));
}

export function onDone(e: Ev) {
  const id = e.parameters!.messageId;
  const rec = getRecord(id) ?? triageMessage(id, { apply: false, draft: false });
  const updated: TriageRecord = { ...rec, bucket: "fyi", bucketReason: "marked done by you" };
  applyTriageLabels(GmailApp.getMessageById(id).getThread(), "fyi", rec.type, true);
  saveRecord(updated);
  audit("done", updated, "marked done; archive suggested");
  refreshSummary();
  return notify("Marked done. Archive is suggested, not applied.", messageCard(updated));
}

export function onScanNow() {
  const r = scanInbox(15);
  return notify(`Triaged ${r.processed} thread(s)${r.errors.length ? `, ${r.errors.length} error(s)` : ""}.`, homeCard());
}

export function onSettings() {
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(settingsCard())).build();
}

export function onSaveSettings(e: Ev) {
  const on = (f: string) => (e.formInputs?.[f] ?? []).includes("on") || e.formInput?.[f] === "on";
  saveSettings({ autoDraft: on("autoDraft"), applyLabels: on("applyLabels"), digest: on("digest"), model: e.formInput?.model || getSettings().model, signature: e.formInput?.signature ?? getSettings().signature });
  if (on("autoScan")) installScanTrigger();
  else removeScanTrigger();
  return notify("Settings saved.", settingsCard());
}

export function onSeed() {
  const r = seedDemoInbox();
  return notify(`Inserted ${r.inserted} synthetic emails. Run "Scan inbox now" next.`);
}

/** Compose: insert the saved Triagedesk draft text for the thread being replied to. */
export function onCompose(e: Ev) {
  const threadId = (e.gmail as { threadId?: string } | undefined)?.threadId;
  const thread = threadId ? GmailApp.getThreadById(threadId) : null;
  const last = thread?.getMessages().pop();
  const rec = last ? getRecord(last.getId()) : null;
  const sec = CardService.newCardSection();
  if (rec?.draftPreview) {
    sec.addWidget(CardService.newTextParagraph().setText(rec.draftPreview.replace(/\n/g, "<br>")));
    sec.addWidget(CardService.newTextButton().setText("Insert this reply").setTextButtonStyle(CardService.TextButtonStyle.FILLED).setOnClickAction(action("onInsertReply", { messageId: rec.messageId })));
  } else sec.addWidget(CardService.newTextParagraph().setText("Open the email and use <b>Draft reply</b> in the Triagedesk panel first."));
  return CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle("Triagedesk reply")).addSection(sec).build();
}

export function onInsertReply(e: Ev) {
  const rec = getRecord(e.parameters!.messageId);
  return CardService.newUpdateDraftActionResponseBuilder()
    .setUpdateDraftBodyAction(CardService.newUpdateDraftBodyAction().addUpdateContent(rec?.draftPreview ?? "", CardService.ContentType.TEXT).setUpdateType(CardService.UpdateDraftBodyType.IN_PLACE_INSERT))
    .build();
}
