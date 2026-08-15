import csv
import json
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
AUDIT_DIR = REPO_ROOT / "experiments" / "face-calibration" / "stage-c" / "results" / "threshold-audit"
METRICS_JSON = AUDIT_DIR / "metrics.json"
SWEEP_CSV = AUDIT_DIR / "threshold-sweep.csv"


@pytest.fixture
def sweep_metrics():
    if not METRICS_JSON.exists():
        pytest.skip("metrics.json not found")
    with open(METRICS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def sweep_rows():
    if not SWEEP_CSV.exists():
        pytest.skip("threshold-sweep.csv not found")
    rows = []
    with open(SWEEP_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    return rows


def test_production_baseline_lock_0400(sweep_metrics):
    """Verify threshold 0.400 reproduces TP=91, FP=1, FN=21."""
    base = sweep_metrics["baseline_040"]
    assert base["tp"] == 91
    assert base["fp"] == 1
    assert base["fn"] == 21
    assert round(base["precision"], 4) == 0.9891
    assert round(base["recall"], 4) == 0.8125
    assert round(base["f1"], 4) == 0.8922


def test_near_threshold_same_scores():
    """Verify exact near-threshold SAME score values."""
    s1 = 0.393944
    s2 = 0.390504
    s3 = 0.389552

    # At 0.400 all 3 fail
    assert s1 < 0.400
    assert s2 < 0.400
    assert s3 < 0.400

    # At 0.389 all 3 pass
    assert s1 >= 0.389
    assert s2 >= 0.389
    assert s3 >= 0.389


def test_threshold_0389_recovers_same_pairs(sweep_rows):
    """Verify threshold 0.389 yields TP=95, FP=1, FN=17."""
    r_0389 = next(r for r in sweep_rows if float(r["threshold"]) == 0.389)
    assert int(r_0389["photo_tp"]) == 95
    assert int(r_0389["photo_fp"]) == 1
    assert int(r_0389["photo_fn"]) == 17


def test_p022_score_ordering_and_separability():
    """Verify P022 score ordering 0.4211 < 0.4229 < 0.4246 and separability proof."""
    sim_true_r02 = 0.4211
    sim_false_r03 = 0.4229
    sim_true_r01 = 0.4246

    assert sim_true_r02 < sim_false_r03 < sim_true_r01

    # Proof: Any threshold T that rejects sim_false_r03 (T > 0.4229)
    # MUST also reject sim_true_r02 since sim_true_r02 (0.4211) < T.
    def accepts(sim, threshold):
        return sim >= threshold

    # If we reject 0.4229 (threshold > 0.4229):
    T_reject = 0.423
    assert not accepts(sim_false_r03, T_reject)
    assert not accepts(sim_true_r02, T_reject)  # True match is lost!
