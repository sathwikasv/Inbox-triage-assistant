import { useState } from "react";
import { runTriage, type TriageResult } from "@c16/core";

export default function ImportPage() {
  const [result, setResult] = useState<TriageResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      setResult(runTriage(json));
      setError(null);
    } catch (err) {
      setResult(null);
      setError((err as Error).message);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Import fixture</h1>
      <input type="file" accept="application/json" onChange={onFile} />
      {error && <pre className="rounded bg-red-50 p-3 text-sm text-red-700 whitespace-pre-wrap">{error}</pre>}
      {result && (
        <div className="rounded bg-white p-4 shadow text-sm">
          <div>Hash: <code>{result.fixture_hash}</code></div>
          <div>Order: {result.ordered_email_ids.join(" → ")}</div>
        </div>
      )}
    </div>
  );
}
