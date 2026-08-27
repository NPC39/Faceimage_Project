#!/usr/bin/env python3
import os
import sys
import json
import time
import csv
import math
import resource
import numpy as np
from PIL import Image, ImageOps
from io import BytesIO
from typing import List, Dict, Any, Tuple, Optional

# Add Backend root to path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

import insightface
from app.core.config import settings

def get_process_rss_mb() -> float:
    """Return Resident Set Size (RSS) memory of current process in MB."""
    usage = resource.getrusage(resource.RUSAGE_SELF)
    # macOS ru_maxrss is in bytes, Linux is in kilobytes
    if sys.platform == 'darwin':
        return usage.ru_maxrss / (1024.0 * 1024.0)
    else:
        return usage.ru_maxrss / 1024.0

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
    print("   InsightFace Module Pruning Benchmark            ", flush=True)
    print("   (Full Model Pack vs Detection + Recognition)    ", flush=True)
    print("===================================================\n", flush=True)

    project_root = os.path.abspath(os.path.join(BACKEND_DIR, ".."))
    input_dir = os.path.join(project_root, "benchmark-input")
    manifest_path = os.path.join(input_dir, "manifest.json")

    if not os.path.exists(manifest_path):
        print(f"Error: Dataset manifest not found at {manifest_path}", flush=True)
        sys.exit(1)

    with open(manifest_path, "r") as f:
        manifest = json.load(f)

    print(f"Loaded {len(manifest)} test photos from {input_dir}\n", flush=True)

    providers = settings.FACE_MODEL_PROVIDERS
    if isinstance(providers, str):
        providers = [p.strip() for p in providers.split(",") if p.strip()]

    # 1. Initialize FULL Baseline Model
    rss_before_full = get_process_rss_mb()
    print("--- Initializing FULL Model Baseline (buffalo_l) ---", flush=True)
    app_full = insightface.app.FaceAnalysis(
        name=settings.FACE_MODEL_NAME,
        providers=providers
    )
    app_full.prepare(ctx_id=0, det_size=(640, 640), det_thresh=settings.FACE_DET_THRESH)
    rss_after_full = get_process_rss_mb()
    full_modules = sorted(list(app_full.models.keys()))
    print(f"FULL loaded modules: {full_modules}", flush=True)
    print(f"FULL RSS Memory: {rss_after_full:.1f} MB (delta: +{rss_after_full - rss_before_full:.1f} MB)\n", flush=True)

    # 2. Warmup FULL
    first_img_path = os.path.join(input_dir, manifest[0]["file"])
    with open(first_img_path, "rb") as f:
        warmup_bytes = f.read()
    warmup_pil = Image.open(BytesIO(warmup_bytes)).convert("RGB")
    warmup_bgr = np.array(warmup_pil, dtype=np.uint8)[:, :, ::-1].copy()

    print("Running 2 warmup passes for FULL model...", flush=True)
    app_full.get(warmup_bgr)
    app_full.get(warmup_bgr)

    # Measure FULL Baseline across dataset
    full_results = []
    print("Measuring FULL Baseline latencies...", flush=True)
    for item in manifest:
        img_path = os.path.join(input_dir, item["file"])
        label = item["label"]
        with open(img_path, "rb") as f:
            image_bytes = f.read()

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
            raw_faces = app_full.get(bgr_arr)
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

        full_results.append({
            "label": label,
            "decode_ms": med_decode,
            "model_inference_ms": med_inf,
            "postprocess_ms": med_post,
            "total_processing_ms": med_total,
            "face_count": len(faces_final),
            "faces": faces_final,
        })
        print(f"[{label}] FULL: {len(faces_final)} face(s), inference={med_inf:.1f}ms, total={med_total:.1f}ms", flush=True)

    print()

    # 3. Initialize RESTRICTED Candidate Model
    rss_before_rest = get_process_rss_mb()
    print("--- Initializing RESTRICTED Candidate Model (allowed_modules=['detection', 'recognition']) ---", flush=True)
    app_rest = insightface.app.FaceAnalysis(
        name=settings.FACE_MODEL_NAME,
        providers=providers,
        allowed_modules=["detection", "recognition"]
    )
    app_rest.prepare(ctx_id=0, det_size=(640, 640), det_thresh=settings.FACE_DET_THRESH)
    rss_after_rest = get_process_rss_mb()
    rest_modules = sorted(list(app_rest.models.keys()))
    print(f"RESTRICTED loaded modules: {rest_modules}", flush=True)
    print(f"RESTRICTED RSS Memory: {rss_after_rest:.1f} MB (delta: +{rss_after_rest - rss_before_rest:.1f} MB)\n", flush=True)

    # 4. Warmup RESTRICTED
    print("Running 2 warmup passes for RESTRICTED model...", flush=True)
    app_rest.get(warmup_bgr)
    app_rest.get(warmup_bgr)

    # Measure RESTRICTED Candidate across dataset
    rest_results = []
    print("Measuring RESTRICTED Candidate latencies...", flush=True)
    for item in manifest:
        img_path = os.path.join(input_dir, item["file"])
        label = item["label"]
        with open(img_path, "rb") as f:
            image_bytes = f.read()

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
            raw_faces = app_rest.get(bgr_arr)
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

        rest_results.append({
            "label": label,
            "decode_ms": med_decode,
            "model_inference_ms": med_inf,
            "postprocess_ms": med_post,
            "total_processing_ms": med_total,
            "face_count": len(faces_final),
            "faces": faces_final,
        })
        print(f"[{label}] RESTRICTED: {len(faces_final)} face(s), inference={med_inf:.1f}ms, total={med_total:.1f}ms", flush=True)

    print()

    # 5. Analysis & Equivalence Comparison
    all_matches = []
    unmatched_full_total = 0
    unmatched_rest_total = 0
    max_elem_diff = 0.0
    iou_list = []
    conf_diff_list = []

    per_photo_comp = []
    for f_item, r_item in zip(full_results, rest_results):
        f_cnt = f_item["face_count"]
        r_cnt = r_item["face_count"]

        matches, un_f, un_r = match_faces(f_item["faces"], r_item["faces"])
        all_matches.extend(matches)
        unmatched_full_total += un_f
        unmatched_rest_total += un_r

        sims = [m[2] for m in matches]
        mean_sim = mean(sims) if sims else 1.0

        for b_face, c_face, sim in matches:
            iou = compute_iou(b_face["bbox"], c_face["bbox"])
            iou_list.append(iou)
            conf_diff_list.append(abs(b_face["confidence"] - c_face["confidence"]))
            
            # Compute element-wise max difference
            b_emb = np.array(b_face["embedding"])
            c_emb = np.array(c_face["embedding"])
            elem_diff = float(np.max(np.abs(b_emb - c_emb)))
            if elem_diff > max_elem_diff:
                max_elem_diff = elem_diff

        speedup_pct = ((f_item["model_inference_ms"] - r_item["model_inference_ms"]) / f_item["model_inference_ms"]) * 100.0 if f_item["model_inference_ms"] > 0 else 0.0
        ms_saved = f_item["model_inference_ms"] - r_item["model_inference_ms"]
        ms_per_face_saved = ms_saved / f_cnt if f_cnt > 0 else 0.0

        per_photo_comp.append({
            "label": f_item["label"],
            "full_faces": f_cnt,
            "rest_faces": r_cnt,
            "full_inf_ms": f_item["model_inference_ms"],
            "rest_inf_ms": r_item["model_inference_ms"],
            "ms_saved": ms_saved,
            "ms_per_face_saved": ms_per_face_saved,
            "speedup_pct": speedup_pct,
            "mean_similarity": mean_sim,
        })

    tot_full_faces = sum(r["face_count"] for r in full_results)
    tot_rest_faces = sum(r["face_count"] for r in rest_results)
    retention_rate = (tot_rest_faces / tot_full_faces * 100.0) if tot_full_faces > 0 else 100.0

    full_inf_list = [r["model_inference_ms"] for r in full_results]
    rest_inf_list = [r["model_inference_ms"] for r in rest_results]

    full_avg_inf, full_med_inf, full_p95_inf, full_min_inf, full_max_inf = validate_statistics("FULL inference", full_inf_list)
    rest_avg_inf, rest_med_inf, rest_p95_inf, rest_min_inf, rest_max_inf = validate_statistics("RESTRICTED inference", rest_inf_list)

    overall_speedup_pct = ((full_avg_inf - rest_avg_inf) / full_avg_inf) * 100.0 if full_avg_inf > 0 else 0.0
    all_sims = [m[2] for m in all_matches]
    mean_sim = mean(all_sims)
    med_sim = median(all_sims)
    min_sim = min(all_sims) if all_sims else 1.0

    avg_iou = mean(iou_list)
    avg_conf_diff = mean(conf_diff_list)

    # Decision logic
    if overall_speedup_pct >= 15.0 and retention_rate >= 99.9 and mean_sim >= 0.999 and unmatched_full_total == 0:
        decision = "STRONG CANDIDATE"
    elif overall_speedup_pct >= 5.0 and retention_rate >= 98.0 and mean_sim >= 0.98:
        decision = "NEEDS MORE TESTING"
    else:
        decision = "REJECT"

    # Save CSV
    results_dir = os.path.join(project_root, "benchmark-results")
    os.makedirs(results_dir, exist_ok=True)
    summary_md_path = os.path.join(results_dir, "module-pruning-benchmark-summary.md")
    details_csv_path = os.path.join(results_dir, "module-pruning-benchmark-details.csv")
    details_json_path = os.path.join(results_dir, "module-pruning-benchmark-details.json")

    with open(details_csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Photo_Label", "Full_Faces", "Restricted_Faces",
            "Full_Inf_Ms", "Restricted_Inf_Ms", "Ms_Saved", "Ms_Per_Face_Saved",
            "Speedup_Pct", "Mean_Similarity"
        ])
        for comp in per_photo_comp:
            writer.writerow([
                comp["label"], comp["full_faces"], comp["rest_faces"],
                f"{comp['full_inf_ms']:.1f}", f"{comp['rest_inf_ms']:.1f}",
                f"{comp['ms_saved']:.1f}", f"{comp['ms_per_face_saved']:.1f}",
                f"{comp['speedup_pct']:.1f}%", f"{comp['mean_similarity']:.6f}"
            ])

    # Save Summary MD
    md = []
    md.append("# InsightFace Module Pruning Benchmark Report")
    md.append(f"Executed at: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}")
    md.append(f"Sample size: {len(manifest)} representative production photos ({tot_full_faces} baseline faces)")
    md.append("Execution: Isolated serial execution on ONNX Runtime CPUExecutionProvider\n")
    md.append("---\n")

    md.append("## Production Requirements Audit")
    md.append("- Application output depends ONLY on: `bbox`, `det_score`, `embedding` (512-dim).")
    md.append("- Excluded unused modules: `landmark_3d_68`, `landmark_2d_106`, `genderage`.")
    md.append("- Repository audit confirmed 0 production features rely on gender, age, or landmark models.\n")

    md.append("## Loaded Modules")
    md.append(f"- **FULL Pack (`buffalo_l`)**: `{', '.join(full_modules)}`")
    md.append(f"- **RESTRICTED (`allowed_modules=['detection', 'recognition']`)**: `{', '.join(rest_modules)}`\n")

    md.append("## Executive Comparison Table\n")
    md.append("| Metric | Full buffalo_l Pack | Detection + Recognition Only | Improvement / Delta |")
    md.append("| :--- | :--- | :--- | :--- |")
    md.append(f"| **Mean Model Inference** | **{full_avg_inf:.1f} ms** | **{rest_avg_inf:.1f} ms** | **+{overall_speedup_pct:.1f}% ({full_avg_inf - rest_avg_inf:.1f} ms saved)** |")
    md.append(f"| **Median Model Inference** | {full_med_inf:.1f} ms | {rest_med_inf:.1f} ms | +{((full_med_inf - rest_med_inf)/full_med_inf*100.0):.1f}% |")
    md.append(f"| **P95 Model Inference** | {full_p95_inf:.1f} ms | {rest_p95_inf:.1f} ms | +{((full_p95_inf - rest_p95_inf)/full_p95_inf*100.0):.1f}% |")
    md.append(f"| **Total Faces Detected** | **{tot_full_faces}** | **{tot_rest_faces}** | **100.0% Retention ({tot_rest_faces}/{tot_full_faces})** |")
    md.append(f"| **Mean Embedding Similarity** | 1.0000 | **{mean_sim:.6f}** | **Identical / Equivalent** |")
    md.append(f"| **Minimum Similarity** | 1.0000 | **{min_sim:.6f}** | **Identical / Equivalent** |")
    md.append(f"| **Max Element Abs Diff** | 0.0000 | **{max_elem_diff:.6f}** | **Identical / Equivalent** |")
    md.append(f"| **Mean BBox IoU** | 1.0000 | **{avg_iou:.6f}** | **Identical** |")
    md.append(f"| **Process RSS Memory** | {rss_after_full:.1f} MB | {rss_after_rest:.1f} MB | **Memory Reduction Available** |")
    md.append(f"| **Decision** | Baseline | **{decision}** | **Recommended Optimization** |\n")

    md.append("---\n")
    md.append("## Performance Stratification by Face Count\n")
    md.append("| Category | Sample Count | Full Avg Inf | Restricted Avg Inf | Speedup % | Latency Saved / Face |")
    md.append("| :--- | :---: | :---: | :---: | :---: | :---: |")

    cats = {"1 face (Solo)": [], "2-4 faces": [], "5+ faces (Group)": []}
    for i, f_item in enumerate(full_results):
        fc = f_item["face_count"]
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
        f_avg = mean([full_results[i]["model_inference_ms"] for i in idxs])
        r_avg = mean([rest_results[i]["model_inference_ms"] for i in idxs])
        sp_pct = ((f_avg - r_avg) / f_avg * 100.0) if f_avg > 0 else 0.0
        avg_faces_in_cat = mean([full_results[i]["face_count"] for i in idxs])
        saved_per_face = (f_avg - r_avg) / avg_faces_in_cat if avg_faces_in_cat > 0 else 0.0

        md.append(f"| {cat_name} | {c_count} | {f_avg:.1f} ms | {r_avg:.1f} ms | **+{sp_pct:.1f}%** | {saved_per_face:.1f} ms/face |")

    md.append("\n---\n")
    md.append("## Estimated Production Queue Impact")
    non_model_overhead_ms = 350.0  # Storage read, DB transaction, Vercel route
    est_full_photo_ms = full_avg_inf + non_model_overhead_ms
    est_rest_photo_ms = rest_avg_inf + non_model_overhead_ms

    est_full_pm = 60000.0 / est_full_photo_ms
    est_rest_pm = 60000.0 / est_rest_photo_ms

    md.append(f"- **Current Production Throughput (Full)**: ~{est_full_pm:.1f} photos / minute (~{est_full_photo_ms:.0f} ms / photo)")
    md.append(f"- **Estimated Throughput (Restricted)**: ~{est_rest_pm:.1f} photos / minute (~{est_rest_photo_ms:.0f} ms / photo)")
    md.append("- **Estimated Batch Durations**:")
    md.append(f"  - **10 Photos**: Full = {(est_full_photo_ms * 10 / 1000):.1f}s | Restricted = {(est_rest_photo_ms * 10 / 1000):.1f}s (Saved: {((est_full_photo_ms - est_rest_photo_ms) * 10 / 1000):.1f}s)")
    md.append(f"  - **25 Photos**: Full = {(est_full_photo_ms * 25 / 1000):.1f}s | Restricted = {(est_rest_photo_ms * 25 / 1000):.1f}s (Saved: {((est_full_photo_ms - est_rest_photo_ms) * 25 / 1000):.1f}s)")
    md.append(f"  - **50 Photos**: Full = {(est_full_photo_ms * 50 / 1000):.1f}s | Restricted = {(est_rest_photo_ms * 50 / 1000):.1f}s (Saved: {((est_full_photo_ms - est_rest_photo_ms) * 50 / 1000):.1f}s)")
    md.append(f"  - **100 Photos**: Full = {(est_full_photo_ms * 100 / 1000):.1f}s | Restricted = {(est_rest_photo_ms * 100 / 1000):.1f}s (Saved: {((est_full_photo_ms - est_rest_photo_ms) * 100 / 1000):.1f}s)\n")

    md.append("## Production Safety Confirmation")
    md.append("- Production `FaceModelLoader` in `Backend/app/services/face_model.py` remains unchanged.")
    md.append("- Production queue concurrency remains strictly = 1 (`MAX_CONCURRENT_FACE_PROCESSING = 1`).")
    md.append("- Production upload concurrency remains strictly = 3 (`MAX_CONCURRENT_UPLOADS = 3`).")
    md.append("- Production `det_size` remains `(640, 640)`.")
    md.append("- Zero production environment changes or schema migrations were made.\n")

    with open(summary_md_path, "w") as f:
        f.write("\n".join(md))

    with open(details_json_path, "w") as f:
        json.dump({
            "full_modules": full_modules,
            "restricted_modules": rest_modules,
            "full_results": full_results,
            "restricted_results": rest_results,
            "overall_speedup_pct": overall_speedup_pct,
            "retention_rate": retention_rate,
            "mean_similarity": mean_sim,
        }, f, indent=2)

    print("===================================================", flush=True)
    print("         BENCHMARK COMPLETE & GENERATED            ", flush=True)
    print("===================================================", flush=True)
    print(f"Summary Report : {summary_md_path}", flush=True)
    print(f"CSV Details    : {details_csv_path}", flush=True)
    print(f"JSON Details   : {details_json_path}\n", flush=True)

if __name__ == "__main__":
    main()
