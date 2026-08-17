#!/usr/bin/env python3
"""
Face Recognition Calibration & Evaluation Tool for Pilot Dataset v1.

Evaluates InsightFace (buffalo_l) recognition quality against local Pilot v1 dataset.
Reuses production face detection, embedding extraction, and cosine similarity logic.
Does NOT modify production configuration, models, or database data.
"""

import sys
import os
import math
import json
import csv
import argparse
import logging
from pathlib import Path
from typing import List, Dict, Tuple, Optional, Any
import numpy as np

# Ensure Backend directory is in Python path for importing production app modules
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
        decode_image,
        l2_normalize,
        ImageValidationError,
        ModelUnavailableError,
    )
    from app.services.face_model import face_model_loader
except ImportError as e:
    print(f"Error importing app production modules from {BACKEND_DIR}: {e}")
    sys.path_to_print = sys.path
    print(f"Python path: {sys_path_to_print}")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("face_evaluator")


# ==============================================================================
# MANIFEST VALIDATION
# ==============================================================================

def validate_manifest(manifest: Dict[str, Any]) -> Tuple[bool, List[str], Dict[str, Any]]:
    """Validate manifest against Pilot Calibration Dataset v1 specifications.

    Pilot v1 specs:
    - 10 Event photos (7 SOLO, 3 GROUP)
    - 4 anonymous identities (P001, P002, P003, P004)
    - 8 queries (2 per identity)
    - 26 positive pairs
    - 54 negative pairs
    - 80 total query-photo pairs
    """
    errors: List[str] = []
    stats: Dict[str, Any] = {}

    dataset_name = manifest.get("dataset", "")
    event_photos = manifest.get("event_photos", [])
    queries = manifest.get("queries", [])

    if not isinstance(event_photos, list):
        errors.append("Field 'event_photos' must be a list.")
        event_photos = []

    if not isinstance(queries, list):
        errors.append("Field 'queries' must be a list.")
        queries = []

    # 1. Photo validation
    photo_ids = set()
    solo_count = 0
    group_count = 0
    photo_persons_map = {}

    for p_idx, photo in enumerate(event_photos):
        p_id = photo.get("photo_id")
        p_type = photo.get("photo_type")
        p_persons = photo.get("persons_present", [])
        v_faces = photo.get("visible_face_count", 0)

        if not p_id:
            errors.append(f"Event photo index {p_idx} missing 'photo_id'.")
            continue
        if p_id in photo_ids:
            errors.append(f"Duplicate photo_id '{p_id}'.")
        photo_ids.add(p_id)

        if p_type not in ("SOLO", "GROUP"):
            errors.append(f"Photo '{p_id}' has invalid photo_type '{p_type}'. Must be 'SOLO' or 'GROUP'.")
        elif p_type == "SOLO":
            solo_count += 1
        elif p_type == "GROUP":
            group_count += 1

        if not isinstance(p_persons, list):
            errors.append(f"Photo '{p_id}' 'persons_present' must be a list.")
            p_persons = []
        elif len(p_persons) != len(set(p_persons)):
            errors.append(f"Photo '{p_id}' contains duplicate person IDs in 'persons_present'.")

        if v_faces < 0:
            errors.append(f"Photo '{p_id}' has negative 'visible_face_count'.")

        photo_persons_map[p_id] = set(p_persons)

    # 2. Query validation
    query_ids = set()
    query_identities_map = {}
    person_query_counts: Dict[str, int] = {}

    for q_idx, query in enumerate(queries):
        q_id = query.get("query_id")
        p_id = query.get("person_id")

        if not q_id:
            errors.append(f"Query index {q_idx} missing 'query_id'.")
            continue
        if q_id in query_ids:
            errors.append(f"Duplicate query_id '{q_id}'.")
        query_ids.add(q_id)

        if not p_id:
            errors.append(f"Query '{q_id}' missing 'person_id'.")
            continue

        query_identities_map[q_id] = p_id
        person_query_counts[p_id] = person_query_counts.get(p_id, 0) + 1

    identities = sorted(list(set(query_identities_map.values())))

    # 3. Calculate positive and negative pair counts
    positive_pairs = 0
    negative_pairs = 0

    for q_id, q_person in query_identities_map.items():
        for p_id, p_persons in photo_persons_map.items():
            if q_person in p_persons:
                positive_pairs += 1
            else:
                negative_pairs += 1

    total_pairs = positive_pairs + negative_pairs

    # 4. Check against Pilot v1 strict expectations if dataset == 'pilot-v1'
    if dataset_name == "pilot-v1":
        if len(event_photos) != 10:
            errors.append(f"Pilot v1 requires 10 event photos (found {len(event_photos)}).")
        if solo_count != 7:
            errors.append(f"Pilot v1 requires 7 SOLO photos (found {solo_count}).")
        if group_count != 3:
            errors.append(f"Pilot v1 requires 3 GROUP photos (found {group_count}).")
        if len(queries) != 8:
            errors.append(f"Pilot v1 requires 8 query images (found {len(queries)}).")
        if len(identities) != 4:
            errors.append(f"Pilot v1 requires 4 identities (found {len(identities)}).")
        if positive_pairs != 26:
            errors.append(f"Pilot v1 requires 26 positive pairs (found {positive_pairs}).")
        if negative_pairs != 54:
            errors.append(f"Pilot v1 requires 54 negative pairs (found {negative_pairs}).")
        if total_pairs != 80:
            errors.append(f"Pilot v1 requires 80 total query-photo pairs (found {total_pairs}).")

    stats = {
        "dataset_name": dataset_name,
        "event_photo_count": len(event_photos),
        "solo_count": solo_count,
        "group_count": group_count,
        "query_count": len(queries),
        "identity_count": len(identities),
        "identities": identities,
        "positive_pairs": positive_pairs,
        "negative_pairs": negative_pairs,
        "total_pairs": total_pairs,
    }

    is_valid = len(errors) == 0
    return is_valid, errors, stats


# ==============================================================================
# METRICS & DISTRIBUTION COMPUTATION UTILITIES
# ==============================================================================

def compute_statistics(values: List[float]) -> Dict[str, Any]:
    """Compute summary statistics for a list of floats (in memory)."""
    if not values:
        return {
            "count": 0,
            "min": None,
            "max": None,
            "mean": None,
            "median": None,
            "std": None,
            "q1": None,
            "q3": None,
        }

    arr = np.array(values, dtype=np.float64)
    count = int(len(arr))
    min_val = float(np.min(arr))
    max_val = float(np.max(arr))
    mean_val = float(np.mean(arr))
    median_val = float(np.median(arr))
    std_val = float(np.std(arr, ddof=1)) if count > 1 else 0.0
    q1_val = float(np.percentile(arr, 25))
    q3_val = float(np.percentile(arr, 75))

    return {
        "count": count,
        "min": round(min_val, 4),
        "max": round(max_val, 4),
        "mean": round(mean_val, 4),
        "median": round(median_val, 4),
        "std": round(std_val, 4),
        "q1": round(q1_val, 4),
        "q3": round(q3_val, 4),
    }


def compute_confusion_matrix(pairs: List[Dict[str, Any]], threshold: float) -> Dict[str, Any]:
    """Calculate TP, FN, FP, TN and classification metrics at a given threshold.

    Decision Rule: best_similarity >= threshold -> MATCH
    Ground Truth: 'SAME' vs 'DIFFERENT'
    """
    tp, fn, fp, tn = 0, 0, 0, 0

    for pair in pairs:
        gt = pair["ground_truth"]
        sim = pair["best_similarity"]
        is_match = sim >= threshold

        if gt == "SAME":
            if is_match:
                tp += 1
            else:
                fn += 1
        elif gt == "DIFFERENT":
            if is_match:
                fp += 1
            else:
                tn += 1

    total_positives = tp + fn
    total_negatives = fp + tn
    total_samples = total_positives + total_negatives

    recall = float(tp / total_positives) if total_positives > 0 else 0.0
    precision = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    fpr = float(fp / total_negatives) if total_negatives > 0 else 0.0
    fnr = float(fn / total_positives) if total_positives > 0 else 0.0
    specificity = float(tn / total_negatives) if total_negatives > 0 else 0.0
    f1 = float(2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    accuracy = float((tp + tn) / total_samples) if total_samples > 0 else 0.0

    return {
        "threshold": round(threshold, 4),
        "tp": tp,
        "fn": fn,
        "fp": fp,
        "tn": tn,
        "recall": round(recall, 4),
        "precision": round(precision, 4),
        "fpr": round(fpr, 4),
        "fnr": round(fnr, 4),
        "specificity": round(specificity, 4),
        "f1": round(f1, 4),
        "accuracy": round(accuracy, 4),
    }


# ==============================================================================
# EVALUATOR ENGINE
# ==============================================================================

class FaceEvaluator:
    def __init__(self, manifest_path: Path, output_dir: Path, verbose: bool = False):
        self.manifest_path = manifest_path.resolve()
        self.base_dir = self.manifest_path.parent
        self.output_dir = output_dir.resolve()
        self.verbose = verbose
        self.manifest: Dict[str, Any] = {}
        self.current_threshold = float(getattr(settings, "FACE_MATCH_THRESHOLD", 0.60))

    def load_manifest(self) -> Dict[str, Any]:
        if not self.manifest_path.exists():
            raise FileNotFoundError(f"Manifest file not found at '{self.manifest_path}'.")

        with open(self.manifest_path, "r", encoding="utf-8") as f:
            self.manifest = json.load(f)

        return self.manifest

    def resolve_image_path(self, rel_path: str) -> Path:
        p = Path(rel_path)
        if p.is_absolute():
            return p
        return (self.base_dir / p).resolve()

    def run_evaluation(self, run_sweep: bool = True) -> Dict[str, Any]:
        logger.info(f"Loading manifest from {self.manifest_path}...")
        manifest = self.load_manifest()

        # Validate manifest
        is_valid, errors, manifest_stats = validate_manifest(manifest)
        if not is_valid:
            logger.error(f"Manifest validation failed with {len(errors)} error(s):")
            for err in errors:
                logger.error(f"  - {err}")
            raise ValueError(f"Invalid manifest: {errors[0]}")

        logger.info(f"Manifest validation passed. Dataset: '{manifest_stats['dataset_name']}'")

        # Prepare containers
        queries_meta = manifest.get("queries", [])
        event_photos_meta = manifest.get("event_photos", [])

        # Process queries
        logger.info("Processing query images using production engine...")
        processed_queries: Dict[str, Dict[str, Any]] = {}

        for q_meta in queries_meta:
            q_id = q_meta["query_id"]
            img_path = self.resolve_image_path(q_meta["path"])

            if not img_path.exists():
                raise FileNotFoundError(f"Query image '{q_id}' not found at '{img_path}'.")

            with open(img_path, "rb") as f:
                img_bytes = f.read()

            faces_data = analyze_image(img_bytes, include_embeddings=True)

            # Get image dimensions
            bgr_img = decode_image(img_bytes)
            height, width = bgr_img.shape[:2]

            primary_face = select_primary_face(faces_data)

            q_record = {
                "query_id": q_id,
                "person_id": q_meta["person_id"],
                "path": str(img_path),
                "pose": q_meta.get("pose", "normal"),
                "lighting": q_meta.get("lighting", "normal"),
                "image_width": width,
                "image_height": height,
                "detected_face_count": len(faces_data),
                "has_primary_face": primary_face is not None,
                "bbox": primary_face["bbox"] if primary_face else None,
                "confidence": primary_face["confidence"] if primary_face else None,
                # Embedding remains strictly in memory
                "_embedding": primary_face.get("embedding") if primary_face else None,
            }

            if primary_face and primary_face.get("bbox"):
                b = primary_face["bbox"]
                w = max(0, b["x2"] - b["x1"])
                h = max(0, b["y2"] - b["y1"])
                q_record["bbox_width"] = w
                q_record["bbox_height"] = h
                q_record["bbox_area"] = w * h
            else:
                q_record["bbox_width"] = 0
                q_record["bbox_height"] = 0
                q_record["bbox_area"] = 0

            processed_queries[q_id] = q_record

        # Process event photos
        logger.info("Processing event photos using production engine...")
        processed_photos: Dict[str, Dict[str, Any]] = {}
        total_visible_faces = 0
        total_detected_faces = 0

        for p_meta in event_photos_meta:
            p_id = p_meta["photo_id"]
            img_path = self.resolve_image_path(p_meta["path"])

            if not img_path.exists():
                raise FileNotFoundError(f"Event photo '{p_id}' not found at '{img_path}'.")

            with open(img_path, "rb") as f:
                img_bytes = f.read()

            faces_data = analyze_image(img_bytes, include_embeddings=True)
            bgr_img = decode_image(img_bytes)
            height, width = bgr_img.shape[:2]

            v_faces = p_meta.get("visible_face_count", 0)
            d_faces = len(faces_data)
            total_visible_faces += v_faces
            total_detected_faces += d_faces

            p_record = {
                "photo_id": p_id,
                "photo_type": p_meta["photo_type"],
                "path": str(img_path),
                "persons_present": set(p_meta.get("persons_present", [])),
                "visible_face_count": v_faces,
                "detected_face_count": d_faces,
                "missed_estimate": max(0, v_faces - d_faces),
                "image_width": width,
                "image_height": height,
                "faces": faces_data,  # Contains embeddings in memory
            }

            processed_photos[p_id] = p_record

        # Generate 80 query-photo decision pairs
        logger.info("Computing query-photo pair similarity decisions...")
        pairs: List[Dict[str, Any]] = []

        for q_id, q_rec in processed_queries.items():
            q_emb = q_rec["_embedding"]
            q_person = q_rec["person_id"]

            for p_id, p_rec in processed_photos.items():
                is_same = q_person in p_rec["persons_present"]
                ground_truth = "SAME" if is_same else "DIFFERENT"

                best_sim = -1.0
                best_face_meta = None

                if q_emb is not None and p_rec["faces"]:
                    for f in p_rec["faces"]:
                        f_emb = f.get("embedding")
                        if f_emb is not None and len(f_emb) == 512:
                            sim = cosine_similarity(q_emb, f_emb)
                            if sim > best_sim:
                                best_sim = sim
                                best_face_meta = f

                best_sim_rounded = round(float(best_sim), 4)

                pair_record = {
                    "dataset": manifest_stats["dataset_name"],
                    "query_id": q_id,
                    "person_id": q_person,
                    "photo_id": p_id,
                    "photo_type": p_rec["photo_type"],
                    "ground_truth": ground_truth,
                    "query_detected_faces": q_rec["detected_face_count"],
                    "query_face_width": q_rec["bbox_width"],
                    "query_face_height": q_rec["bbox_height"],
                    "query_detection_confidence": q_rec["confidence"],
                    "query_pose": q_rec["pose"],
                    "query_lighting": q_rec["lighting"],
                    "event_detected_face_count": p_rec["detected_face_count"],
                    "event_visible_face_count": p_rec["visible_face_count"],
                    "best_event_face_width": 0,
                    "best_event_face_height": 0,
                    "best_event_face_confidence": None,
                    "best_similarity": best_sim_rounded,
                    "current_threshold": self.current_threshold,
                    "predicted_match_current_threshold": best_sim_rounded >= self.current_threshold,
                }

                if best_face_meta and best_face_meta.get("bbox"):
                    b = best_face_meta["bbox"]
                    w = max(0, b["x2"] - b["x1"])
                    h = max(0, b["y2"] - b["y1"])
                    pair_record["best_event_face_width"] = w
                    pair_record["best_event_face_height"] = h
                    pair_record["best_event_face_confidence"] = best_face_meta.get("confidence")

                pairs.append(pair_record)

        # Compute threshold evaluation at CURRENT threshold (0.60)
        current_matrix = compute_confusion_matrix(pairs, self.current_threshold)

        # Validate pair counts
        if current_matrix["tp"] + current_matrix["fn"] != manifest_stats["positive_pairs"]:
            raise ValueError(f"TP+FN ({current_matrix['tp'] + current_matrix['fn']}) != expected positive pairs ({manifest_stats['positive_pairs']}).")
        if current_matrix["fp"] + current_matrix["tn"] != manifest_stats["negative_pairs"]:
            raise ValueError(f"FP+TN ({current_matrix['fp'] + current_matrix['tn']}) != expected negative pairs ({manifest_stats['negative_pairs']}).")

        # Score distributions
        same_scores = [p["best_similarity"] for p in pairs if p["ground_truth"] == "SAME"]
        diff_scores = [p["best_similarity"] for p in pairs if p["ground_truth"] == "DIFFERENT"]

        same_stats = compute_statistics(same_scores)
        diff_stats = compute_statistics(diff_scores)

        # Separation / Overlap
        lowest_same = same_stats["min"]
        highest_diff = diff_stats["max"]

        if lowest_same is not None and highest_diff is not None:
            if highest_diff < lowest_same:
                separation_status = "CLEAN"
                overlap_range = None
            else:
                separation_status = "OVERLAP"
                overlap_range = f"{lowest_same} - {highest_diff}"
        else:
            separation_status = "INCONCLUSIVE"
            overlap_range = None

        # SOLO vs GROUP score distribution
        solo_same_scores = [p["best_similarity"] for p in pairs if p["ground_truth"] == "SAME" and p["photo_type"] == "SOLO"]
        group_same_scores = [p["best_similarity"] for p in pairs if p["ground_truth"] == "SAME" and p["photo_type"] == "GROUP"]

        solo_same_stats = compute_statistics(solo_same_scores)
        group_same_stats = compute_statistics(group_same_scores)

        solo_matrix = compute_confusion_matrix([p for p in pairs if p["photo_type"] == "SOLO"], self.current_threshold)
        group_matrix = compute_confusion_matrix([p for p in pairs if p["photo_type"] == "GROUP"], self.current_threshold)

        # Per-Query Evaluation & Rankings
        per_query_results: Dict[str, Dict[str, Any]] = {}
        queries_with_at_least_one_correct = 0
        total_correct_positive_retrievals = 0

        for q_id in sorted(processed_queries.keys()):
            q_rec = processed_queries[q_id]
            q_pairs = [p for p in pairs if p["query_id"] == q_id]

            # Rank photos by similarity DESC
            ranked_pairs = sorted(q_pairs, key=lambda x: x["best_similarity"], reverse=True)

            # Assign ranks
            for rank_idx, r_pair in enumerate(ranked_pairs):
                r_pair["rank_before_threshold"] = rank_idx + 1

            expected_count = sum(1 for p in q_pairs if p["ground_truth"] == "SAME")
            correct_returned = sum(1 for p in q_pairs if p["ground_truth"] == "SAME" and p["predicted_match_current_threshold"])
            false_returned = sum(1 for p in q_pairs if p["ground_truth"] == "DIFFERENT" and p["predicted_match_current_threshold"])
            missed = sum(1 for p in q_pairs if p["ground_truth"] == "SAME" and not p["predicted_match_current_threshold"])

            total_correct_positive_retrievals += correct_returned
            if correct_returned >= 1:
                queries_with_at_least_one_correct += 1

            q_same_scores = [p["best_similarity"] for p in q_pairs if p["ground_truth"] == "SAME"]
            q_diff_scores = [p["best_similarity"] for p in q_pairs if p["ground_truth"] == "DIFFERENT"]

            per_query_results[q_id] = {
                "query_id": q_id,
                "person_id": q_rec["person_id"],
                "pose": q_rec["pose"],
                "lighting": q_rec["lighting"],
                "detected_faces": q_rec["detected_face_count"],
                "face_width": q_rec["bbox_width"],
                "face_height": q_rec["bbox_height"],
                "confidence": q_rec["confidence"],
                "expected_photos": expected_count,
                "correct_returned": correct_returned,
                "false_returned": false_returned,
                "missed": missed,
                "query_recall": round(float(correct_returned / expected_count), 4) if expected_count > 0 else 0.0,
                "highest_same_score": max(q_same_scores) if q_same_scores else None,
                "lowest_same_score": min(q_same_scores) if q_same_scores else None,
                "highest_diff_score": max(q_diff_scores) if q_diff_scores else None,
                "top_10_ranking": [
                    {
                        "rank": p["rank_before_threshold"],
                        "photo_id": p["photo_id"],
                        "photo_type": p["photo_type"],
                        "similarity": p["best_similarity"],
                        "ground_truth": p["ground_truth"],
                        "match_at_current": p["predicted_match_current_threshold"],
                    }
                    for p in ranked_pairs[:10]
                ]
            }

        pilot_photo_retrieval_recall = round(float(total_correct_positive_retrievals / manifest_stats["positive_pairs"]), 4)

        # Per-Identity Evaluation
        per_identity_results: Dict[str, Dict[str, Any]] = {}
        for p_id in manifest_stats["identities"]:
            p_pairs = [p for p in pairs if p["person_id"] == p_id]
            p_pos = [p for p in p_pairs if p["ground_truth"] == "SAME"]
            p_tp = sum(1 for p in p_pos if p["predicted_match_current_threshold"])
            p_fn = sum(1 for p in p_pos if not p["predicted_match_current_threshold"])
            p_fp = sum(1 for p in p_pairs if p["ground_truth"] == "DIFFERENT" and p["predicted_match_current_threshold"])

            per_identity_results[p_id] = {
                "identity": p_id,
                "positive_pairs": len(p_pos),
                "tp": p_tp,
                "fn": p_fn,
                "fp": p_fp,
                "recall": round(float(p_tp / len(p_pos)), 4) if len(p_pos) > 0 else 0.0
            }

        # Offline Threshold Sweep
        sweep_results: List[Dict[str, Any]] = []
        if run_sweep:
            logger.info("Running offline threshold sweep from -0.20 to 1.00 (step 0.01)...")
            threshold_steps = [round(x, 2) for x in np.arange(-0.20, 1.01, 0.01)]
            if round(self.current_threshold, 2) not in threshold_steps:
                threshold_steps.append(round(self.current_threshold, 2))
                threshold_steps.sort()

            for t in threshold_steps:
                m = compute_confusion_matrix(pairs, t)
                sweep_results.append(m)

        # Highlight provisional threshold candidates
        candidate_current = current_matrix
        candidate_max_f1 = max(sweep_results, key=lambda x: (x["f1"], x["recall"])) if sweep_results else current_matrix

        zero_fp_candidates = [x for x in sweep_results if x["fp"] == 0]
        candidate_zero_fp = max(zero_fp_candidates, key=lambda x: x["recall"]) if zero_fp_candidates else current_matrix

        results_summary = {
            "dataset": manifest_stats["dataset_name"],
            "current_threshold": self.current_threshold,
            "manifest_stats": manifest_stats,
            "detection_summary": {
                "total_visible_faces": total_visible_faces,
                "total_detected_faces": total_detected_faces,
                "estimated_misses": max(0, total_visible_faces - total_detected_faces),
                "queries_no_face_count": sum(1 for q in processed_queries.values() if not q["has_primary_face"])
            },
            "same_distribution": same_stats,
            "different_distribution": diff_stats,
            "separation": {
                "lowest_same": lowest_same,
                "highest_different": highest_diff,
                "status": separation_status,
                "overlap_range": overlap_range
            },
            "current_threshold_matrix": current_matrix,
            "product_retrieval": {
                "queries_with_at_least_one_correct": queries_with_at_least_one_correct,
                "total_queries": len(queries_meta),
                "pilot_query_success_rate": round(float(queries_with_at_least_one_correct / len(queries_meta)), 4),
                "correct_positive_photo_retrievals": total_correct_positive_retrievals,
                "total_expected_positive_pairs": manifest_stats["positive_pairs"],
                "pilot_photo_retrieval_recall": pilot_photo_retrieval_recall
            },
            "solo_vs_group": {
                "solo": {
                    "distribution": solo_same_stats,
                    "matrix": solo_matrix
                },
                "group": {
                    "distribution": group_same_stats,
                    "matrix": group_matrix
                }
            },
            "per_query": per_query_results,
            "per_identity": per_identity_results,
            "threshold_candidates": {
                "CURRENT": candidate_current,
                "PROVISIONAL_MAX_F1": candidate_max_f1,
                "PROVISIONAL_ZERO_FP": candidate_zero_fp
            }
        }

        # Save output files
        self.output_results(pairs, sweep_results, results_summary)

        return results_summary

    def output_results(self, pairs: List[Dict[str, Any]], sweep: List[Dict[str, Any]], summary: Dict[str, Any]):
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # 1. Output pairs.csv (NO EMBEDDINGS)
        pairs_csv = self.output_dir / "pairs.csv"
        fieldnames = [
            "dataset", "query_id", "person_id", "photo_id", "photo_type", "ground_truth",
            "rank_before_threshold", "query_detected_faces", "query_face_width", "query_face_height",
            "query_detection_confidence", "query_pose", "query_lighting", "event_detected_face_count",
            "event_visible_face_count", "best_event_face_width", "best_event_face_height",
            "best_event_face_confidence", "best_similarity", "current_threshold", "predicted_match_current_threshold"
        ]

        with open(pairs_csv, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for pair in pairs:
                row = {k: pair.get(k) for k in fieldnames}
                writer.writerow(row)

        logger.info(f"Saved pair decisions to {pairs_csv}")

        # 2. Output thresholds.csv
        if sweep:
            thresh_csv = self.output_dir / "thresholds.csv"
            t_fields = ["threshold", "tp", "fn", "fp", "tn", "recall", "precision", "fpr", "fnr", "specificity", "f1", "accuracy"]
            with open(thresh_csv, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=t_fields)
                writer.writeheader()
                for row in sweep:
                    writer.writerow({k: row.get(k) for k in t_fields})
            logger.info(f"Saved threshold sweep to {thresh_csv}")

        # 3. Output summary.json
        summary_json = self.output_dir / "summary.json"
        with open(summary_json, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
        logger.info(f"Saved aggregate metrics summary to {summary_json}")

        # 4. Output report.md
        report_md = self.output_dir / "report.md"
        with open(report_md, "w", encoding="utf-8") as f:
            f.write(self.generate_markdown_report(summary))
        logger.info(f"Saved human-readable Markdown report to {report_md}")

    def generate_markdown_report(self, s: Dict[str, Any]) -> str:
        m = s["current_threshold_matrix"]
        p = s["product_retrieval"]
        sep = s["separation"]

        md = r"""# Face Recognition Evaluation Report (Pilot Dataset v1)

## 📌 Executive Summary

* **Dataset**: `{s['dataset']}`
* **InsightFace Model**: `buffalo_l` (512D L2-Normalized Cosine Similarity)
* **Current Configured Threshold**: `{s['current_threshold']}`
* **Total Decision Pairs**: `{s['manifest_stats']['total_pairs']}` (Positive: {s['manifest_stats']['positive_pairs']}, Negative: {s['manifest_stats']['negative_pairs']})

---

## 📊 Classification Performance at Current Threshold ({s['current_threshold']})

| Metric | Value |
| :--- | :--- |
| **True Positives (TP)** | `{m['tp']}` |
| **False Negatives (FN)** | `{m['fn']}` |
| **False Positives (FP)** | `{m['fp']}` |
| **True Negatives (TN)** | `{m['tn']}` |
| **Recall (TPR)** | `{m['recall']}` |
| **Precision** | `{m['precision']}` |
| **F1 Score** | `{m['f1']}` |
| **False Positive Rate (FPR)** | `{m['fpr']}` |
| **Classification Accuracy** | `{m['accuracy']}` |

---

## 🛒 Product Retrieval Performance

* **Queries with $\ge 1$ Correct Photo**: `{p['queries_with_at_least_one_correct']} / {p['total_queries']}` (Success Rate: `{p['pilot_query_success_rate']}`)
* **Correct Positive Photo Retrievals**: `{p['correct_positive_photo_retrievals']} / {p['total_expected_positive_pairs']}`
* **Pilot Photo-Retrieval Recall**: `{p['pilot_photo_retrieval_recall']}`

---

## 📈 Similarity Score Distributions & Separation

* **SAME-Person Scores (26 pairs)**:
  * Min: `{s['same_distribution']['min']}` \| Max: `{s['same_distribution']['max']}` \| Mean: `{s['same_distribution']['mean']}` \| Median: `{s['same_distribution']['median']}`
* **DIFFERENT-Person Scores (54 pairs)**:
  * Min: `{s['different_distribution']['min']}` \| Max: `{s['different_distribution']['max']}` \| Mean: `{s['different_distribution']['mean']}` \| Median: `{s['different_distribution']['median']}`
* **Separation Status**: **{sep['status']}**
  * Lowest SAME Score: `{sep['lowest_same']}`
  * Highest DIFFERENT Score: `{sep['highest_different']}`
  * Overlap Range: `{sep['overlap_range'] or 'None (Clean Separation)'}`

---

## 📷 SOLO vs GROUP Performance

* **SOLO Event Photos**:
  * SAME Scores: Min `{s['solo_vs_group']['solo']['distribution']['min']}` \| Max `{s['solo_vs_group']['solo']['distribution']['max']}` \| Mean `{s['solo_vs_group']['solo']['distribution']['mean']}`
  * Recall at Current Threshold: `{s['solo_vs_group']['solo']['matrix']['recall']}` (TP: {s['solo_vs_group']['solo']['matrix']['tp']}, FN: {s['solo_vs_group']['solo']['matrix']['fn']})
* **GROUP Event Photos**:
  * SAME Scores: Min `{s['solo_vs_group']['group']['distribution']['min']}` \| Max `{s['solo_vs_group']['group']['distribution']['max']}` \| Mean `{s['solo_vs_group']['group']['distribution']['mean']}`
  * Recall at Current Threshold: `{s['solo_vs_group']['group']['matrix']['recall']}` (TP: {s['solo_vs_group']['group']['matrix']['tp']}, FN: {s['solo_vs_group']['group']['matrix']['fn']})

---

## 💡 Provisional Threshold Candidates (Offline Analysis Only)

> ⚠️ **Notice**: These threshold candidates are **PROVISIONAL** for Pilot v1 and must NOT be automatically applied to production.

| Candidate | Threshold | TP | FN | FP | TN | Recall | Precision | F1 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CURRENT** | `{s['threshold_candidates']['CURRENT']['threshold']}` | `{s['threshold_candidates']['CURRENT']['tp']}` | `{s['threshold_candidates']['CURRENT']['fn']}` | `{s['threshold_candidates']['CURRENT']['fp']}` | `{s['threshold_candidates']['CURRENT']['tn']}` | `{s['threshold_candidates']['CURRENT']['recall']}` | `{s['threshold_candidates']['CURRENT']['precision']}` | `{s['threshold_candidates']['CURRENT']['f1']}` |
| **PROVISIONAL MAX F1** | `{s['threshold_candidates']['PROVISIONAL_MAX_F1']['threshold']}` | `{s['threshold_candidates']['PROVISIONAL_MAX_F1']['tp']}` | `{s['threshold_candidates']['PROVISIONAL_MAX_F1']['fn']}` | `{s['threshold_candidates']['PROVISIONAL_MAX_F1']['fp']}` | `{s['threshold_candidates']['PROVISIONAL_MAX_F1']['tn']}` | `{s['threshold_candidates']['PROVISIONAL_MAX_F1']['recall']}` | `{s['threshold_candidates']['PROVISIONAL_MAX_F1']['precision']}` | `{s['threshold_candidates']['PROVISIONAL_MAX_F1']['f1']}` |
| **PROVISIONAL ZERO FP** | `{s['threshold_candidates']['PROVISIONAL_ZERO_FP']['threshold']}` | `{s['threshold_candidates']['PROVISIONAL_ZERO_FP']['tp']}` | `{s['threshold_candidates']['PROVISIONAL_ZERO_FP']['fn']}` | `{s['threshold_candidates']['PROVISIONAL_ZERO_FP']['fp']}` | `{s['threshold_candidates']['PROVISIONAL_ZERO_FP']['tn']}` | `{s['threshold_candidates']['PROVISIONAL_ZERO_FP']['recall']}` | `{s['threshold_candidates']['PROVISIONAL_ZERO_FP']['precision']}` | `{s['threshold_candidates']['PROVISIONAL_ZERO_FP']['f1']}` |

"""
        return md


# ==============================================================================
# CLI ENTRY POINT
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(description="Face Recognition Calibration & Evaluation Tool (Pilot v1)")
    parser.add_argument(
        "--manifest",
        type=str,
        default=str(REPO_ROOT / "experiments" / "face-calibration" / "manifest.json"),
        help="Path to manifest JSON file"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=str(REPO_ROOT / "experiments" / "face-calibration" / "results"),
        help="Directory to save evaluation results"
    )
    parser.add_argument(
        "--current-threshold-only",
        action="store_true",
        help="Skip threshold sweep and evaluate current threshold only"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose logging"
    )

    args = parser.parse_args()

    if args.verbose:
        logger.setLevel(logging.DEBUG)

    manifest_path = Path(args.manifest)
    output_dir = Path(args.output_dir)

    evaluator = FaceEvaluator(manifest_path=manifest_path, output_dir=output_dir, verbose=args.verbose)

    try:
        results = evaluator.run_evaluation(run_sweep=not args.current_threshold_only)
        m = results["current_threshold_matrix"]
        p = results["product_retrieval"]

        print("\n==================================================")
        print("FACE RECOGNITION EVALUATION COMPLETED SUCCESSFULLY")
        print("==================================================")
        print(f"Dataset:              {results['dataset']}")
        print(f"Model:                buffalo_l (512D L2-Normalized)")
        print(f"Current Threshold:    {results['current_threshold']}")
        print(f"Total Decisions:      {results['manifest_stats']['total_pairs']} (Pos: {results['manifest_stats']['positive_pairs']}, Neg: {results['manifest_stats']['negative_pairs']})")
        print(f"Current Confusion:    TP={m['tp']}, FN={m['fn']}, FP={m['fp']}, TN={m['tn']}")
        print(f"Classification Rec:   {m['recall']} | Prec: {m['precision']} | F1: {m['f1']}")
        print(f"Pilot Photo Recall:   {p['correct_positive_photo_retrievals']} / {p['total_expected_positive_pairs']} ({p['pilot_photo_retrieval_recall']})")
        print(f"Pilot Query Success:  {p['queries_with_at_least_one_correct']} / {p['total_queries']} ({p['pilot_query_success_rate']})")
        print(f"Output Directory:     {output_dir}")
        print("==================================================\n")

    except Exception as e:
        logger.error(f"Evaluation failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
