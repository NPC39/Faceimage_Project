import csv
import json
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
AUDIT_DIR = REPO_ROOT / "experiments" / "face-calibration" / "stage-c" / "results" / "quality-gate-experiment"
METRICS_JSON = AUDIT_DIR / "metrics.json"
LABELS_CSV = AUDIT_DIR / "corrected-reference-labels.csv"


@pytest.fixture
def gate_metrics():
    if not METRICS_JSON.exists():
        pytest.skip("metrics.json not found")
    with open(METRICS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def corrected_labels():
    if not LABELS_CSV.exists():
        pytest.skip("corrected-reference-labels.csv not found")
    rows = []
    with open(LABELS_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    return rows


def test_label_counts(gate_metrics, corrected_labels):
    """Verify exact corrected outcome label counts across all 22 Stage C references."""
    counts = gate_metrics["outcome_counts"]
    assert counts["STRONG"] == 13
    assert counts["ACCEPTABLE"] == 2
    assert counts["LOW_RECALL"] == 4
    assert counts["ZERO_RECALL"] == 2
    assert counts["IDENTITY_ERROR"] == 1
    assert len(corrected_labels) == 22


def test_group_counts_and_exact_sets(corrected_labels):
    """Verify exact group counts and specific reference assignments."""
    risky_refs = set(r["ref_id"] for r in corrected_labels if r["group"] == "RISKY")
    good_refs = set(r["ref_id"] for r in corrected_labels if r["group"] == "GOOD")
    low_recall_refs = set(r["ref_id"] for r in corrected_labels if r["group"] == "LOW_RECALL")

    expected_risky = {"P015_R01", "P020_R01", "P022_R03"}
    expected_low_recall = {"P015_R02", "P018_R01", "P022_R01", "P022_R02"}

    assert len(risky_refs) == 3
    assert risky_refs == expected_risky

    assert len(low_recall_refs) == 4
    assert low_recall_refs == expected_low_recall

    assert len(good_refs) == 15
    assert "P018_R02" in good_refs  # Verified P018_R02 is in Good (STRONG)


def test_baseline_candidate_rule(gate_metrics):
    """Verify baseline candidate rule (conf < 0.75 OR dark > 0.25)."""
    b_rule = gate_metrics["baseline_rule"]
    assert b_rule["risky_caught"] == 3
    assert b_rule["risky_missed"] == 0
    assert b_rule["good_warned"] == 3
    assert b_rule["low_recall_flagged"] == 2
    assert b_rule["p015_r01"] == "FLAGGED"
    assert b_rule["p020_r01"] == "FLAGGED"
    assert b_rule["p022_r03"] == "FLAGGED"
