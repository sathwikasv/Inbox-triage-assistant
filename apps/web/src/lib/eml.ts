// Builds an unsent reply draft as an .eml file. "X-Unsent: 1" makes Outlook (and most desktop mail apps) open
// it as an editable draft, so a person reviews it once more and presses Send in their own mail app.
// The fixture has no sender addresses, so To is left blank for the person to fill in.

const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${btoa(unescape(encodeURIComponent(s)))}?=`);

export function replySubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
}

export function quoteOriginal(emailId: string, receivedAt: string | null, body: string): string {
  const when = receivedAt ? receivedAt.replace("T", " ").slice(0, 16) : "an unknown time";
  return [`On ${when}, the sender of ${emailId} wrote:`, ...body.split(/\r?\n/).map((l) => `> ${l}`)].join("\n");
}

export function buildEml(o: { subject: string; inReplyTo: string; body: string; quoted?: string }): string {
  const text = o.quoted ? `${o.body}\n\n${o.quoted}` : o.body;
  return [
    "X-Unsent: 1",
    "To: ",
    `Subject: ${encodeHeader(replySubject(o.subject))}`,
    `In-Reply-To: <${o.inReplyTo}@c16.inbox-triage.local>`,
    `References: <${o.inReplyTo}@c16.inbox-triage.local>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "X-Generated-By: C16 Inbox Triage (draft-only; never sent by the tool)",
    "",
    text.replace(/\r?\n/g, "\r\n"),
    "",
  ].join("\r\n");
}

export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
