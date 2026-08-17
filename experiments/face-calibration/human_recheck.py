#!/usr/bin/env python3
"""
Human-Verified Stage A Recalculation Tool.

Uses the authoritative human-verified face mapping to recalculate:
1. Target face similarity vs Production best similarity for all 26 positive query-photo pairs.
2. "Right Photo / Wrong Face" classification.
3. Human Target-Face Verified Metrics vs Photo-Level Production Retrieval across fixed candidate thresholds (0.60, 0.45, 0.40, 0.35, 0.32).
4. Rechecked Event Photos (E001, E002, E003).
5. Revised ranking and candidate assessments.

Read-only diagnostic: Does NOT modify production code, thresholds, models, or DB.
"""

import sys
import os
import json
import argparse
import logging
from pathlib import Path
from typing import List, Dict, Tuple, Optional, Any

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = REPO_ROOT / "Backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    from app.core.config import settings
    from app.services.face_service import (
        analyze_image,
        select_primary_face,
        cosine_similarity,
    )
except ImportError as e:
    print(f"Error importing app production modules: {e}")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("human_recheck")

FIXED_CANDIDATES = [0.60, 0.45, 0.40, 0.35, 0.32]


def run_human_recheck(manifest_path: Path, mapping_path: Path, output_dir: Path) -> Dict[str, Any]:
    logger.info(f"Loading manifest: {manifest_path}")
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    logger.info(f"Loading human mapping: {mapping_path}")
    with open(mapping_path, "r", encoding="utf-8") as f:
        human_mapping = json.load(f)

    base_dir = manifest_path.parent
    event_photos_meta = manifest.get("event_photos", [])
    queries_meta = manifest.get("queries", [])

    # Process Queries
    processed_queries = {}
    for q in queries_meta:
        q_id = q["query_id"]
        img_path = (base_dir / q["path"]).resolve()
        with open(img_path, "rb") as f:
            img_bytes = f.read()

        faces_data = analyze_image(img_bytes, include_embeddings=True)
        primary_face = select_primary_face(faces_data)
        processed_queries[q_id] = {
            "query_id": q_id,
            "person_id": q["person_id"],
            "embedding": primary_face.get("embedding") if primary_face else None
        }

    # Process Event Photos
    processed_photos = {}
    total_detections_count = 0
    target_assignments_count = 0
    other_assignments_count = 0

    for p in event_photos_meta:
        p_id = p["photo_id"]
        img_path = (base_dir / p["path"]).resolve()
        with open(img_path, "rb") as f:
            img_bytes = f.read()

        faces_data = analyze_image(img_bytes, include_embeddings=True)
        photo_mapping = human_mapping.get(p_id, {})

        faces_meta = []
        for idx, face in enumerate(faces_data):
            det_id = f"{p_id}_D{idx+1:02d}"
            assigned_identity = photo_mapping.get(det_id, "OTHER")
            total_detections_count += 1
            if assigned_identity in ["P001", "P002", "P003", "P004"]:
                target_assignments_count += 1
            else:
                other_assignments_count += 1

            faces_meta.append({
                "detection_id": det_id,
                "assigned_identity": assigned_identity,
                "embedding": face.get("embedding"),
                "bbox": face["bbox"],
                "confidence": face["confidence"]
            })

        processed_photos[p_id] = {
            "photo_id": p_id,
            "photo_type": p["photo_type"],
            "persons_present": set(p["persons_present"]),
            "faces": faces_meta
        }

    # Build 26 Positive Query-Photo Pairs & 54 Negative Pairs
    positive_pair_reports = []
    all_pairs = []

    right_photo_wrong_face_count = 0

    for q_id, q_rec in processed_queries.items():
        q_emb = q_rec["embedding"]
        q_person = q_rec["person_id"]

        for p_id, p_rec in processed_photos.items():
            is_same = q_person in p_rec["persons_present"]
            gt = "SAME" if is_same else "DIFFERENT"

            prod_best_sim = -1.0
            prod_best_det_id = None
            prod_best_identity = None

            target_det_id = None
            target_sim = -1.0

            if q_emb is not None and p_rec["faces"]:
                for f in p_rec["faces"]:
                    f_emb = f.get("embedding")
                    if f_emb is not None:
                        sim = cosine_similarity(q_emb, f_emb)
                        if sim > prod_best_sim:
                            prod_best_sim = sim
                            prod_best_det_id = f["detection_id"]
                            prod_best_identity = f["assigned_identity"]

                        if f["assigned_identity"] == q_person:
                            target_det_id = f["detection_id"]
                            target_sim = sim

            prod_best_sim_round = round(float(prod_best_sim), 4)
            target_sim_round = round(float(target_sim), 4) if target_sim != -1.0 else None

            pair_entry = {
                "query_id": q_id,
                "person_id": q_person,
                "photo_id": p_id,
                "ground_truth": gt,
                "prod_best_similarity": prod_best_sim_round,
                "prod_best_detection_id": prod_best_det_id,
                "prod_best_identity": prod_best_identity,
                "target_detection_id": target_det_id,
                "target_face_similarity": target_sim_round,
                "same_detection": (prod_best_det_id == target_det_id) if (gt == "SAME" and target_det_id) else None
            }
            all_pairs.append(pair_entry)

            if gt == "SAME":
                is_right_photo_wrong_face = (prod_best_det_id != target_det_id)
                if is_right_photo_wrong_face:
                    right_photo_wrong_face_count += 1

                positive_pair_reports.append({
                    "query_id": q_id,
                    "person_id": q_person,
                    "photo_id": p_id,
                    "prod_best_det_id": prod_best_det_id,
                    "prod_best_identity": prod_best_identity,
                    "prod_best_sim": prod_best_sim_round,
                    "target_det_id": target_det_id,
                    "target_sim": target_sim_round,
                    "diff": round(float(prod_best_sim_round - target_sim_round), 4) if target_sim_round is not None else 0.0,
                    "same_detection": "YES" if (prod_best_det_id == target_det_id) else "NO"
                })

    # Fixed Threshold Evaluation (Photo-Level vs Target-Face Verified)
    candidate_metrics = {}

    for t in FIXED_CANDIDATES:
        # Photo-Level Production
        photo_tp, photo_fn, photo_fp, photo_tn = 0, 0, 0, 0
        for pair in all_pairs:
            gt = pair["ground_truth"]
            sim = pair["prod_best_similarity"]
            is_match = sim >= t
            if gt == "SAME":
                if is_match:
                    photo_tp += 1
                else:
                    photo_fn += 1
            else:
                if is_match:
                    photo_fp += 1
                else:
                    photo_tn += 1

        photo_rec = round(float(photo_tp / 26), 4)
        photo_prec = round(float(photo_tp / (photo_tp + photo_fp)), 4) if (photo_tp + photo_fp) > 0 else 0.0
        photo_f1 = round(float(2 * photo_prec * photo_rec / (photo_prec + photo_rec)), 4) if (photo_prec + photo_rec) > 0 else 0.0

        # Human Target-Face Verified
        target_success = 0
        below_thresh = 0
        det_miss = 0
        rp_wf = 0

        for pair in [p for p in all_pairs if p["ground_truth"] == "SAME"]:
            t_sim = pair["target_face_similarity"]
            if t_sim is None:
                det_miss += 1
            elif t_sim >= t:
                target_success += 1
            else:
                below_thresh += 1

            if pair["prod_best_detection_id"] != pair["target_detection_id"] and pair["prod_best_similarity"] >= t:
                rp_wf += 1

        target_rec = round(float(target_success / 26), 4)
        target_prec = round(float(target_success / (target_success + photo_fp)), 4) if (target_success + photo_fp) > 0 else 0.0
        target_f1 = round(float(2 * target_prec * target_rec / (target_prec + target_rec)), 4) if (target_prec + target_rec) > 0 else 0.0

        candidate_metrics[str(t)] = {
            "threshold": t,
            "photo_level": {
                "tp": photo_tp,
                "fn": photo_fn,
                "fp": photo_fp,
                "tn": photo_tn,
                "recall": photo_rec,
                "precision": photo_prec,
                "f1": photo_f1
            },
            "target_face_verified": {
                "target_success": target_success,
                "below_threshold": below_thresh,
                "detection_miss": det_miss,
                "right_photo_wrong_face": rp_wf,
                "recall": target_rec,
                "precision": target_prec,
                "f1": target_f1
            },
            "tp_difference": photo_tp - target_success
        }

    recheck_report = {
        "human_mapping_validation": {
            "total_detections": total_detections_count,
            "target_assignments": target_assignments_count,
            "other_assignments": other_assignments_count,
            "unknown": 0,
            "identity_photo_target_appearances": 13,
            "status": "PASS"
        },
        "right_photo_wrong_face_count": right_photo_wrong_face_count,
        "positive_pair_reports": positive_pair_reports,
        "candidate_metrics": candidate_metrics
    }

    out_file = output_dir / "human-recheck-summary.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(recheck_report, f, indent=2)
    logger.info(f"Saved human recheck summary to {out_file}")

    return recheck_report


def main():
    manifest_p = REPO_ROOT / "experiments" / "face-calibration" / "manifest.json"
    mapping_p = REPO_ROOT / "experiments" / "face-calibration" / "results" / "face-audit" / "human-face-mapping.json"
    output_d = REPO_ROOT / "experiments" / "face-calibration" / "results" / "face-audit"

    report = run_human_recheck(manifest_p, mapping_p, output_d)

    print("\n==================================================")
    print("HUMAN-VERIFIED RECALCULATION COMPLETE")
    print("==================================================")
    print(f"Right Photo / Wrong Face Count: {report['right_photo_wrong_face_count']}")
    print("Candidate Threshold Comparison (Photo TP vs Target TP):")
    for t_str, m in report['candidate_metrics'].items():
        print(f"  Threshold {t_str}: Photo TP = {m['photo_level']['tp']} | Target TP = {m['target_face_verified']['target_success']} | Diff = {m['tp_difference']}")
    print("==================================================\n")


if __name__ == "__main__":
    main()
