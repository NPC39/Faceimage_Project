import csv
import json
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
AUDIT_DIR = REPO_ROOT / "experiments" / "face-calibration" / "stage-c" / "results" / "recognition-audit"
SCORES_CSV = AUDIT_DIR / "all-face-scores.csv"
METRICS_JSON = AUDIT_DIR / "metrics.json"


@pytest.fixture
def audit_scores():
    if not SCORES_CSV.exists():
        pytest.skip("audit scores CSV not present")
    scores = []
    with open(SCORES_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            r["similarity"] = float(r["similarity"])
            scores.append(r)
    return scores


def test_score_matrix_row_count(audit_scores):
    """Verify exactly 3,190 face-level scores exist (22 queries x 145 faces)."""
    assert len(audit_scores) == 3190, f"Expected 3190 rows, got {len(audit_scores)}"


def test_same_different_label_integrity(audit_scores):
    """Verify SAME rows match Human Assignment and DIFFERENT rows do not."""
    same_rows = [s for s in audit_scores if s["label"] == "SAME"]
    diff_rows = [s for s in audit_scores if s["label"] == "DIFFERENT"]

    assert len(same_rows) == 112, f"Expected 112 SAME rows, got {len(same_rows)}"
    assert len(diff_rows) == 3078, f"Expected 3078 DIFFERENT rows, got {len(diff_rows)}"

    for s in same_rows:
        assert s["human_assignment"] == s["query_participant"], f"SAME mismatch: {s}"

    for s in diff_rows:
        assert s["human_assignment"] != s["query_participant"], f"DIFFERENT mismatch: {s}"


def test_p022_ground_truth_lock(audit_scores):
    """Verify P022 true target face IDs are locked to C002_f0, C009_f0, C010_f10, C012_f5."""
    p022_same = [s for s in audit_scores if s["query_participant"] == "P022" and s["label"] == "SAME"]
    p022_det_ids = set(s["detection_id"] for s in p022_same)

    expected_ids = {"C002_f0", "C009_f0", "C010_f10", "C012_f5"}
    assert p022_det_ids == expected_ids, f"Expected P022 face IDs {expected_ids}, got {p022_det_ids}"


def test_p022_r03_false_positive_reproduction(audit_scores):
    """Verify P022_R03 vs C013_f4 produces similarity 0.4229 (FP)."""
    fp_entry = next(
        s for s in audit_scores
        if s["ref_id"] == "P022_R03" and s["detection_id"] == "C013_f4"
    )
    assert fp_entry["human_assignment"] == "OTHER"
    assert round(fp_entry["similarity"], 4) == 0.4229
    assert fp_entry["pass_0_40"] == "YES"
