import json
import csv
from pathlib import Path
import numpy as np
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
STAGE_C_DIR = REPO_ROOT / "experiments" / "face-calibration" / "stage-c"
LOCKS_JSON = STAGE_C_DIR / "results" / "score-source-of-truth" / "authoritative-score-locks.json"
SCORES_CSV = STAGE_C_DIR / "results" / "recognition-audit" / "all-face-scores.csv"
MAPPING_JSON = STAGE_C_DIR / "results" / "face-audit" / "human-face-mapping.json"


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
def face_mapping():
    if not MAPPING_JSON.exists():
        pytest.skip("human-face-mapping.json not found")
    with open(MAPPING_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


def test_p020_gt_face_count_and_assignments(face_mapping, score_locks):
    """Verify P020 has exactly 4 GT face instances and C011_f0 is assigned to OTHER."""
    p020_faces = []
    for photo_id, face_dict in face_mapping.items():
        if isinstance(face_dict, dict):
            for det_id, person_id in face_dict.items():
                if person_id == "P020":
                    p020_faces.append(det_id)

    assert len(p020_faces) == 4
    assert sorted(p020_faces) == ["C003_f13", "C008_f13", "C019_f3", "C023_f9"]

    # Verify C011_f0 is OTHER and not in P020 GT set
    c011_f0_assignment = None
    for photo_id, face_dict in face_mapping.items():
        if isinstance(face_dict, dict) and "C011_f0" in face_dict:
            c011_f0_assignment = face_dict["C011_f0"]

    assert c011_f0_assignment == "OTHER"
    assert "C011_f0" not in p020_faces

    # Verify locks JSON matches
    gt_targets = score_locks["p020_gt_targets"]
    assert len(gt_targets) == 4
    for det_id, info in gt_targets.items():
        assert info["human_assignment"] == "P020"


def test_p020_outcomes_and_all_8_same_scores(score_matrix, score_locks):
    """Verify P020_R01 (TP=0, FN=4) and P020_R02 (TP=3, FN=1) outcomes and lock all 8 SAME scores."""
    p020_gt_det_ids = {"C003_f13", "C008_f13", "C019_f3", "C023_f9"}

    p020_r01_scores = {s["detection_id"]: float(s["similarity"]) for s in score_matrix if s["ref_id"] == "P020_R01" and s["detection_id"] in p020_gt_det_ids}
    p020_r02_scores = {s["detection_id"]: float(s["similarity"]) for s in score_matrix if s["ref_id"] == "P020_R02" and s["detection_id"] in p020_gt_det_ids}

    assert len(p020_r01_scores) == 4
    assert len(p020_r02_scores) == 4

    # P020_R01: TP=0, FN=4
    r01_tps = sum(1 for sim in p020_r01_scores.values() if sim >= 0.40)
    assert r01_tps == 0

    # P020_R02: TP=3, FN=1
    r02_tps = sum(1 for sim in p020_r02_scores.values() if sim >= 0.40)
    assert r02_tps == 3

    # Lock all 8 SAME scores against authoritative values
    gt_targets = score_locks["p020_gt_targets"]
    for det_id in p020_gt_det_ids:
        assert abs(p020_r01_scores[det_id] - gt_targets[det_id]["p020_r01_score"]) < 1e-6
        assert abs(p020_r02_scores[det_id] - gt_targets[det_id]["p020_r02_score"]) < 1e-6


def test_score_matrix_dimensions(score_matrix):
    """Verify total score matrix has 3,190 rows (22 refs x 145 faces) and 3,045 in-scope rows (21 refs x 145 faces)."""
    assert len(score_matrix) == 3190
    in_scope = [s for s in score_matrix if s["ref_id"] != "P022_R03"]
    assert len(in_scope) == 3045


def test_reconciled_disputed_locks(score_locks):
    """Verify reconciled authoritative score locks for P015_R01 and P020_R01."""
    disputed = score_locks["disputed_pairs_reconciled"]

    p15_c17 = disputed["P015_R01_C017_f5"]["similarity"]
    p15_c22 = disputed["P015_R01_C022_f0"]["similarity"]
    p20_c11 = disputed["P020_R01_C011_f0"]["similarity"]

    assert abs(p15_c17 - 0.306354) < 1e-4
    assert abs(p15_c22 - 0.201225) < 1e-4
    assert abs(p20_c11 - 0.221980) < 1e-4


def test_control_and_stress_locks(score_locks):
    """Verify control score locks and P022_R03 stress locks."""
    controls = score_locks["control_locks"]
    stress = score_locks["p022_r03_stress_locks"]

    assert abs(controls["P015_R01_C013_f5"] - 0.191903) < 1e-4
    assert abs(controls["P020_R01_C019_f3"] - 0.389552) < 1e-4
    assert abs(controls["P020_R01_C003_f13"] - 0.354938) < 1e-4
    assert abs(controls["P020_R01_C023_f9"] - 0.323375) < 1e-4

    assert abs(stress["C013_f4_diff"] - 0.422938) < 1e-4
    assert abs(stress["C002_f7_diff"] - 0.396368) < 1e-4
    assert abs(stress["C012_f5"] - 0.375344) < 1e-4


def test_production_threshold_locked(score_locks):
    """Verify production threshold remains locked at 0.40."""
    assert score_locks["threshold"] == 0.40
