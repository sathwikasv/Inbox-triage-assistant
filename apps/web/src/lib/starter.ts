import { fixtureHash, type Labels } from "@c16/core";
import starter from "../../../../data/fixture/C16/fixture.json";
import rawLabels from "../../../../data/labels/C16_labels.json";

export const STARTER_FIXTURE: unknown = starter;
export const LABELS = rawLabels as unknown as Labels;
export const STARTER_HASH = fixtureHash(starter);

/** Labels are ground truth for the starter fixture only; changed inputs are judged against data/challenges/README.md. */
export function labelsFor(hash: string): Labels | undefined {
  return hash === STARTER_HASH ? LABELS : undefined;
}

/** Judge-style changed inputs, picked up automatically from data/challenges/*.json. */
export const CHALLENGES: { name: string; load: () => Promise<unknown> }[] = Object.entries(
  import.meta.glob("../../../../data/challenges/*.json", { import: "default" }),
).map(([path, load]) => ({ name: path.split("/").pop()!, load: load as () => Promise<unknown> }));
