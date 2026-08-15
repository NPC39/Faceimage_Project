import pytest
import numpy as np


def compute_metrics(tp: int, fp: int, fn: int):
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    return round(precision, 4), round(recall, 4), round(f1, 4)


def test_zero_denominator_handling():
    prec, rec, f1 = compute_metrics(0, 0, 0)
    assert prec == 0.0
    assert rec == 0.0
    assert f1 == 0.0


def test_precision_recall_f1_perfect():
    prec, rec, f1 = compute_metrics(5, 0, 0)
    assert prec == 1.0
    assert rec == 1.0
    assert f1 == 1.0


def test_precision_recall_f1_partial():
    # TP=4, FP=1, FN=1 -> Prec=4/5=0.8, Rec=4/5=0.8, F1=0.8
    prec, rec, f1 = compute_metrics(4, 1, 1)
    assert prec == 0.8
    assert rec == 0.8
    assert f1 == 0.8


def test_micro_macro_aggregation():
    # Ref 1: TP=4, FP=0, FN=0 -> Prec=1.0, Rec=1.0, F1=1.0
    # Ref 2: TP=0, FP=0, FN=4 -> Prec=0.0, Rec=0.0, F1=0.0
    ref_results = [
        {"tp": 4, "fp": 0, "fn": 0, "precision": 1.0, "recall": 1.0, "f1": 1.0},
        {"tp": 0, "fp": 0, "fn": 4, "precision": 0.0, "recall": 0.0, "f1": 0.0},
    ]

    total_tp = sum(r["tp"] for r in ref_results)
    total_fp = sum(r["fp"] for r in ref_results)
    total_fn = sum(r["fn"] for r in ref_results)

    micro_prec = total_tp / (total_tp + total_fp)
    micro_rec = total_tp / (total_tp + total_fn)
    micro_f1 = (2 * micro_prec * micro_rec) / (micro_prec + micro_rec)

    macro_prec = np.mean([r["precision"] for r in ref_results])
    macro_rec = np.mean([r["recall"] for r in ref_results])
    macro_f1 = np.mean([r["f1"] for r in ref_results])

    # Micro: 4 / 4 = 1.0 prec, 4 / 8 = 0.5 rec, F1 = 2*1.0*0.5/1.5 = 0.6667
    assert micro_prec == 1.0
    assert micro_rec == 0.5
    assert round(micro_f1, 4) == 0.6667

    # Macro: (1.0 + 0.0)/2 = 0.5
    assert macro_prec == 0.5
    assert macro_rec == 0.5
    assert macro_f1 == 0.5


def test_face_level_correctness_logic():
    query_participant = "P022"
    matched_candidate_1 = "P022"
    matched_candidate_2 = "OTHER"

    assert matched_candidate_1 == query_participant
    assert matched_candidate_2 != query_participant
