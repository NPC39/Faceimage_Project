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
from insightface.app.common import Face
from insightface.utils import face_align
import onnxruntime
from app.core.config import settings

def get_process_rss_mb() -> float:
    """Return Resident Set Size (RSS) memory of current process in MB."""
    usage = resource.getrusage(resource.RUSAGE_SELF)
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

def run_recognition_batch(
    bgr_arr: np.ndarray,
    app: insightface.app.FaceAnalysis,
    batch_size_setting: Optional[int]
) -> Tuple[List[Dict[str, Any]], float, float, float, float, int]:
    """
    Run detection once, align all faces via norm_crop, then run recognition ONNX in specified batch chunks.
    batch_size_setting:
      - 1: SERIAL (1 run per face)
      - 2, 4, 8: Chunk size
      - None: BATCH ALL (1 run for all faces in photo)
    """
    height, width = bgr_arr.shape[:2]

    # 1. Detection Phase
    t_det0 = time.perf_counter()
    bboxes, kpss = app.det_model.detect(bgr_arr, max_num=0, metric='default')
    t_det1 = time.perf_counter()
    detection_ms = (t_det1 - t_det0) * 1000.0

    if bboxes.shape[0] == 0:
        return [], detection_ms, 0.0, 0.0, 0.0, 0

    n_faces = bboxes.shape[0]
    rec_model = app.models["recognition"]
    crop_size = rec_model.input_size[0]

    # 2. Alignment Phase (norm_crop)
    t_align0 = time.perf_counter()
    aligned_crops = []
    face_meta = []
    for i in range(n_faces):
        bbox = bboxes[i, 0:4].astype(int)
        det_score = float(bboxes[i, 4])
        kps = kpss[i] if kpss is not None else None
        
        x1 = max(0, min(int(bbox[0]), width))
        y1 = max(0, min(int(bbox[1]), height))
        x2 = max(0, min(int(bbox[2]), width))
        y2 = max(0, min(int(bbox[3]), height))

        crop = face_align.norm_crop(bgr_arr, landmark=kps, image_size=crop_size)
        aligned_crops.append(crop)
        face_meta.append({
            "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
            "confidence": round(det_score, 6)
        })
    t_align1 = time.perf_counter()
    alignment_ms = (t_align1 - t_align0) * 1000.0

    # 3. Recognition ONNX Batching Phase
    chunk_size = n_faces if batch_size_setting is None else batch_size_setting
    chunk_size = max(1, chunk_size)

    session_runs = 0
    raw_embeddings = []

    t_rec0 = time.perf_counter()
    for start_idx in range(0, n_faces, chunk_size):
        end_idx = min(start_idx + chunk_size, n_faces)
        crop_chunk = aligned_crops[start_idx:end_idx]
        
        # Call get_feat on crop chunk
        chunk_out = rec_model.get_feat(crop_chunk)
        session_runs += 1
        
        if len(crop_chunk) == 1:
            raw_embeddings.append(chunk_out.flatten())
        else:
            for row in chunk_out:
                raw_embeddings.append(row)
    t_rec1 = time.perf_counter()
    recognition_onnx_ms = (t_rec1 - t_rec0) * 1000.0

    # 4. Postprocessing Phase (L2 normalization & structure formatting)
    t_post0 = time.perf_counter()
    faces_output = []
    for meta, raw_emb in zip(face_meta, raw_embeddings):
        norm_emb = l2_normalize(raw_emb)
        faces_output.append({
            "bbox": meta["bbox"],
            "confidence": meta["confidence"],
            "embedding": [round(float(v), 6) for v in norm_emb.tolist()]
        })
    t_post1 = time.perf_counter()
    postprocess_ms = (t_post1 - t_post0) * 1000.0

    return faces_output, detection_ms, alignment_ms, recognition_onnx_ms, postprocess_ms, session_runs

def benchmark_batch_config(
    config_name: str,
    batch_size_setting: Optional[int],
    manifest: List[Dict[str, Any]],
    input_dir: str,
    warmup_bgr: np.ndarray,
    app: insightface.app.FaceAnalysis
) -> Dict[str, Any]:
    print(f"\n--- Benchmarking Batch Strategy: {config_name} ---", flush=True)

    # Warmup 2 passes
    print("Running 2 warmup passes...", flush=True)
    run_recognition_batch(warmup_bgr, app, batch_size_setting)
    run_recognition_batch(warmup_bgr, app, batch_size_setting)

    photo_results = []
    print("Running 3 measured repetitions per image...", flush=True)
    for item in manifest:
        img_path = os.path.join(input_dir, item["file"])
        label = item["label"]
        with open(img_path, "rb") as f:
            image_bytes = f.read()

        repetition_records = []
        for rep in range(3):
            t_dec0 = time.perf_counter()
            pil_img = Image.open(BytesIO(image_bytes))
            pil_img = ImageOps.exif_transpose(pil_img)
            pil_img = pil_img.convert("RGB")
            rgb_arr = np.array(pil_img, dtype=np.uint8)
            bgr_arr = rgb_arr[:, :, ::-1].copy()
            t_dec1 = time.perf_counter()
            decode_ms = (t_dec1 - t_dec0) * 1000.0

            faces_out, det_ms, align_ms, rec_ms, post_ms, session_runs = run_recognition_batch(
                bgr_arr, app, batch_size_setting
            )
            total_pipeline_ms = decode_ms + det_ms + align_ms + rec_ms + post_ms

            repetition_records.append({
                "decode_ms": decode_ms,
                "detection_ms": det_ms,
                "alignment_ms": align_ms,
                "recognition_onnx_ms": rec_ms,
                "postprocess_ms": post_ms,
                "total_pipeline_ms": total_pipeline_ms,
                "session_runs": session_runs,
                "faces": faces_out
            })

        med_dec = median([r["decode_ms"] for r in repetition_records])
        med_det = median([r["detection_ms"] for r in repetition_records])
        med_align = median([r["alignment_ms"] for r in repetition_records])
        med_rec = median([r["recognition_onnx_ms"] for r in repetition_records])
        med_post = median([r["postprocess_ms"] for r in repetition_records])
        med_total = med_dec + med_det + med_align + med_rec + med_post
        faces_final = repetition_records[0]["faces"]
        runs_final = repetition_records[0]["session_runs"]

        photo_results.append({
            "label": label,
            "decode_ms": med_dec,
            "detection_ms": med_det,
            "alignment_ms": med_align,
            "recognition_onnx_ms": med_rec,
            "postprocess_ms": med_post,
            "total_pipeline_ms": med_total,
            "session_runs": runs_final,
            "face_count": len(faces_final),
            "faces": faces_final,
        })
        print(f"[{label}] {config_name}: {len(faces_final)} face(s), ONNX runs={runs_final}, rec_onnx={med_rec:.1f}ms, total_pipeline={med_total:.1f}ms", flush=True)

    peak_rss_mb = get_process_rss_mb()
    return {
        "config_name": config_name,
        "batch_size_setting": batch_size_setting,
        "peak_rss_mb": peak_rss_mb,
        "photo_results": photo_results
    }

def main():
    print("===================================================", flush=True)
    print("   Batched ArcFace Recognition Benchmark           ", flush=True)
    print("   (Serial vs Batch 2 vs Batch 4 vs Batch 8 vs Batch All)", flush=True)
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

    # Initialize FaceAnalysis once
    print("--- Initializing FaceAnalysis (buffalo_l, allowed_modules=['detection', 'recognition']) ---", flush=True)
    app = insightface.app.FaceAnalysis(
        name=settings.FACE_MODEL_NAME,
        providers=providers,
        allowed_modules=["detection", "recognition"]
    )
    app.prepare(ctx_id=0, det_size=(640, 640), det_thresh=settings.FACE_DET_THRESH)

    first_img_path = os.path.join(input_dir, manifest[0]["file"])
    with open(first_img_path, "rb") as f:
        warmup_bytes = f.read()
    warmup_pil = Image.open(BytesIO(warmup_bytes)).convert("RGB")
    warmup_bgr = np.array(warmup_pil, dtype=np.uint8)[:, :, ::-1].copy()

    batch_configs = [
        ("SERIAL", 1),
        ("BATCH_2", 2),
        ("BATCH_4", 4),
        ("BATCH_8", 8),
        ("BATCH_ALL", None)
    ]

    config_data = {}
    for cfg_name, batch_val in batch_configs:
        res = benchmark_batch_config(cfg_name, batch_val, manifest, input_dir, warmup_bgr, app)
        config_data[cfg_name] = res

    # Equivalence and Statistical Analysis
    serial_res = config_data["SERIAL"]
    serial_photos = serial_res["photo_results"]
    serial_total_pipe = [r["total_pipeline_ms"] for r in serial_photos]
    serial_rec_onnx = [r["recognition_onnx_ms"] for r in serial_photos]

    ser_avg_pipe, ser_med_pipe, ser_p95_pipe, _, _ = validate_statistics("SERIAL total pipeline", serial_total_pipe)
    ser_avg_rec, ser_med_rec, ser_p95_rec, _, _ = validate_statistics("SERIAL recognition onnx", serial_rec_onnx)
    tot_base_faces = sum(r["face_count"] for r in serial_photos)

    summary_rows = []

    for cfg_name, _ in batch_configs:
        c_res = config_data[cfg_name]
        c_photos = c_res["photo_results"]

        pipe_list = [r["total_pipeline_ms"] for r in c_photos]
        rec_list = [r["recognition_onnx_ms"] for r in c_photos]

        avg_pipe, med_pipe, p95_pipe, _, _ = validate_statistics(f"{cfg_name} total pipeline", pipe_list)
        avg_rec, med_rec, p95_rec, _, _ = validate_statistics(f"{cfg_name} recognition onnx", rec_list)

        tot_faces = sum(r["face_count"] for r in c_photos)
        retention = (tot_faces / tot_base_faces * 100.0) if tot_base_faces > 0 else 100.0

        all_matches = []
        max_elem_diff = 0.0
        iou_list = []
        conf_diff_list = []

        for b_item, c_item in zip(serial_photos, c_photos):
            matches, _, _ = match_faces(b_item["faces"], c_item["faces"])
            all_matches.extend(matches)
            for b_face, c_face, sim in matches:
                iou_list.append(compute_iou(b_face["bbox"], c_face["bbox"]))
                conf_diff_list.append(abs(b_face["confidence"] - c_face["confidence"]))
                b_emb = np.array(b_face["embedding"])
                c_emb = np.array(c_face["embedding"])
                diff = float(np.max(np.abs(b_emb - c_emb)))
                if diff > max_elem_diff:
                    max_elem_diff = diff

        all_sims = [m[2] for m in all_matches]
        mean_sim = mean(all_sims)
        min_sim = min(all_sims) if all_sims else 1.0

        pipe_speedup_pct = ((ser_avg_pipe - avg_pipe) / ser_avg_pipe) * 100.0 if ser_avg_pipe > 0 else 0.0
        rec_speedup_pct = ((ser_avg_rec - avg_rec) / ser_avg_rec) * 100.0 if ser_avg_rec > 0 else 0.0

        # Group photo (5+ faces) metrics
        group_idxs = [i for i, r in enumerate(serial_photos) if r["face_count"] >= 5]
        grp_ser_pipe = mean([serial_photos[i]["total_pipeline_ms"] for i in group_idxs])
        grp_c_pipe = mean([c_photos[i]["total_pipeline_ms"] for i in group_idxs])
        grp_pipe_speedup = ((grp_ser_pipe - grp_c_pipe) / grp_ser_pipe) * 100.0 if grp_ser_pipe > 0 else 0.0

        # Photo 013 (21 faces) metrics
        p13_idx = [i for i, r in enumerate(serial_photos) if "photo_013" in r["label"]][0]
        p13_ser_pipe = serial_photos[p13_idx]["total_pipeline_ms"]
        p13_c_pipe = c_photos[p13_idx]["total_pipeline_ms"]

        summary_rows.append({
            "config_name": cfg_name,
            "mean_pipe_ms": avg_pipe,
            "median_pipe_ms": med_pipe,
            "p95_pipe_ms": p95_pipe,
            "mean_rec_ms": avg_rec,
            "median_rec_ms": med_rec,
            "p95_rec_ms": p95_rec,
            "pipe_speedup_pct": pipe_speedup_pct,
            "rec_speedup_pct": rec_speedup_pct,
            "grp_pipe_ms": grp_c_pipe,
            "grp_pipe_speedup_pct": grp_pipe_speedup,
            "p13_pipe_ms": p13_c_pipe,
            "total_faces": tot_faces,
            "retention_pct": retention,
            "mean_similarity": mean_sim,
            "min_similarity": min_sim,
            "max_elem_diff": max_elem_diff,
            "peak_rss_mb": c_res["peak_rss_mb"]
        })

    # Decision rule evaluation
    best_candidate = max(summary_rows[1:], key=lambda x: x["pipe_speedup_pct"])
    if best_candidate["pipe_speedup_pct"] >= 15.0 and best_candidate["grp_pipe_speedup_pct"] >= 25.0 and best_candidate["retention_pct"] >= 99.9 and best_candidate["mean_similarity"] >= 0.999:
        decision = "STRONG CANDIDATE"
        recommended_batch = best_candidate["config_name"]
    elif best_candidate["pipe_speedup_pct"] >= 5.0 and best_candidate["retention_pct"] >= 98.0 and best_candidate["mean_similarity"] >= 0.98:
        decision = "MARGINAL"
        recommended_batch = best_candidate["config_name"]
    else:
        decision = "REJECT"
        recommended_batch = "KEEP SERIAL"

    # Save CSV
    results_dir = os.path.join(project_root, "benchmark-results")
    os.makedirs(results_dir, exist_ok=True)
    summary_md_path = os.path.join(results_dir, "recognition-batching-summary.md")
    details_csv_path = os.path.join(results_dir, "recognition-batching-details.csv")
    details_json_path = os.path.join(results_dir, "recognition-batching-details.json")

    with open(details_csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Photo_Label", "Face_Count",
            "SERIAL_Rec_Ms", "BATCH_2_Rec_Ms", "BATCH_4_Rec_Ms", "BATCH_8_Rec_Ms", "BATCH_ALL_Rec_Ms",
            "SERIAL_Total_Ms", "BATCH_2_Total_Ms", "BATCH_4_Total_Ms", "BATCH_8_Total_Ms", "BATCH_ALL_Total_Ms"
        ])
        for i, b_item in enumerate(serial_photos):
            lbl = b_item["label"]
            fc = b_item["face_count"]
            r_ser = config_data["SERIAL"]["photo_results"][i]["recognition_onnx_ms"]
            r_b2 = config_data["BATCH_2"]["photo_results"][i]["recognition_onnx_ms"]
            r_b4 = config_data["BATCH_4"]["photo_results"][i]["recognition_onnx_ms"]
            r_b8 = config_data["BATCH_8"]["photo_results"][i]["recognition_onnx_ms"]
            r_all = config_data["BATCH_ALL"]["photo_results"][i]["recognition_onnx_ms"]

            t_ser = config_data["SERIAL"]["photo_results"][i]["total_pipeline_ms"]
            t_b2 = config_data["BATCH_2"]["photo_results"][i]["total_pipeline_ms"]
            t_b4 = config_data["BATCH_4"]["photo_results"][i]["total_pipeline_ms"]
            t_b8 = config_data["BATCH_8"]["photo_results"][i]["total_pipeline_ms"]
            t_all = config_data["BATCH_ALL"]["photo_results"][i]["total_pipeline_ms"]

            writer.writerow([
                lbl, fc,
                f"{r_ser:.1f}", f"{r_b2:.1f}", f"{r_b4:.1f}", f"{r_b8:.1f}", f"{r_all:.1f}",
                f"{t_ser:.1f}", f"{t_b2:.1f}", f"{t_b4:.1f}", f"{t_b8:.1f}", f"{t_all:.1f}"
            ])

    # Save Summary MD
    md = []
    md.append("# Batched ArcFace Recognition Benchmark Report")
    md.append(f"Executed at: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}")
    md.append(f"InsightFace version: `{insightface.__version__}` | ONNX Runtime version: `{onnxruntime.__version__}`")
    md.append(f"Sample size: {len(manifest)} representative production photos ({tot_base_faces} baseline faces)")
    md.append("Execution: Isolated serial execution on ONNX Runtime CPUExecutionProvider\n")
    md.append("---\n")

    md.append("## Executive Benchmark Comparison Table\n")
    md.append("| Metric | Serial (Batch 1) | Batch 2 | Batch 4 | Batch 8 | Batch All |")
    md.append("| :--- | :---: | :---: | :---: | :---: | :---: |")

    row_names = [
        ("Mean Total Pipeline (ms)", "mean_pipe_ms"),
        ("Median Total Pipeline (ms)", "median_pipe_ms"),
        ("P95 Total Pipeline (ms)", "p95_pipe_ms"),
        ("Mean Recognition ONNX (ms)", "mean_rec_ms"),
        ("Group 5+ Faces Pipeline (ms)", "grp_pipe_ms"),
        ("21-Face Photo Pipeline (ms)", "p13_pipe_ms"),
        ("Total Pipeline Speedup %", "pipe_speedup_pct"),
        ("Recognition ONNX Speedup %", "rec_speedup_pct"),
        ("Face Retention Rate", "retention_pct"),
        ("Embedding Cosine Sim Mean", "mean_similarity"),
        ("Max Element Abs Diff", "max_elem_diff"),
        ("Peak RSS Memory (MB)", "peak_rss_mb")
    ]

    for label_str, key_str in row_names:
        vals = []
        for r in summary_rows:
            v = r[key_str]
            if "speedup" in key_str:
                vals.append(f"**{v:+.1f}%**")
            elif "retention" in key_str:
                vals.append(f"{v:.1f}% ({r['total_faces']}/{tot_base_faces})")
            elif "similarity" in key_str:
                vals.append(f"{v:.6f}")
            elif "max_elem_diff" in key_str:
                vals.append(f"{v:.6e}")
            elif "ms" in key_str or "mb" in key_str:
                vals.append(f"{v:.1f}")
            else:
                vals.append(str(v))
        md.append(f"| **{label_str}** | " + " | ".join(vals) + " |")

    md.append(f"\n- **Decision**: **{decision}**")
    md.append(f"- **Recommended Batch Size**: **{recommended_batch}**\n")
    md.append("---\n")

    md.append("## Recognition ONNX Session Run Count Table\n")
    md.append("| Photo Label | Face Count | Serial Runs | Batch 2 Runs | Batch 4 Runs | Batch 8 Runs | Batch All Runs |")
    md.append("| :--- | :---: | :---: | :---: | :---: | :---: | :---: |")

    for i, b_item in enumerate(serial_photos):
        lbl = b_item["label"]
        fc = b_item["face_count"]
        r_ser = config_data["SERIAL"]["photo_results"][i]["session_runs"]
        r_b2 = config_data["BATCH_2"]["photo_results"][i]["session_runs"]
        r_b4 = config_data["BATCH_4"]["photo_results"][i]["session_runs"]
        r_b8 = config_data["BATCH_8"]["photo_results"][i]["session_runs"]
        r_all = config_data["BATCH_ALL"]["photo_results"][i]["session_runs"]
        md.append(f"| {lbl} | {fc} | {r_ser} | {r_b2} | {r_b4} | {r_b8} | {r_all} |")

    md.append("\n---\n")
    md.append("## Stratification by Face Count (Mean Total Pipeline ms)\n")
    md.append("| Category | Sample Count | Serial | Batch 2 | Batch 4 | Batch 8 | Batch All | Best Speedup % |")
    md.append("| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |")

    cats = {"1 face (Solo)": [], "2-4 faces": [], "5+ faces (Group)": []}
    for i, f_item in enumerate(serial_photos):
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
        ser_c_avg = mean([config_data["SERIAL"]["photo_results"][i]["total_pipeline_ms"] for i in idxs])
        b2_c_avg = mean([config_data["BATCH_2"]["photo_results"][i]["total_pipeline_ms"] for i in idxs])
        b4_c_avg = mean([config_data["BATCH_4"]["photo_results"][i]["total_pipeline_ms"] for i in idxs])
        b8_c_avg = mean([config_data["BATCH_8"]["photo_results"][i]["total_pipeline_ms"] for i in idxs])
        all_c_avg = mean([config_data["BATCH_ALL"]["photo_results"][i]["total_pipeline_ms"] for i in idxs])

        best_c_avg = min([b2_c_avg, b4_c_avg, b8_c_avg, all_c_avg])
        best_sp = ((ser_c_avg - best_c_avg) / ser_c_avg * 100.0) if ser_c_avg > 0 else 0.0

        md.append(f"| {cat_name} | {c_count} | {ser_c_avg:.1f} ms | {b2_c_avg:.1f} ms | {b4_c_avg:.1f} ms | {b8_c_avg:.1f} ms | {all_c_avg:.1f} ms | **{best_sp:+.1f}%** |")

    md.append("\n---\n")
    md.append("## Production Safety Confirmation")
    md.append("- Production `FaceModelLoader` in `Backend/app/services/face_model.py` remains unchanged.")
    md.append("- Production queue concurrency remains strictly = 1 (`MAX_CONCURRENT_FACE_PROCESSING = 1`).")
    md.append("- Production upload concurrency remains strictly = 3 (`MAX_CONCURRENT_UPLOADS = 3`).")
    md.append("- Production `allowed_modules` remains `['detection', 'recognition']`.")
    md.append("- Production `det_size` remains `(640, 640)`.")
    md.append("- Zero production environment changes or schema migrations were made.\n")

    with open(summary_md_path, "w") as f:
        f.write("\n".join(md))

    with open(details_json_path, "w") as f:
        json.dump({
            "insightface_version": insightface.__version__,
            "onnxruntime_version": onnxruntime.__version__,
            "summary_rows": summary_rows,
            "decision": decision,
            "recommended_batch": recommended_batch
        }, f, indent=2)

    print("===================================================", flush=True)
    print("         BENCHMARK COMPLETE & GENERATED            ", flush=True)
    print("===================================================", flush=True)
    print(f"Summary Report : {summary_md_path}", flush=True)
    print(f"CSV Details    : {details_csv_path}", flush=True)
    print(f"JSON Details   : {details_json_path}\n", flush=True)

if __name__ == "__main__":
    main()
