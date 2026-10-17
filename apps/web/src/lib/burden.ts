import { correctionBurden, type Draft } from "@c16/core";
import type { SavedRun } from "../repo";

/** Burden against the closest suggested tone, so picking "Formal" alone does not count as rewriting. */
export function burdenOf(d: Draft, body: string) {
  const bases = [d.body, ...Object.values(d.tones ?? {})].filter((x): x is string => !!x);
  return bases.map((b) => correctionBurden(b, body)).sort((a, b) => a.ratio - b.ratio)[0];
}

/** The pilot metric over a run: how much of each suggested reply people had to change. */
export function runBurden(run: SavedRun) {
  const rows = run.result.drafts.map((d) => {
    const final = run.edits[d.thread_key]?.body;
    return { thread_key: d.thread_key, edited: !!final, ...(final ? burdenOf(d, final) : { changed_words: 0, total_words: 0, ratio: 0 }) };
  });
  const edited = rows.filter((r) => r.edited);
  const avg = edited.length ? edited.reduce((s, r) => s + r.ratio, 0) / edited.length : 0;
  return { rows, drafts: rows.length, edited: edited.length, unchanged: rows.length - edited.length + edited.filter((r) => r.ratio === 0).length, avg };
}
