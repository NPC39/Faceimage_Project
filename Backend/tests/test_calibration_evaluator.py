import sys
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
EVAL_DIR = REPO_ROOT / "experiments" / "face-calibration"
if str(EVAL_DIR) not in sys.path:
    sys.path.insert(0, str(EVAL_DIR))

from evaluate import (
    validate_manifest,
    compute_confusion_matrix,
    compute_statistics,
)


def test_manifest_validation_pilot_v1_counts():
    manifest = {
        "dataset": "pilot-v1",
        "event_photos": [
            {"photo_id": "E001", "photo_type": "SOLO", "visible_face_count": 1, "persons_present": ["P001"]},
            {"photo_id": "E002", "photo_type": "SOLO", "visible_face_count": 1, "persons_present": ["P001"]},
            {"photo_id": "E003", "photo_type": "SOLO", "visible_face_count": 1, "persons_present": ["P003"]},
            {"photo_id": "E004", "photo_type": "SOLO", "visible_face_count": 1, "persons_present": ["P003"]},
            {"photo_id": "E005", "photo_type": "SOLO", "visible_face_count": 1, "persons_present": ["P004"]},
            {"photo_id": "E006", "photo_type": "SOLO", "visible_face_count": 1, "persons_present": ["P004"]},
            {"photo_id": "E007", "photo_type": "SOLO", "visible_face_count": 1, "persons_present": ["P004"]},
            {"photo_id": "E008", "photo_type": "GROUP", "visible_face_count": 3, "persons_present": ["P001", "P002", "P004"]},
            {"photo_id": "E009", "photo_type": "GROUP", "visible_face_count": 2, "persons_present": ["P001", "P004"]},
            {"photo_id": "E010", "photo_type": "GROUP", "visible_face_count": 3, "persons_present": ["P004"]},
        ],
        "queries": [
            {"query_id": "P001_Q01", "person_id": "P001", "path": "dataset/queries/P001_Q01.jpg"},
            {"query_id": "P001_Q02", "person_id": "P001", "path": "dataset/queries/P001_Q02.jpg"},
            {"query_id": "P002_Q01", "person_id": "P002", "path": "dataset/queries/P002_Q01.jpg"},
            {"query_id": "P002_Q02", "person_id": "P002", "path": "dataset/queries/P002_Q02.jpg"},
            {"query_id": "P003_Q01", "person_id": "P003", "path": "dataset/queries/P003_Q01.jpg"},
            {"query_id": "P003_Q02", "person_id": "P003", "path": "dataset/queries/P003_Q02.jpg"},
            {"query_id": "P004_Q01", "person_id": "P004", "path": "dataset/queries/P004_Q01.jpg"},
            {"query_id": "P004_Q02", "person_id": "P004", "path": "dataset/queries/P004_Q02.jpg"},
        ],
    }

    is_valid, errors, stats = validate_manifest(manifest)
    assert is_valid, f"Validation errors: {errors}"
    assert stats["event_photo_count"] == 10
    assert stats["solo_count"] == 7
    assert stats["group_count"] == 3
    assert stats["query_count"] == 8
    assert stats["identity_count"] == 4
    assert stats["positive_pairs"] == 26
    assert stats["negative_pairs"] == 54
    assert stats["total_pairs"] == 80


def test_confusion_matrix_calculation():
    synthetic_pairs = [
        {"ground_truth": "SAME", "best_similarity": 0.70},       # TP
        {"ground_truth": "SAME", "best_similarity": 0.50},       # FN
        {"ground_truth": "DIFFERENT", "best_similarity": 0.65},  # FP
        {"ground_truth": "DIFFERENT", "best_similarity": 0.20},  # TN
    ]

    matrix = compute_confusion_matrix(synthetic_pairs, threshold=0.60)
    assert matrix["tp"] == 1
    assert matrix["fn"] == 1
    assert matrix["fp"] == 1
    assert matrix["tn"] == 1
    assert matrix["recall"] == 0.5
    assert matrix["precision"] == 0.5
    assert matrix["f1"] == 0.5
    assert matrix["accuracy"] == 0.5


def test_threshold_equality_rule():
    # If best_similarity == threshold, it should be predicted MATCH
    synthetic_pairs = [
        {"ground_truth": "SAME", "best_similarity": 0.60},
    ]

    matrix = compute_confusion_matrix(synthetic_pairs, threshold=0.60)
    assert matrix["tp"] == 1
    assert matrix["fn"] == 0


def test_statistics_computation():
    values = [0.2, 0.4, 0.6, 0.8, 1.0]
    stats = compute_statistics(values)

    assert stats["count"] == 5
    assert stats["min"] == 0.2
    assert stats["max"] == 1.0
    assert stats["mean"] == 0.6
    assert stats["median"] == 0.6


def test_detection_count_audit():
    from face_audit import run_detection_count_audit
    event_photos = [
        {"photo_id": "E001", "photo_type": "GROUP", "visible_face_count": 16},
        {"photo_id": "E008", "photo_type": "SOLO", "visible_face_count": 1},
    ]
    processed_photos = {
        "E001": {"detected_face_count": 2},
        "E008": {"detected_face_count": 8},
    }
    audit = run_detection_count_audit(event_photos, processed_photos)

    # E001: visible=16, detected=2 => deficit=14, excess=0
    assert audit[0]["deficit"] == 14
    assert audit[0]["excess"] == 0

    # E008: visible=1, detected=8 => deficit=0, excess=7
    assert audit[1]["deficit"] == 0
    assert audit[1]["excess"] == 7


def test_macro_micro_recall_computation():
    from face_audit import compute_macro_micro_recall
    pairs = [
        {"person_id": "P001", "ground_truth": "SAME", "best_similarity": 0.50},
        {"person_id": "P001", "ground_truth": "SAME", "best_similarity": 0.20},
        {"person_id": "P002", "ground_truth": "SAME", "best_similarity": 0.40},
        {"person_id": "P003", "ground_truth": "SAME", "best_similarity": 0.30},
        {"person_id": "P004", "ground_truth": "SAME", "best_similarity": 0.35},
    ]
    # At candidate 0.35:
    # P001: 1/2 = 0.5
    # P002: 1/1 = 1.0
    # P003: 0/1 = 0.0
    # P004: 1/1 = 1.0
    # Micro: (1+1+0+1)/5 = 3/5 = 0.60
    # Macro: (0.5 + 1.0 + 0.0 + 1.0) / 4 = 2.5/4 = 0.625
    res = compute_macro_micro_recall(pairs, candidate=0.35)
    assert res["micro_recall"] == 0.60
    assert res["macro_recall"] == 0.625

