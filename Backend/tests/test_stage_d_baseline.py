import json
import hashlib
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
STAGE_D_DIR = REPO_ROOT / "experiments" / "face-calibration" / "stage-d"
MANIFEST_PATH = STAGE_D_DIR / "manifest.json"
RESULTS_DIR = STAGE_D_DIR / "results" / "baseline-identity-audit"
METRICS_PATH = RESULTS_DIR / "metrics.json"
QUERY_DIR = REPO_ROOT / "experiments" / "face-calibration" / "stageD" / "query"


@pytest.fixture
def stage_d_manifest():
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def stage_d_metrics():
    with open(METRICS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_1_stage_d_manifest_hashes_and_uniqueness(stage_d_manifest):
    """Test 1: Verify 16 queries, 16 unique SHA-256 hashes, exact hash match with disk files."""
    queries = stage_d_manifest["queries"]
    assert len(queries) == 16, f"Expected 16 queries, got {len(queries)}"
    
    hashes = [q["query_sha256"] for q in queries]
    assert len(set(hashes)) == 16, f"Duplicate query hashes found: {len(set(hashes))} unique out of 16"
    
    for q in queries:
        filename = q["query_filename"]
        q_path = QUERY_DIR / filename
        assert q_path.exists(), f"Query file missing: {q_path}"
        actual_hash = hashlib.sha256(q_path.read_bytes()).hexdigest()
        assert actual_hash == q["query_sha256"], f"Hash mismatch for {q['query_id']}: {actual_hash} != {q['query_sha256']}"


def test_2_stage_d_gt_counts_and_opportunities(stage_d_manifest):
    """Test 2: Verify GT photo counts (P025=11, P026=11, P027=7, P028=7) and 144 opportunities."""
    gt_list = stage_d_manifest["face_ground_truth"]
    
    per_part_photos = {}
    for entry in gt_list:
        part = entry["participant"]
        photo_id = entry["full_photo_id"]
        per_part_photos.setdefault(part, set()).add(photo_id)
    
    expected = {"P025": 11, "P026": 11, "P027": 7, "P028": 7}
    for part, exp_c in expected.items():
        actual_c = len(per_part_photos.get(part, set()))
        assert actual_c == exp_c, f"Expected {exp_c} GT photos for {part}, got {actual_c}"
    
    total_opportunities = sum(4 * len(photos) for photos in per_part_photos.values())
    assert total_opportunities == 144, f"Expected 144 GT opportunities, got {total_opportunities}"


def test_3_full_photo_id_validation(stage_d_manifest):
    """Test 3: Assert all event photo IDs use full ph_ prefix format."""
    gt_list = stage_d_manifest["face_ground_truth"]
    for entry in gt_list:
        photo_id = entry["full_photo_id"]
        face_id = entry["face_id"]
        assert photo_id.startswith("ph_"), f"Invalid photo_id (missing ph_ prefix): {photo_id}"
        assert face_id.startswith("ph_"), f"Invalid face_id (missing ph_ prefix): {face_id}"


def test_4_critical_added_gt_locks(stage_d_manifest):
    """Test 4: Verify ph_d0141639357425f3f3009143 in P026 GT and ph_5c2225c6f197c6b314ccccab in P028 GT."""
    gt_list = stage_d_manifest["face_ground_truth"]
    
    p026_photos = {e["full_photo_id"] for e in gt_list if e["participant"] == "P026"}
    p028_photos = {e["full_photo_id"] for e in gt_list if e["participant"] == "P028"}
    
    assert "ph_d0141639357425f3f3009143" in p026_photos, "ph_d0141639357425f3f3009143 missing from P026 GT!"
    assert "ph_5c2225c6f197c6b314ccccab" in p028_photos, "ph_5c2225c6f197c6b314ccccab missing from P028 GT!"


def test_5_p025_m03_forensic_winner_lock(stage_d_metrics):
    """Test 5: Verify P025_M03 forensic audit lock on ph_5c2225c6f197c6b314ccccab."""
    forensic = stage_d_metrics["p025_m03_forensic"]
    assert forensic["query_id"] == "P025_M03"
    assert forensic["photo_id"] == "ph_5c2225c6f197c6b314ccccab"
    assert forensic["winning_face_id"] == "ph_5c2225c6f197c6b314ccccab_f17"
    assert forensic["winning_human_assignment"] == "OTHER"
    assert forensic["classification"] == "CONFIRMED_RPWF"
    assert forensic["is_numerical_tie"] is False
    assert forensic["delta_other_minus_p025"] > 0, "OTHER score should strictly exceed P025 score"


def test_6_metric_separation_lock(stage_d_metrics):
    """Test 6: Verify photo-level retrieval vs identity-aware face-winner metric separation."""
    photo = stage_d_metrics["photo_level_overall"]
    ident = stage_d_metrics["identity_aware_overall"]
    
    # Photo-level: TP = 138 (including RPWF because photo is GT-positive), FP = 0, FN = 6
    assert photo["tp"] == 138
    assert photo["fp"] == 0
    assert photo["fn"] == 6
    assert photo["precision"] == 1.0
    assert abs(photo["recall"] - (138 / 144)) < 1e-5
    
    # Identity-aware: RPRF = 137, RPWF = 1, WPWF = 0, GT Misses = 6
    assert ident["rprf"] == 137
    assert ident["rpwf"] == 1
    assert ident["wpwf"] == 0
    assert ident["non_returned_gt_miss"] == 6
    assert ident["id_errors"] == 1
    assert abs(ident["precision"] - (137 / 138)) < 1e-5
    assert abs(ident["recall"] - (137 / 144)) < 1e-5


def test_7_frozen_production_threshold(stage_d_metrics):
    """Test 7: Verify production threshold is frozen @ 0.40."""
    assert stage_d_metrics["production_threshold"] == 0.40


def test_8_stage_d_p025_m03_exact_scores_and_margin_lock():
    """Test 8: Lock exact float scores and margin for P025_M03 on ph_5c2225c6f197c6b314ccccab."""
    p2_metrics_path = STAGE_D_DIR / "results" / "phase-2-strategy-study" / "metrics.json"
    if not p2_metrics_path.exists():
        pytest.skip("Phase 2 metrics.json not found")
    
    with open(p2_metrics_path, "r", encoding="utf-8") as f:
        p2_data = json.load(f)
    
    lock = p2_data["p025_m03_critical_lock"]
    f0_score = lock["true_p025_f0_score"]
    f17_score = lock["competing_other_f17_score"]
    margin = lock["margin"]
    
    assert abs(f0_score - 0.4278484582901001) < 1e-12
    assert abs(f17_score - 0.42943495512008667) < 1e-12
    assert abs(margin - 0.0015864968299865723) < 1e-12
    assert f17_score > f0_score


def test_9_cross_stage_combined_counts_and_ambiguity_reject_behavior():
    """Test 9: Lock combined C+D in-scope counts (37 queries, 252 GT opportunities) and strategy principles."""
    p2_metrics_path = STAGE_D_DIR / "results" / "phase-2-strategy-study" / "metrics.json"
    if not p2_metrics_path.exists():
        pytest.skip("Phase 2 metrics.json not found")
        
    with open(p2_metrics_path, "r", encoding="utf-8") as f:
        p2_data = json.load(f)
        
    combined = p2_data["combined_in_scope"]
    assert combined["queries"] == 37
    assert combined["gt_opportunities"] == 252
    
    best_cand = p2_data["best_dual_accept_candidate"]
    assert best_cand["rprf"] == 228
    assert best_cand["rpwf"] == 0
    assert best_cand["wpwf"] == 0
    assert best_cand["id_errors"] == 0
    assert best_cand["photo_tp"] == 228
    assert best_cand["photo_fn"] == 24

