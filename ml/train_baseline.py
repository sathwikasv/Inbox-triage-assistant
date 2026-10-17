"""Train and evaluate the small C16 TF-IDF/logistic baseline."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, ConfusionMatrixDisplay
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import Pipeline


ROOT = Path(__file__).resolve().parent
OUTPUTS = ROOT / "outputs"
LABELS = ROOT.parent / "data" / "labels" / "C16_labels.json"
FIXTURE = ROOT.parent / "data" / "fixture" / "C16" / "fixture.json"
SYNTHETIC_EMAILS = ROOT / "data" / "synthetic_emails.json"
SYNTHETIC_LABELS = ROOT / "data" / "synthetic_labels.csv"


def pipeline() -> Pipeline:
    return Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)),
        ("model", LogisticRegression(class_weight="balanced", max_iter=1000)),
    ])


def load_training_data() -> tuple[list[str], list[str], list[str]]:
    fixture = json.loads(FIXTURE.read_text())
    truth = {row["email_id"]: row for row in json.loads(LABELS.read_text())["labels"]}
    emails = fixture["records"]["emails"] + json.loads(SYNTHETIC_EMAILS.read_text())
    labels = [truth[email["email_id"]] for email in fixture["records"]["emails"]]
    labels += list(csv.DictReader(SYNTHETIC_LABELS.open()))
    text = [f"{email['subject']} {email['body']}" for email in emails]
    return text, [str(row["purpose"]) for row in labels], [str(row["urgency"]) for row in labels]


def save_cv_report(name: str, model: Pipeline, text: list[str], target: list[str]) -> None:
    folds = StratifiedKFold(n_splits=5, shuffle=True, random_state=16)
    predicted = cross_val_predict(model, text, target, cv=folds)
    report = classification_report(target, predicted, output_dict=True, zero_division=0)
    (OUTPUTS / f"{name}_cv.json").write_text(json.dumps(report, indent=2) + "\n")
    labels = sorted(set(target))
    display = ConfusionMatrixDisplay(confusion_matrix(target, predicted, labels=labels), display_labels=labels)
    display.plot(xticks_rotation=45)
    plt.tight_layout()
    plt.savefig(OUTPUTS / f"{name}_confusion.png")
    plt.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--eval-only", action="store_true")
    args = parser.parse_args()
    OUTPUTS.mkdir(exist_ok=True)
    text, purpose, urgency = load_training_data()
    models = {}
    for name, target in [("purpose", purpose), ("urgency", urgency)]:
        path = OUTPUTS / f"{name}.joblib"
        model = joblib.load(path) if args.eval_only and path.exists() else pipeline()
        if not args.eval_only:
            save_cv_report(name, model, text, target)
            model.fit(text, target)
            joblib.dump(model, path)
        models[name] = model
    fixture = json.loads(FIXTURE.read_text())["records"]["emails"]
    fixture_text = [f"{email['subject']} {email['body']}" for email in fixture]
    predictions = {}
    for email, sample in zip(fixture, fixture_text):
        purpose_prediction = models["purpose"].predict([sample])[0]
        urgency_prediction = models["urgency"].predict([sample])[0]
        purpose_confidence = max(models["purpose"].predict_proba([sample])[0])
        urgency_confidence = max(models["urgency"].predict_proba([sample])[0])
        predictions[email["email_id"]] = {
            "purpose": purpose_prediction,
            "urgency": urgency_prediction,
            "confidence": round(float((purpose_confidence + urgency_confidence) / 2), 4),
        }
    (OUTPUTS / "predictions.json").write_text(json.dumps(predictions, indent=2) + "\n")
    print(f"wrote predictions for {len(predictions)} fixture emails")


if __name__ == "__main__":
    main()
