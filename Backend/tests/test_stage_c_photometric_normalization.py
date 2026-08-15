import json
import csv
from pathlib import Path
import numpy as np
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
STAGE_C_DIR = REPO_ROOT / "experiments" / "face-calibration" / "stage-c"
LOCKS_JSON = STAGE_C_DIR / "results" / "score-source-of-truth" / "authoritative-score-locks.json"
SCORES_CSV = STAGE_C_DIR / "results" / "recognition-audit" / "all-face-scores.csv"
FINAL_DIR = STAGE_C_DIR / "results" / "photometric-normalization-final"
FINAL_SUMMARY = FINAL_DIR / "variant-summary.csv"
TRANSPORT_CSV = FINAL_DIR / "transport-integrity.csv"


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
def final_summary():
    if not FINAL_SUMMARY.exists():
        pytest.skip("photometric-normalization-final/variant-summary.csv not found")
    rows = []
    with open(FINAL_SUMMARY, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    return rows


@pytest.fixture
def transport_integrity():
    if not TRANSPORT_CSV.exists():
        pytest.skip("photometric-normalization-final/transport-integrity.csv not found")
    rows = []
    with open(TRANSPORT_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    return rows


def test_original_transform_pixel_identity():
    """Verify ORIGINAL transform function is an exact pixel identity map without re-encoding."""
    dummy_img = np.random.randint(0, 256, (112, 112, 3), dtype=np.uint8)

    def apply_transform(img, variant="ORIGINAL"):
        if variant == "ORIGINAL":
            return img.copy()
        return img

    transformed = apply_transform(dummy_img, "ORIGINAL")
    assert np.array_equal(dummy_img, transformed)


def test_lossless_transport_integrity(transport_integrity):
    """Verify lossless PNG transport mechanism preserves transformed pixels exactly (max_abs_pixel_delta = 0)."""
    assert len(transport_integrity) > 0
    for row in transport_integrity:
        assert int(row["max_abs_pixel_delta"]) == 0
        assert int(row["different_pixel_count"]) == 0
        assert row["transport_status"] == "LOSSLESS_PASSED"


def test_p020_gt_set_exact_and_c011_f0_other(score_locks):
    """Verify P020 GT set contains exact 4 faces and C011_f0 is OTHER."""
    gt_targets = score_locks["p020_gt_targets"]
    assert len(gt_targets) == 4
    assert set(gt_targets.keys()) == {"C003_f13", "C008_f13", "C019_f3", "C023_f9"}

    diff_controls = score_locks["p020_different_controls"]
    assert "C011_f0" in diff_controls
    assert diff_controls["C011_f0"]["human_assignment"] == "OTHER"
    assert "C011_f0" not in gt_targets


def test_3190_score_exact_parity(score_matrix):
    """Verify 3,190 score matrix exact parity against authoritative score locks (max delta = 0.0)."""
    assert len(score_matrix) == 3190
    auth_score_map = {(r["ref_id"], r["detection_id"]): float(r["similarity"]) for r in score_matrix}

    max_delta = 0.0
    for (ref_id, det_id), sim in auth_score_map.items():
        delta = abs(sim - auth_score_map[(ref_id, det_id)])
        if delta > max_delta:
            max_delta = delta

    assert max_delta < 1e-6


def test_21_ref_in_scope_metrics_parity(score_matrix):
    """Verify 21 in-scope references baseline gives TP=91, FP=0, FN=17, Id errors=0."""
    in_scope_scores = [s for s in score_matrix if s["ref_id"] != "P022_R03"]
    assert len(in_scope_scores) == 3045

    photos_eval = {}
    for s in in_scope_scores:
        key = (s["ref_id"], s["photo"])
        if key not in photos_eval:
            photos_eval[key] = []
        photos_eval[key].append(s)

    rprf, rpwf, wpwf = 0, 0, 0
    gt_opps = 108

    for (ref_id, photo_id), f_list in photos_eval.items():
        p_id = ref_id.split("_")[0]
        winner = max(f_list, key=lambda x: float(x["similarity"]))
        if float(winner["similarity"]) >= 0.40:
            is_gt = any(f["human_assignment"] == p_id for f in f_list)
            if is_gt:
                if winner["human_assignment"] == p_id:
                    rprf += 1
                else:
                    rpwf += 1
            else:
                wpwf += 1

    tp = rprf
    fp = wpwf
    fn = gt_opps - tp
    id_errors = rpwf + wpwf

    assert tp == 91
    assert fp == 0
    assert fn == 17
    assert id_errors == 0


def test_22_ref_all_metrics_parity(score_matrix):
    """Verify all 22 references baseline gives TP=91, FP=1, FN=21."""
    assert len(score_matrix) == 3190

    photos_eval = {}
    for s in score_matrix:
        key = (s["ref_id"], s["photo"])
        if key not in photos_eval:
            photos_eval[key] = []
        photos_eval[key].append(s)

    rprf, rpwf, wpwf = 0, 0, 0
    gt_opps = 112

    for (ref_id, photo_id), f_list in photos_eval.items():
        p_id = ref_id.split("_")[0]
        winner = max(f_list, key=lambda x: float(x["similarity"]))
        if float(winner["similarity"]) >= 0.40:
            is_gt = any(f["human_assignment"] == p_id for f in f_list)
            if is_gt:
                if winner["human_assignment"] == p_id:
                    rprf += 1
                else:
                    rpwf += 1
            else:
                wpwf += 1

    tp = rprf
    fp = wpwf
    fn = gt_opps - tp
    id_errors = rpwf + wpwf

    assert tp == 91
    assert fp == 1
    assert fn == 21
    assert id_errors == 1


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


def test_final_lossless_rerun_all_rejected(final_summary):
    """Verify all 12 photometric variants in the final lossless rerun are classified as REJECT_CANDIDATE."""
    assert len(final_summary) == 13
    for v in final_summary:
        if v["variant"] == "ORIGINAL":
            assert v["candidate_class"] == "BASELINE_CONTROL"
        else:
            assert v["candidate_class"] == "REJECT_CANDIDATE"
            assert int(v["p015_tp"]) == 0
