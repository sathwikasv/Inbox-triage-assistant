"""Compare baseline predictions with the C16 ground-truth labels."""

from __future__ import annotations

import json
from pathlib import Path

from sklearn.metrics import accuracy_score, classification_report


ROOT = Path(__file__).resolve().parent
predictions = json.loads((ROOT / "outputs" / "predictions.json").read_text())
labels = json.loads((ROOT.parent / "data" / "labels" / "C16_labels.json").read_text())["labels"]

report: dict = {"accuracy": {}, "per_class": {}, "misclassified": []}
for target in ("purpose", "urgency"):
    expected = [row[target] for row in labels]
    actual = [predictions[row["email_id"]][target] for row in labels]
    report["accuracy"][target] = accuracy_score(expected, actual)
    report["per_class"][target] = classification_report(
        expected, actual, output_dict=True, zero_division=0
    )
    for row, got, want in zip(labels, actual, expected):
        if got != want:
            report["misclassified"].append({
                "email_id": row["email_id"],
                "target": target,
                "predicted": got,
                "expected": want,
            })

critical = {"E01", "E02", "E03", "E05", "E06", "E08", "E12"}
action_purposes = {"request", "correction", "question", "blocker", "resolution", "injection"}
recovered = sum(
    predictions[email_id]["purpose"] in action_purposes
    for email_id in critical
)
report["seeded_critical_recall"] = recovered / len(critical)
report["seeded_critical_recovered"] = recovered
(ROOT / "outputs" / "model_eval.json").write_text(json.dumps(report, indent=2) + "\n")

print("| target | accuracy |")
print("|---|---:|")
for target, value in report["accuracy"].items():
    print(f"| {target} | {value:.3f} |")
print(f"\nSeeded critical recall: {recovered}/{len(critical)} ({report['seeded_critical_recall']:.3f})")
