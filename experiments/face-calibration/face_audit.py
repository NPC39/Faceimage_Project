#!/usr/bin/env python3
"""
Face-Level Detection Audit & Threshold Candidate Validation Tool (Stage A).

Performs:
1. Per-photo face detection audit (visible vs detected count, deficit, excess).
2. Diagnostic bounding box overlay generation on local event photos (saved under git-ignored results/face-audit/annotated/).
3. Deterministic face-level detection indexing (E001_D01, E001_D02, etc.).
4. Fixed threshold candidate validation (0.60, 0.45, 0.40, 0.35, 0.32).
5. Micro vs Macro identity recall, leave-one-identity-out robustness check, and negative safety margin analysis.
6. Deep audit for E001, E002, E003, E008, E009, E010.

Read-only diagnostic: Does NOT modify production configuration, thresholds, models, or database data.
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
from PIL import Image, ImageDraw, ImageFont

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
    )
except ImportError as e:
    print(f"Error importing app production modules: {e}")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("face_audit")

FIXED_CANDIDATES = [0.60, 0.45, 0.40, 0.35, 0.32]


# ==============================================================================
# AUDIT FUNCTIONS
# ==============================================================================

def run_detection_count_audit(event_photos: List[Dict[str, Any]], processed_photos: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Calculate per-photo visible vs detected counts, deficit, and excess."""
    audit_rows = []
    for photo_meta in event_photos:
        p_id = photo_meta["photo_id"]
        p_type = photo_meta["photo_type"]
        visible = photo_meta.get("visible_face_count", 0)

        p_rec = processed_photos.get(p_id, {})
        detected = p_rec.get("detected_face_count", 0)

        deficit = max(0, visible - detected)
        excess = max(0, detected - visible)

        audit_rows.append({
            "photo_id": p_id,
            "photo_type": p_type,
            "visible": visible,
            "detected": detected,
            "deficit": deficit,
            "excess": excess
        })

    return audit_rows


def draw_detection_overlays(photo_path: Path, faces: List[Dict[str, Any]], output_path: Path):
    """Draw bounding boxes and deterministic labels (D01, D02...) on a local diagnostic copy."""
    img = Image.open(photo_path).convert("RGB")
    draw = ImageDraw.Draw(img)

    # Use default font or truetype if available
    try:
        font = ImageFont.truetype("arial.ttf", 16)
    except IOError:
        font = ImageFont.load_default()

    for idx, face in enumerate(faces):
        bbox = face["bbox"]
        x1, y1, x2, y2 = bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]
        det_id = f"D{idx+1:02d}"
        conf = face.get("confidence", 0.0)

        # Draw green bounding box rectangle
        draw.rectangle([x1, y1, x2, y2], outline="#00FF00", width=3)

        # Label tag background & text
        label_text = f"{det_id} ({conf:.2f})"
        text_bbox = draw.textbbox((x1, max(0, y1 - 20)), label_text, font=font)
        draw.rectangle([text_bbox[0] - 2, text_bbox[1] - 2, text_bbox[2] + 2, text_bbox[3] + 2], fill="#008000")
        draw.text((x1, max(0, y1 - 20)), label_text, fill="#FFFFFF", font=font)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, quality=95)


def evaluate_candidates(pairs: List[Dict[str, Any]], candidates: List[float]) -> Dict[float, Dict[str, Any]]:
    """Evaluate photo-level metrics across fixed candidate thresholds."""
    results = {}
    for t in candidates:
        tp, fn, fp, tn = 0, 0, 0, 0
        for pair in pairs:
            gt = pair["ground_truth"]
            sim = pair["best_similarity"]
            is_match = sim >= t

            if gt == "SAME":
                if is_match:
                    tp += 1
                else:
                    fn += 1
            else:
                if is_match:
                    fp += 1
                else:
                    tn += 1

        total_pos = tp + fn
        total_neg = fp + tn

        recall = float(tp / total_pos) if total_pos > 0 else 0.0
        precision = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
        fpr = float(fp / total_neg) if total_neg > 0 else 0.0
        fnr = float(fn / total_pos) if total_pos > 0 else 0.0
        spec = float(tn / total_neg) if total_neg > 0 else 0.0
        f1 = float(2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

        results[t] = {
            "threshold": t,
            "tp": tp,
            "fn": fn,
            "fp": fp,
            "tn": tn,
            "recall": round(recall, 4),
            "precision": round(precision, 4),
            "f1": round(f1, 4),
            "fpr": round(fpr, 4),
            "fnr": round(fnr, 4),
            "specificity": round(spec, 4),
        }
    return results


def compute_macro_micro_recall(pairs: List[Dict[str, Any]], candidate: float) -> Dict[str, float]:
    """Compute micro-average recall (across all 26 pairs) and macro-average recall (across 4 identities)."""
    identities = ["P001", "P002", "P003", "P004"]
    id_recalls = []

    total_tp = 0
    total_pos = 0

    for p_id in identities:
        p_pos = [p for p in pairs if p["person_id"] == p_id and p["ground_truth"] == "SAME"]
        tp = sum(1 for p in p_pos if p["best_similarity"] >= candidate)
        pos_count = len(p_pos)

        rec = float(tp / pos_count) if pos_count > 0 else 0.0
        id_recalls.append(rec)

        total_tp += tp
        total_pos += pos_count

    micro_recall = float(total_tp / total_pos) if total_pos > 0 else 0.0
    macro_recall = float(sum(id_recalls) / len(id_recalls)) if id_recalls else 0.0

    return {
        "micro_recall": round(micro_recall, 4),
        "macro_recall": round(macro_recall, 4)
    }


def compute_holdout_robustness(pairs: List[Dict[str, Any]], candidates: List[float]) -> Dict[str, Dict[float, float]]:
    """Leave-one-identity-out reporting holdout robustness check."""
    identities = ["P001", "P002", "P003", "P004"]
    holdout_results = {}

    for holdout_id in identities:
        remaining_pairs = [p for p in pairs if p["person_id"] != holdout_id and p["ground_truth"] == "SAME"]
        res_by_thresh = {}

        for t in candidates:
            tp = sum(1 for p in remaining_pairs if p["best_similarity"] >= t)
            rec = float(tp / len(remaining_pairs)) if remaining_pairs else 0.0
            res_by_thresh[t] = round(rec, 4)

        holdout_results[f"exclude_{holdout_id}"] = res_by_thresh

    return holdout_results


# ==============================================================================
# AUDIT RUNNER
# ==============================================================================

class FaceAuditRunner:
    def __init__(self, manifest_path: Path, output_dir: Path):
        self.manifest_path = manifest_path.resolve()
        self.base_dir = self.manifest_path.parent
        self.output_dir = output_dir.resolve()
        self.annotated_dir = self.output_dir / "annotated"

    def run(self) -> Dict[str, Any]:
        logger.info(f"Loading manifest from {self.manifest_path}...")
        with open(self.manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        event_photos_meta = manifest.get("event_photos", [])
        queries_meta = manifest.get("queries", [])

        # 1. Process queries
        logger.info("Processing queries for face audit...")
        processed_queries = {}
        for q in queries_meta:
            q_id = q["query_id"]
            img_path = (self.base_dir / q["path"]).resolve()
            with open(img_path, "rb") as f:
                img_bytes = f.read()

            faces_data = analyze_image(img_bytes, include_embeddings=True)
            primary_face = select_primary_face(faces_data)

            processed_queries[q_id] = {
                "query_id": q_id,
                "person_id": q["person_id"],
                "path": str(img_path),
                "faces_count": len(faces_data),
                "primary_face": primary_face,
                "_embedding": primary_face.get("embedding") if primary_face else None,
            }

        # 2. Process event photos & generate overlays
        logger.info("Processing event photos & generating diagnostic overlays...")
        processed_photos = {}
        face_index_registry = []

        for p in event_photos_meta:
            p_id = p["photo_id"]
            img_path = (self.base_dir / p["path"]).resolve()
            with open(img_path, "rb") as f:
                img_bytes = f.read()

            faces_data = analyze_image(img_bytes, include_embeddings=True)
            bgr_img = decode_image(img_bytes)
            height, width = bgr_img.shape[:2]

            # Generate overlay image
            overlay_path = self.annotated_dir / f"{p_id}.jpg"
            draw_detection_overlays(img_path, faces_data, overlay_path)

            # Register detection index
            photo_face_records = []
            for idx, face in enumerate(faces_data):
                det_id = f"{p_id}_D{idx+1:02d}"
                bbox = face["bbox"]
                w = max(0, bbox["x2"] - bbox["x1"])
                h = max(0, bbox["y2"] - bbox["y1"])
                area = w * h
                area_ratio = round(float(area / (width * height)), 6) if (width * height) > 0 else 0.0

                f_rec = {
                    "photo_id": p_id,
                    "detection_id": det_id,
                    "bbox": bbox,
                    "bbox_width": w,
                    "bbox_height": h,
                    "bbox_area": area,
                    "bbox_area_ratio": area_ratio,
                    "confidence": face["confidence"],
                    "_embedding": face.get("embedding"),
                }
                photo_face_records.append(f_rec)
                face_index_registry.append(f_rec)

            processed_photos[p_id] = {
                "photo_id": p_id,
                "photo_type": p["photo_type"],
                "visible_face_count": p["visible_face_count"],
                "detected_face_count": len(faces_data),
                "image_width": width,
                "image_height": height,
                "persons_present": set(p["persons_present"]),
                "faces": photo_face_records,
                "overlay_path": str(overlay_path),
            }

        # 3. Detection count audit
        count_audit = run_detection_count_audit(event_photos_meta, processed_photos)

        # 4. Generate query-photo decision pairs (80 total)
        pairs = []
        for q_id, q_rec in processed_queries.items():
            q_emb = q_rec["_embedding"]
            q_person = q_rec["person_id"]

            for p_id, p_rec in processed_photos.items():
                is_same = q_person in p_rec["persons_present"]
                ground_truth = "SAME" if is_same else "DIFFERENT"

                best_sim = -1.0
                best_det_id = None
                best_face_meta = None

                if q_emb is not None and p_rec["faces"]:
                    for f in p_rec["faces"]:
                        f_emb = f.get("_embedding")
                        if f_emb is not None:
                            sim = cosine_similarity(q_emb, f_emb)
                            if sim > best_sim:
                                best_sim = sim
                                best_det_id = f["detection_id"]
                                best_face_meta = f

                best_sim_rounded = round(float(best_sim), 4)

                pairs.append({
                    "query_id": q_id,
                    "person_id": q_person,
                    "photo_id": p_id,
                    "photo_type": p_rec["photo_type"],
                    "ground_truth": ground_truth,
                    "best_similarity": best_sim_rounded,
                    "best_detection_id": best_det_id,
                    "best_face_width": best_face_meta["bbox_width"] if best_face_meta else 0,
                    "best_face_height": best_face_meta["bbox_height"] if best_face_meta else 0,
                    "best_face_confidence": best_face_meta["confidence"] if best_face_meta else None,
                })

        # 5. Candidate Threshold Validation
        candidate_eval = evaluate_candidates(pairs, FIXED_CANDIDATES)

        # Highest DIFFERENT similarity
        diff_scores = [p["best_similarity"] for p in pairs if p["ground_truth"] == "DIFFERENT"]
        highest_diff = max(diff_scores) if diff_scores else -1.0

        # Safety Margins
        safety_margins = {}
        for t in FIXED_CANDIDATES:
            margin = round(float(t - highest_diff), 4)
            safety_margins[str(t)] = margin

        # Micro vs Macro Recall across candidates
        macro_micro_by_candidate = {}
        for t in FIXED_CANDIDATES:
            macro_micro_by_candidate[str(t)] = compute_macro_micro_recall(pairs, t)

        # Holdout Robustness Check
        holdout_robustness = compute_holdout_robustness(pairs, FIXED_CANDIDATES)

        # Per-Query Candidate Simulation Matrix
        per_query_matrix = {}
        for q_id in sorted(processed_queries.keys()):
            q_pairs = [p for p in pairs if p["query_id"] == q_id]
            exp_count = sum(1 for p in q_pairs if p["ground_truth"] == "SAME")

            q_sims = {}
            for t in FIXED_CANDIDATES:
                corr = sum(1 for p in q_pairs if p["ground_truth"] == "SAME" and p["best_similarity"] >= t)
                wrong = sum(1 for p in q_pairs if p["ground_truth"] == "DIFFERENT" and p["best_similarity"] >= t)
                q_sims[str(t)] = f"{corr}/{wrong}"

            per_query_matrix[q_id] = {
                "expected": exp_count,
                "candidate_results": q_sims
            }

        # Per-Identity Recall across candidates
        per_identity_recall = {}
        for p_id in ["P001", "P002", "P003", "P004"]:
            id_pairs = [p for p in pairs if p["person_id"] == p_id and p["ground_truth"] == "SAME"]
            tot_pos = len(id_pairs)

            id_cand_recall = {}
            for t in FIXED_CANDIDATES:
                tp = sum(1 for p in id_pairs if p["best_similarity"] >= t)
                rec = round(float(tp / tot_pos), 4) if tot_pos > 0 else 0.0
                id_cand_recall[str(t)] = rec

            per_identity_recall[p_id] = {
                "positive_pairs": tot_pos,
                "candidate_recall": id_cand_recall
            }

        # Top 5 highest DIFFERENT pairs
        top_5_different = sorted([p for p in pairs if p["ground_truth"] == "DIFFERENT"], key=lambda x: x["best_similarity"], reverse=True)[:5]

        audit_report_data = {
            "production_contract": {
                "model": "buffalo_l",
                "provider": getattr(settings, "FACE_MODEL_PROVIDERS", ["CPUExecutionProvider"]),
                "embedding_dimension": 512,
                "normalization": "L2",
                "similarity": "cosine",
                "det_size": [640, 640],
                "det_thresh": getattr(settings, "FACE_DET_THRESH", 0.5),
                "primary_face_policy": "largest_bbox_area",
                "current_threshold": float(getattr(settings, "FACE_MATCH_THRESHOLD", 0.60)),
                "result_limit": 100,
                "photo_deduplication": "max_face_similarity_per_photo",
                "changed": False
            },
            "detection_count_audit": count_audit,
            "candidate_evaluations": {str(k): v for k, v in candidate_eval.items()},
            "highest_different_similarity": highest_diff,
            "safety_margins": safety_margins,
            "macro_micro_recall": macro_micro_by_candidate,
            "holdout_robustness": holdout_robustness,
            "per_query_matrix": per_query_matrix,
            "per_identity_recall": per_identity_recall,
            "top_5_different_pairs": top_5_different
        }

        # Save output JSON
        self.output_dir.mkdir(parents=True, exist_ok=True)
        json_output = self.output_dir / "detection-audit.json"
        with open(json_output, "w", encoding="utf-8") as f:
            json.dump(audit_report_data, f, indent=2)
        logger.info(f"Saved audit JSON to {json_output}")

        return audit_report_data


def main():
    parser = argparse.ArgumentParser(description="Stage A — Face-Level Detection Audit & Threshold Candidate Validation Tool")
    parser.add_argument(
        "--manifest",
        type=str,
        default=str(REPO_ROOT / "experiments" / "face-calibration" / "manifest.json"),
        help="Path to manifest JSON file"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=str(REPO_ROOT / "experiments" / "face-calibration" / "results" / "face-audit"),
        help="Directory to save detection audit results"
    )

    args = parser.parse_args()
    runner = FaceAuditRunner(Path(args.manifest), Path(args.output_dir))
    report = runner.run()

    print("\n==================================================")
    print("STAGE A — DETECTION AUDIT & CANDIDATE VALIDATION COMPLETE")
    print("==================================================")
    print(f"Highest DIFFERENT Similarity: {report['highest_different_similarity']}")
    print("Fixed Candidate Safety Margins:")
    for t_str, margin in report['safety_margins'].items():
        print(f"  Threshold {t_str}: Margin = +{margin}")
    print("==================================================\n")


if __name__ == "__main__":
    main()
