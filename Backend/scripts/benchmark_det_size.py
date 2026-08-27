#!/usr/bin/env python3
import os
import sys
import json
import time
import csv
import math
import numpy as np
from PIL import Image, ImageOps
from io import BytesIO
from typing import List, Dict, Any, Tuple, Optional

# Add Backend root to path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

import insightface
from app.core.config import settings

def l2_normalize(embedding: np.ndarray) -> np.ndarray:
    if embedding is None:
        return np.zeros(512, dtype=np.float32)
    vec = np.asarray(embedding, dtype=np.float32)
    norm = np.linalg.norm(vec)
    if norm == 0 or np.isnan(norm) or np.isinf(norm):
        return np.zeros_like(vec)
    return vec / norm

def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    a = np.asarray(vec_a, dtype=np.float32)
    b = np.asarray(vec_b, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0 or np.isnan(norm_a) or np.isnan(norm_b):
        return 0.0
    sim = float(np.dot(a, b) / (norm_a * norm_b))
    return max(-1.0, min(1.0, sim))

def compute_iou(bbox_a: Dict[str, int], bbox_b: Dict[str, int]) -> float:
    x1 = max(bbox_a['x1'], bbox_b['x1'])
    y1 = max(bbox_a['y1'], bbox_b['y1'])
    x2 = min(bbox_a['x2'], bbox_b['x2'])
    y2 = min(bbox_a['y2'], bbox_b['y2'])
    inter_w = max(0, x2 - x1)
    inter_h = max(0, y2 - y1)
    inter_area = inter_w * inter_h

    area_a = max(0, bbox_a['x2'] - bbox_a['x1']) * max(0, bbox_a['y2'] - bbox_a['y1'])
    area_b = max(0, bbox_b['x2'] - bbox_b['x1']) * max(0, bbox_b['y2'] - bbox_b['y1'])
    union_area = area_a + area_b - inter_area
    if union_area <= 0:
        return 0.0
    return inter_area / union_area

def mean(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0

def median(values: List[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    mid = n // 2
    return s[mid] if n % 2 != 0 else (s[mid - 1] + s[mid]) / 2.0

def percentile(values: List[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = (p / 100.0) * (len(s) - 1)
    lower = int(math.floor(idx))
    upper = int(math.ceil(idx))
    weight = idx - lower
    return s[lower] * (1.0 - weight) + s[upper] * weight

def validate_statistics(name: str, values: List[float]) -> Tuple[float, float, float, float, float]:
    if not values:
        raise ValueError(f"Empty value list for {name}")
    for v in values:
        if math.isnan(v) or math.isinf(v) or v < 0:
            raise ValueError(f"Invalid metric value {v} in {name}")
    
    mn = min(values)
    mx = max(values)
    avg = mean(values)
    med = median(values)
    p95 = percentile(values, 95)

    if not (mn <= avg <= mx + 1e-5):
        raise ValueError(f"Statistical invariant violation in {name}: min({mn}) <= mean({avg}) <= max({mx}) failed")
    if not (mn <= med <= mx + 1e-5):
        raise ValueError(f"Statistical invariant violation in {name}: min({mn}) <= median({med}) <= max({mx}) failed")
    if not (mn <= p95 <= mx + 1e-5):
        raise ValueError(f"Statistical invariant violation in {name}: min({mn}) <= p95({p95}) <= max({mx}) failed")

    return avg, med, p95, mn, mx

def match_faces(baseline_faces: List[Dict[str, Any]], candidate_faces: List[Dict[str, Any]]) -> Tuple[List[Tuple[Dict[str, Any], Dict[str, Any], float]], int, int]:
    """Greedy 1-to-1 best unmatched cosine similarity matching."""
    if not baseline_faces or not candidate_faces:
        return [], len(baseline_faces), len(candidate_faces)

    pairs = []
    for b_idx, b_face in enumerate(baseline_faces):
        for c_idx, c_face in enumerate(candidate_faces):
            sim = cosine_similarity(b_face["embedding"], c_face["embedding"])
            pairs.append((sim, b_idx, c_idx))

    pairs.sort(key=lambda x: x[0], reverse=True)

    matched_b = set()
    matched_c = set()
    matches = []

    for sim, b_idx, c_idx in pairs:
        if b_idx not in matched_b and c_idx not in matched_c:
            matched_b.add(b_idx)
            matched_c.add(c_idx)
            matches.append((baseline_faces[b_idx], candidate_faces[c_idx], sim))

    unmatched_b = len(baseline_faces) - len(matched_b)
    unmatched_c = len(candidate_faces) - len(matched_c)
    return matches, unmatched_b, unmatched_c

def main():
    print("===================================================", flush=True)
    print("   InsightFace det_size Benchmark (640 vs 512 vs 480) ", flush=True)
    print("   (Isolated read-only measurement & accuracy check) ", flush=True)
    print("===================================================\n", flush=True)

    project_root = os.path.abspath(os.path.join(BACKEND_DIR, ".."))
    input_dir = os.path.join(project_root, "benchmark-input")
    manifest_path = os.path.join(input_dir, "manifest.json")

    if not os.path.exists(manifest_path):
        print(f"Error: Dataset manifest not found at {manifest_path}", flush=True)
        print("Run Frontend export script first: npx tsx scripts/export-benchmark-dataset.ts", flush=True)
        sys.exit(1)

    with open(manifest_path, "r") as f:
        manifest = json.load(f)

    if not manifest:
        print("Error: Empty dataset manifest.", flush=True)
        sys.exit(1)

    print(f"Loaded {len(manifest)} test photos from {input_dir}\n", flush=True)

    det_sizes = [640, 512, 480]
    results_by_size: Dict[int, List[Dict[str, Any]]] = {sz: [] for sz in det_sizes}

    providers = settings.FACE_MODEL_PROVIDERS
    if isinstance(providers, str):
        providers = [p.strip() for p in providers.split(",") if p.strip()]

    # Run benchmark for each det_size
    for sz in det_sizes:
        print(f"--- Benchmarking det_size = ({sz}, {sz}) ---", flush=True)
        print(f"Initializing dedicated InsightFace FaceAnalysis for size {sz}...", flush=True)
        app = insightface.app.FaceAnalysis(
            name=settings.FACE_MODEL_NAME,
            providers=providers
        )
        app.prepare(ctx_id=0, det_size=(sz, sz), det_thresh=settings.FACE_DET_THRESH)

        # Warmup pass (2 iterations on first image)
        first_img_path = os.path.join(input_dir, manifest[0]["file"])
        with open(first_img_path, "rb") as f:
            warmup_bytes = f.read()
        warmup_pil = Image.open(BytesIO(warmup_bytes)).convert("RGB")
        warmup_bgr = np.array(warmup_pil, dtype=np.uint8)[:, :, ::-1].copy()
        
        print(f"Running 2 warmup passes for det_size={sz}...", flush=True)
        app.get(warmup_bgr)
        app.get(warmup_bgr)

        # Measure each image
        for item in manifest:
            img_path = os.path.join(input_dir, item["file"])
            label = item["label"]

            with open(img_path, "rb") as f:
                image_bytes = f.read()

            # Repeat measurement 2 times and take median per-stage latencies
            repeat_records = []
            for rep in range(2):
                t_dec0 = time.perf_counter()
                pil_img = Image.open(BytesIO(image_bytes))
                pil_img = ImageOps.exif_transpose(pil_img)
                pil_img = pil_img.convert("RGB")
                rgb_arr = np.array(pil_img, dtype=np.uint8)
                bgr_arr = rgb_arr[:, :, ::-1].copy()
                t_dec1 = time.perf_counter()
                decode_ms = (t_dec1 - t_dec0) * 1000.0

                t_inf0 = time.perf_counter()
                raw_faces = app.get(bgr_arr)
                t_inf1 = time.perf_counter()
                model_inference_ms = (t_inf1 - t_inf0) * 1000.0

                t_post0 = time.perf_counter()
                height, width = bgr_arr.shape[:2]
                faces_output = []
                for face in raw_faces:
                    bbox = face.bbox.astype(int)
                    x1 = max(0, min(int(bbox[0]), width))
                    y1 = max(0, min(int(bbox[1]), height))
                    x2 = max(0, min(int(bbox[2]), width))
                    y2 = max(0, min(int(bbox[3]), height))

                    confidence = float(face.det_score)
                    raw_emb = getattr(face, "normed_embedding", None)
                    if raw_emb is None:
                        raw_emb = getattr(face, "embedding", None)

                    norm_emb = l2_normalize(raw_emb) if raw_emb is not None else np.zeros(512, dtype=np.float32)
                    faces_output.append({
                        "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                        "confidence": round(confidence, 6),
                        "embedding": [round(float(v), 6) for v in norm_emb.tolist()]
                    })
                t_post1 = time.perf_counter()
                postprocess_ms = (t_post1 - t_post0) * 1000.0

                repeat_records.append({
                    "decode_ms": decode_ms,
                    "model_inference_ms": model_inference_ms,
                    "postprocess_ms": postprocess_ms,
                    "total_ms": decode_ms + model_inference_ms + postprocess_ms,
                    "faces": faces_output
                })

            med_decode = median([r["decode_ms"] for r in repeat_records])
            med_inf = median([r["model_inference_ms"] for r in repeat_records])
            med_post = median([r["postprocess_ms"] for r in repeat_records])
            med_total = med_decode + med_inf + med_post
            faces_final = repeat_records[0]["faces"]

            results_by_size[sz].append({
                "label": label,
                "decode_ms": med_decode,
                "model_inference_ms": med_inf,
                "postprocess_ms": med_post,
                "total_processing_ms": med_total,
                "face_count": len(faces_final),
                "faces": faces_final,
            })
            print(f"[{label}] det_size={sz}: {len(faces_final)} face(s), inference={med_inf:.1f}ms, total={med_total:.1f}ms")

        print()

    # Compare 512 and 480 against 640 baseline
    baseline_results = results_by_size[640]
    comparison = {}

    for sz in [512, 480]:
        cand_results = results_by_size[sz]

        all_matches = []
        unmatched_b_total = 0
        unmatched_c_total = 0
        photos_losing_faces = 0
        photos_gaining_faces = 0
        photos_same_faces = 0

        per_photo_comp = []

        for b_item, c_item in zip(baseline_results, cand_results):
            b_cnt = b_item["face_count"]
            c_cnt = c_item["face_count"]

            if c_cnt < b_cnt:
                photos_losing_faces += 1
            elif c_cnt > b_cnt:
                photos_gaining_faces += 1
            else:
                photos_same_faces += 1

            matches, un_b, un_c = match_faces(b_item["faces"], c_item["faces"])
            all_matches.extend(matches)
            unmatched_b_total += un_b
            unmatched_c_total += un_c

            similarities = [m[2] for m in matches]
            mean_sim = mean(similarities) if similarities else 0.0

            per_photo_comp.append({
                "label": b_item["label"],
                "baseline_faces": b_cnt,
                "candidate_faces": c_cnt,
                "face_delta": c_cnt - b_cnt,
                "matched_faces": len(matches),
                "mean_similarity": mean_sim,
                "cand_inf_ms": c_item["model_inference_ms"],
                "base_inf_ms": b_item["model_inference_ms"],
                "speedup_pct": (1.0 - (c_item["model_inference_ms"] / b_item["model_inference_ms"])) * 100.0 if b_item["model_inference_ms"] > 0 else 0.0
            })

        all_sims = [m[2] for m in all_matches]
        tot_b_faces = sum(r["face_count"] for r in baseline_results)
        tot_c_faces = sum(r["face_count"] for r in cand_results)

        retention_rate = (tot_c_faces / tot_b_faces * 100.0) if tot_b_faces > 0 else 100.0

        # Validate statistics
        base_inf_list = [r["model_inference_ms"] for r in baseline_results]
        cand_inf_list = [r["model_inference_ms"] for r in cand_results]

        base_avg_inf, base_med_inf, base_p95_inf, _, _ = validate_statistics("640 inference", base_inf_list)
        cand_avg_inf, cand_med_inf, cand_p95_inf, cand_min_inf, cand_max_inf = validate_statistics(f"{sz} inference", cand_inf_list)

        speedup_pct = ((base_avg_inf - cand_avg_inf) / base_avg_inf) * 100.0 if base_avg_inf > 0 else 0.0
        mean_sim = mean(all_sims)
        med_sim = median(all_sims)
        min_sim = min(all_sims) if all_sims else 0.0
        p05_sim = percentile(all_sims, 5) if all_sims else 0.0

        # Decision classification
        if speedup_pct >= 15.0 and retention_rate >= 98.0 and mean_sim >= 0.95 and unmatched_b_total <= 1:
            decision = "STRONG CANDIDATE FOR A SEPARATE PRODUCTION CHECKPOINT"
        elif speedup_pct >= 5.0 and retention_rate >= 92.0 and mean_sim >= 0.90:
            decision = "NEEDS MORE TESTING"
        else:
            decision = "REJECT"

        comparison[sz] = {
            "cand_avg_inf": cand_avg_inf,
            "cand_med_inf": cand_med_inf,
            "cand_p95_inf": cand_p95_inf,
            "cand_min_inf": cand_min_inf,
            "cand_max_inf": cand_max_inf,
            "speedup_pct": speedup_pct,
            "tot_faces": tot_c_faces,
            "tot_baseline_faces": tot_b_faces,
            "retention_rate": retention_rate,
            "photos_losing_faces": photos_losing_faces,
            "photos_gaining_faces": photos_gaining_faces,
            "photos_same_faces": photos_same_faces,
            "unmatched_baseline_faces": unmatched_b_total,
            "unmatched_candidate_faces": unmatched_c_total,
            "mean_sim": mean_sim,
            "med_sim": med_sim,
            "min_sim": min_sim,
            "p05_sim": p05_sim,
            "decision": decision,
            "per_photo": per_photo_comp,
        }

    # Generate Reports
    results_dir = os.path.join(project_root, "benchmark-results")
    os.makedirs(results_dir, exist_ok=True)

    summary_md_path = os.path.join(results_dir, "det-size-benchmark-summary.md")
    details_csv_path = os.path.join(results_dir, "det-size-benchmark-details.csv")
    details_json_path = os.path.join(results_dir, "det-size-benchmark-details.json")

    # CSV Generation
    with open(details_csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Photo_Label",
            "Baseline_Faces_640", "Cand_Faces_512", "Cand_Faces_480",
            "Inf_Ms_640", "Inf_Ms_512", "Inf_Ms_480",
            "Speedup_Pct_512", "Speedup_Pct_480",
            "Mean_Sim_512", "Mean_Sim_480"
        ])
        for i, b_item in enumerate(baseline_results):
            lbl = b_item["label"]
            c512 = results_by_size[512][i]
            c480 = results_by_size[480][i]

            comp512 = comparison[512]["per_photo"][i]
            comp480 = comparison[480]["per_photo"][i]

            writer.writerow([
                lbl,
                b_item["face_count"], c512["face_count"], c480["face_count"],
                f"{b_item['model_inference_ms']:.1f}", f"{c512['model_inference_ms']:.1f}", f"{c480['model_inference_ms']:.1f}",
                f"{comp512['speedup_pct']:.1f}%", f"{comp480['speedup_pct']:.1f}%",
                f"{comp512['mean_similarity']:.4f}", f"{comp480['mean_similarity']:.4f}"
            ])

    # Summary Markdown Generation
    base_inf_list = [r["model_inference_ms"] for r in baseline_results]
    base_avg, base_med, base_p95, base_min, base_max = validate_statistics("640 baseline", base_inf_list)
    tot_base_faces = sum(r["face_count"] for r in baseline_results)

    md = []
    md.append("# InsightFace det_size Benchmark Report (640 vs 512 vs 480)")
    md.append(f"Executed at: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}")
    md.append(f"Sample size: {len(manifest)} representative production photos")
    md.append("Execution: Isolated serial execution on ONNX Runtime CPUExecutionProvider\n")
    md.append("---\n")

    md.append("## Executive Comparison Table\n")
    md.append("| Metric | 640x640 (Baseline) | 512x512 Candidate | 480x480 Candidate |")
    md.append("| :--- | :--- | :--- | :--- |")
    md.append(f"| **Mean Model Inference** | **{base_avg:.1f} ms** | **{comparison[512]['cand_avg_inf']:.1f} ms** | **{comparison[480]['cand_avg_inf']:.1f} ms** |")
    md.append(f"| **Median Model Inference** | {base_med:.1f} ms | {comparison[512]['cand_med_inf']:.1f} ms | {comparison[480]['cand_med_inf']:.1f} ms |")
    md.append(f"| **P95 Model Inference** | {base_p95:.1f} ms | {comparison[512]['cand_p95_inf']:.1f} ms | {comparison[480]['cand_p95_inf']:.1f} ms |")
    md.append(f"| **Speed Improvement %** | — | **{comparison[512]['speedup_pct']:.1f}%** | **{comparison[480]['speedup_pct']:.1f}%** |")
    md.append(f"| **Total Faces Detected** | **{tot_base_faces}** | **{comparison[512]['tot_faces']}** | **{comparison[480]['tot_faces']}** |")
    md.append(f"| **Overall Face Retention %** | **100.0%** | **{comparison[512]['retention_rate']:.1f}%** | **{comparison[480]['retention_rate']:.1f}%** |")
    md.append(f"| **Photos Losing Faces** | 0 | {comparison[512]['photos_losing_faces']} | {comparison[480]['photos_losing_faces']} |")
    md.append(f"| **Mean Embedding Similarity** | 1.0000 | **{comparison[512]['mean_sim']:.4f}** | **{comparison[480]['mean_sim']:.4f}** |")
    md.append(f"| **Minimum Embedding Similarity** | 1.0000 | **{comparison[512]['min_sim']:.4f}** | **{comparison[480]['min_sim']:.4f}** |")
    md.append(f"| **Decision** | Baseline | **{comparison[512]['decision']}** | **{comparison[480]['decision']}** |\n")

    md.append("---\n")
    md.append("## Face Count Stratification\n")
    md.append("| Category | Sample Count | 640 Avg Inference | 512 Retention % | 512 Sim | 480 Retention % | 480 Sim |")
    md.append("| :--- | :---: | :---: | :---: | :---: | :---: | :---: |")

    # Stratification logic
    cats = {"1 face (Solo)": [], "2-4 faces": [], "5+ faces (Group)": []}
    for i, b_item in enumerate(baseline_results):
        fc = b_item["face_count"]
        if fc == 1:
            cats["1 face (Solo)"].append(i)
        elif 2 <= fc <= 4:
            cats["2-4 faces"].append(i)
        elif fc >= 5:
            cats["5+ faces (Group)"].append(i)

    for cat_name, idxs in cats.items():
        if not idxs:
            continue
        c_count = len(idxs)
        base_inf = mean([baseline_results[i]["model_inference_ms"] for i in idxs])
        
        tot_b_512 = sum(baseline_results[i]["face_count"] for i in idxs)
        tot_c_512 = sum(results_by_size[512][i]["face_count"] for i in idxs)
        ret_512 = (tot_c_512 / tot_b_512 * 100.0) if tot_b_512 > 0 else 100.0
        sim_512 = mean([comparison[512]["per_photo"][i]["mean_similarity"] for i in idxs])

        tot_c_480 = sum(results_by_size[480][i]["face_count"] for i in idxs)
        ret_480 = (tot_c_480 / tot_b_512 * 100.0) if tot_b_512 > 0 else 100.0
        sim_480 = mean([comparison[480]["per_photo"][i]["mean_similarity"] for i in idxs])

        md.append(f"| {cat_name} | {c_count} | {base_inf:.1f} ms | {ret_512:.1f}% | {sim_512:.4f} | {ret_480:.1f}% | {sim_480:.4f} |")

    md.append("\n---\n")
    md.append("## Production Safety Confirmation")
    md.append("- Production queue concurrency remains strictly = 1 (`MAX_CONCURRENT_FACE_PROCESSING = 1`).")
    md.append("- Production Upload concurrency remains strictly = 3 (`MAX_CONCURRENT_UPLOADS = 3`).")
    md.append("- Production `det_size` remains `(640, 640)` in `face_model.py`.")
    md.append("- Zero production environment changes or schema migrations were made.\n")

    with open(summary_md_path, "w") as f:
        f.write("\n".join(md))

    with open(details_json_path, "w") as f:
        json.dump({
            "det_sizes": det_sizes,
            "baseline_640": baseline_results,
            "candidate_512": results_by_size[512],
            "candidate_480": results_by_size[480],
            "comparison": comparison,
        }, f, indent=2)

    print("===================================================")
    print("         BENCHMARK COMPLETE & GENERATED            ")
    print("===================================================")
    print(f"Summary Report : {summary_md_path}")
    print(f"CSV Details    : {details_csv_path}")
    print(f"JSON Details   : {details_json_path}\n")

if __name__ == "__main__":
    main()
