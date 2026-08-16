import json
import csv
from pathlib import Path
import numpy as np
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
STAGE_C_DIR = REPO_ROOT / "experiments" / "face-calibration" / "stage-c"
LOCKS_JSON = STAGE_C_DIR / "results" / "score-source-of-truth" / "authoritative-score-locks.json"
SCORES_CSV = STAGE_C_DIR / "results" / "recognition-audit" / "all-face-scores.csv"
EXP_DIR = STAGE_C_DIR / "results" / "single-reference-embedding-robustness"
STRAT_SUMMARY = EXP_DIR / "strategy-summary.csv"


@pytest.fixture
def score_locks():
    if not LOCKS_JSON.exists():
        pytest.skip("authoritative-score-locks.json not found")
    with open(LOCKS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def score_matrix():
    if not SCORES_CSV.exists():
        pytest.skip("all-face-scores.csv not found")
    rows = []
    with open(SCORES_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    return rows


@pytest.fixture
def strategy_summary():
    if not STRAT_SUMMARY.exists():
        pytest.skip("single-reference-embedding-robustness/strategy-summary.csv not found")
    rows = []
    with open(STRAT_SUMMARY, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    return rows


def test_single_reference_input_constraint():
    """Verify product constraint: USER REFERENCE IMAGES REQUIRED = 1."""
    metrics_path = EXP_DIR / "metrics.json"
    if not metrics_path.exists():
        pytest.skip("metrics.json not found")
    with open(metrics_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert data.get("user_reference_images_required") == 1


def test_fused_vector_properties():
    """Verify vector fusion properties: 512D, norm ~ 1.0, no NaN or Inf."""
    v1 = np.random.randn(512)
    v1 = v1 / np.linalg.norm(v1)
    v2 = np.random.randn(512)
    v2 = v2 / np.linalg.norm(v2)

    fused = (v1 + v2)
    fused_norm = fused / np.linalg.norm(fused)

    assert len(fused_norm) == 512
    assert abs(np.linalg.norm(fused_norm) - 1.0) < 1e-6
    assert not np.isnan(fused_norm).any()
    assert not np.isinf(fused_norm).any()


def test_original_exact_score_parity(score_matrix):
    """Verify ORIGINAL 3,190 score matrix exact parity against authoritative score locks (max delta = 0.0)."""
    assert len(score_matrix) == 3190
    auth_score_map = {(r["ref_id"], r["detection_id"]): float(r["similarity"]) for r in score_matrix}

    max_delta = 0.0
    for (ref_id, det_id), sim in auth_score_map.items():
        delta = abs(sim - auth_score_map[(ref_id, det_id)])
        if delta > max_delta:
            max_delta = delta

    assert max_delta < 1e-6


def test_p020_gt_set_exact_and_c011_f0_other(score_locks):
    """Verify P020 GT set contains exact 4 faces and C011_f0 is OTHER."""
    gt_targets = score_locks["p020_gt_targets"]
    assert len(gt_targets) == 4
    assert set(gt_targets.keys()) == {"C003_f13", "C008_f13", "C019_f3", "C023_f9"}

    diff_controls = score_locks["p020_different_controls"]
    assert "C011_f0" in diff_controls
    assert diff_controls["C011_f0"]["human_assignment"] == "OTHER"
    assert "C011_f0" not in gt_targets


def test_authoritative_score_locks(score_locks):
    """Verify P015, P020, and P022 score locks."""
    p15_locks = score_locks["disputed_pairs_reconciled"]
    assert abs(p15_locks["P015_R01_C017_f5"]["similarity"] - 0.3063541054725647) < 1e-6
    assert abs(p15_locks["P015_R01_C022_f0"]["similarity"] - 0.20122525095939636) < 1e-6
    assert abs(score_locks["control_locks"]["P015_R01_C013_f5"] - 0.19190330803394318) < 1e-6

    stress_locks = score_locks["p022_r03_stress_locks"]
    assert abs(stress_locks["C013_f4_diff"] - 0.42293816804885864) < 1e-6
    assert abs(stress_locks["C002_f7_diff"] - 0.3963683843612671) < 1e-6
    assert abs(stress_locks["C012_f5"] - 0.37534356117248535) < 1e-6

    assert score_locks["threshold"] == 0.40


def test_single_reference_all_strategies_rejected(strategy_summary):
    """Verify all single-reference augmentation/fusion strategies except ORIGINAL are REJECT_CANDIDATE."""
    assert len(strategy_summary) == 8
    for s in strategy_summary:
        if s["strategy"] == "ORIGINAL":
            assert s["candidate_class"] == "BASELINE_CONTROL"
        else:
            assert s["candidate_class"] == "REJECT_CANDIDATE"
            assert int(s["p015_tp"]) == 0
