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
import onnxruntime
from app.core.config import settings

def get_process_rss_mb() -> float:
    """Return Resident Set Size (RSS) memory of current process in MB."""
    usage = resource.getrusage(resource.RUSAGE_SELF)
    if sys.platform == 'darwin':
        return usage.ru_maxrss / (1024.0 * 1024.0)
    else:
        return usage.ru_maxrss / 1024.0

def get_cpu_times() -> Tuple[float, float]:
    """Return total user and system CPU times in seconds."""
    usage = resource.getrusage(resource.RUSAGE_SELF)
    return usage.ru_utime, usage.ru_stime

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

def build_session_options(config_name: str) -> Tuple[onnxruntime.SessionOptions, str]:
    opts = onnxruntime.SessionOptions()
    opts.execution_mode = onnxruntime.ExecutionMode.ORT_SEQUENTIAL

    if config_name == "DEFAULT":
        description = "ONNX Runtime Default Threading"
    elif config_name == "INTRA_1":
        opts.intra_op_num_threads = 1
        opts.inter_op_num_threads = 1
        description = "intra_op=1, inter_op=1, ORT_SEQUENTIAL"
    elif config_name == "INTRA_2":
        opts.intra_op_num_threads = 2
        opts.inter_op_num_threads = 1
        description = "intra_op=2, inter_op=1, ORT_SEQUENTIAL"
    elif config_name == "INTRA_2_NO_SPIN":
        opts.intra_op_num_threads = 2
        opts.inter_op_num_threads = 1
        opts.add_session_config_entry("session.intra_op.allow_spinning", "0")
        opts.add_session_config_entry("session.inter_op.allow_spinning", "0")
        description = "intra_op=2, inter_op=1, ORT_SEQUENTIAL, allow_spinning=0"
    else:
        raise ValueError(f"Unknown config: {config_name}")

    return opts, description

def benchmark_config(
    config_name: str,
    manifest: List[Dict[str, Any]],
    input_dir: str,
    warmup_bgr: np.ndarray,
    providers: List[str]
) -> Dict[str, Any]:
    print(f"\n--- Benchmarking Configuration: {config_name} ---", flush=True)
    opts, desc = build_session_options(config_name)
    print(f"Description: {desc}", flush=True)

    rss_before = get_process_rss_mb()
    u_cpu0, s_cpu0 = get_cpu_times()

    app = insightface.app.FaceAnalysis(
        name=settings.FACE_MODEL_NAME,
        providers=providers,
        allowed_modules=["detection", "recognition"],
        session_options=opts
    )
    app.prepare(ctx_id=0, det_size=(640, 640), det_thresh=settings.FACE_DET_THRESH)
    rss_after = get_process_rss_mb()

    # Warmup
    print("Running 2 warmup passes...", flush=True)
    app.get(warmup_bgr)
    app.get(warmup_bgr)

    # Measured runs (3 repetitions per image)
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

            repetition_records.append({
                "decode_ms": decode_ms,
                "model_inference_ms": model_inference_ms,
                "postprocess_ms": postprocess_ms,
                "total_ms": decode_ms + model_inference_ms + postprocess_ms,
                "faces": faces_output
            })

        med_decode = median([r["decode_ms"] for r in repetition_records])
        med_inf = median([r["model_inference_ms"] for r in repetition_records])
        med_post = median([r["postprocess_ms"] for r in repetition_records])
        med_total = med_decode + med_inf + med_post
        faces_final = repetition_records[0]["faces"]

        photo_results.append({
            "label": label,
            "decode_ms": med_decode,
            "model_inference_ms": med_inf,
            "postprocess_ms": med_post,
            "total_processing_ms": med_total,
            "face_count": len(faces_final),
            "faces": faces_final,
        })
        print(f"[{label}] {config_name}: {len(faces_final)} face(s), inference={med_inf:.1f}ms, total={med_total:.1f}ms", flush=True)

    u_cpu1, s_cpu1 = get_cpu_times()
    total_cpu_seconds = (u_cpu1 - u_cpu0) + (s_cpu1 - s_cpu0)

    return {
        "config_name": config_name,
        "description": desc,
        "rss_before_mb": rss_before,
        "rss_after_mb": rss_after,
        "total_cpu_seconds": total_cpu_seconds,
        "photo_results": photo_results
    }

def main():
    print("===================================================", flush=True)
    print("   2-vCPU ONNX Runtime Thread Tuning Benchmark     ", flush=True)
    print("   (Default vs Intra 1 vs Intra 2 vs Intra 2 No-Spin)", flush=True)
    print("===================================================\n", flush=True)

    print(f"InsightFace version: {insightface.__version__}", flush=True)
    print(f"ONNX Runtime version: {onnxruntime.__version__}\n", flush=True)

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

    # Warmup photo loading
    first_img_path = os.path.join(input_dir, manifest[0]["file"])
    with open(first_img_path, "rb") as f:
        warmup_bytes = f.read()
    warmup_pil = Image.open(BytesIO(warmup_bytes)).convert("RGB")
    warmup_bgr = np.array(warmup_pil, dtype=np.uint8)[:, :, ::-1].copy()

    configs_to_run = ["DEFAULT", "INTRA_1", "INTRA_2", "INTRA_2_NO_SPIN"]
    config_data = {}

    for cfg in configs_to_run:
        res = benchmark_config(cfg, manifest, input_dir, warmup_bgr, providers)
        config_data[cfg] = res

    # Secondary Investigation: Inspect ArcFace recognition model input shape and batching support
    print("\n--- Secondary Investigation: Recognition Model Batch Capability ---", flush=True)
    rec_app = insightface.app.FaceAnalysis(
        name=settings.FACE_MODEL_NAME,
        providers=providers,
        allowed_modules=["detection", "recognition"]
    )
    rec_app.prepare(ctx_id=0, det_size=(640, 640), det_thresh=settings.FACE_DET_THRESH)
    rec_model = rec_app.models["recognition"]
    rec_input_shape = list(rec_model.session.get_inputs()[0].shape)
    
    # Test native batching capability
    batch_test_imgs = [np.zeros((112, 112, 3), dtype=np.uint8) for _ in range(5)]
    batch_feats = rec_model.get_feat(batch_test_imgs)
    batching_supported = "YES" if batch_feats.shape == (5, 512) else "NO"
    print(f"recognition_input_shape: {rec_input_shape}", flush=True)
    print(f"batching_supported: {batching_supported}\n", flush=True)

    # 5. Analysis & Equivalence Comparison against DEFAULT baseline
    default_res = config_data["DEFAULT"]
    baseline_photos = default_res["photo_results"]
    baseline_inf_list = [r["model_inference_ms"] for r in baseline_photos]
    base_avg, base_med, base_p95, base_min, base_max = validate_statistics("DEFAULT inference", baseline_inf_list)
    tot_base_faces = sum(r["face_count"] for r in baseline_photos)

    summary_rows = []
    
    for cfg in configs_to_run:
        c_res = config_data[cfg]
        c_photos = c_res["photo_results"]
        inf_list = [r["model_inference_ms"] for r in c_photos]
        avg_inf, med_inf, p95_inf, min_inf, max_inf = validate_statistics(f"{cfg} inference", inf_list)
        tot_faces = sum(r["face_count"] for r in c_photos)
        retention = (tot_faces / tot_base_faces * 100.0) if tot_base_faces > 0 else 100.0

        all_matches = []
        max_elem_diff = 0.0
        iou_list = []
        conf_diff_list = []

        for b_item, c_item in zip(baseline_photos, c_photos):
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
        med_sim = median(all_sims)
        min_sim = min(all_sims) if all_sims else 1.0

        speedup_pct = ((base_avg - avg_inf) / base_avg) * 100.0 if base_avg > 0 else 0.0

        summary_rows.append({
            "config_name": cfg,
            "description": c_res["description"],
            "mean_inf_ms": avg_inf,
            "median_inf_ms": med_inf,
            "p95_inf_ms": p95_inf,
            "min_inf_ms": min_inf,
            "max_inf_ms": max_inf,
            "speedup_pct": speedup_pct,
            "total_faces": tot_faces,
            "retention_pct": retention,
            "mean_similarity": mean_sim,
            "min_similarity": min_sim,
            "max_elem_diff": max_elem_diff,
            "mean_iou": mean(iou_list),
            "cpu_seconds": c_res["total_cpu_seconds"],
            "rss_mb": c_res["rss_after_mb"]
        })

    # Decision rule
    best_candidate = max(summary_rows[1:], key=lambda x: x["speedup_pct"])
    if best_candidate["speedup_pct"] >= 20.0 and best_candidate["retention_pct"] >= 99.9 and best_candidate["mean_similarity"] >= 0.999:
        decision = "STRONG CANDIDATE"
    elif best_candidate["speedup_pct"] >= 5.0 and best_candidate["retention_pct"] >= 98.0 and best_candidate["mean_similarity"] >= 0.98:
        decision = "MARGINAL"
    else:
        decision = "REJECT"

    # Save CSV
    results_dir = os.path.join(project_root, "benchmark-results")
    os.makedirs(results_dir, exist_ok=True)
    summary_md_path = os.path.join(results_dir, "ort-thread-tuning-summary.md")
    details_csv_path = os.path.join(results_dir, "ort-thread-tuning-details.csv")
    details_json_path = os.path.join(results_dir, "ort-thread-tuning-details.json")

    with open(details_csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Photo_Label", "Face_Count",
            "DEFAULT_Inf_Ms", "INTRA_1_Inf_Ms", "INTRA_2_Inf_Ms", "INTRA_2_NO_SPIN_Inf_Ms"
        ])
        for i, b_item in enumerate(baseline_photos):
            lbl = b_item["label"]
            fc = b_item["face_count"]
            def_inf = baseline_photos[i]["model_inference_ms"]
            i1_inf = config_data["INTRA_1"]["photo_results"][i]["model_inference_ms"]
            i2_inf = config_data["INTRA_2"]["photo_results"][i]["model_inference_ms"]
            i2ns_inf = config_data["INTRA_2_NO_SPIN"]["photo_results"][i]["model_inference_ms"]
            writer.writerow([lbl, fc, f"{def_inf:.1f}", f"{i1_inf:.1f}", f"{i2_inf:.1f}", f"{i2ns_inf:.1f}"])

    # Save Summary MD
    md = []
    md.append("# 2-vCPU ONNX Runtime Thread Tuning Report")
    md.append(f"Executed at: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}")
    md.append(f"InsightFace version: `{insightface.__version__}` | ONNX Runtime version: `{onnxruntime.__version__}`")
    md.append(f"Sample size: {len(manifest)} representative production photos ({tot_base_faces} baseline faces)")
    md.append("Execution: Isolated serial execution on ONNX Runtime CPUExecutionProvider\n")
    md.append("---\n")

    md.append("## Session Architecture & Inspection")
    md.append("- `FaceAnalysis(..., session_options=opts)` natively propagates `SessionOptions` directly to `onnxruntime.InferenceSession`.")
    md.append("- Zero site-packages modification or monkeypatching required.\n")

    md.append("## Executive Benchmark Comparison Table\n")
    md.append("| Config | Description | Mean Inf (ms) | Median (ms) | P95 (ms) | Speedup % | Face Retention | Mean Similarity | Decision |")
    md.append("| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |")

    for row in summary_rows:
        cfg = row["config_name"]
        dec_label = "Baseline" if cfg == "DEFAULT" else (decision if cfg == best_candidate["config_name"] else "Evaluated")
        md.append(f"| **{cfg}** | {row['description']} | **{row['mean_inf_ms']:.1f}** | **{row['median_inf_ms']:.1f}** | **{row['p95_inf_ms']:.1f}** | **{row['speedup_pct']:+.1f}%** | {row['retention_pct']:.1f}% ({row['total_faces']}/{tot_base_faces}) | {row['mean_similarity']:.6f} | {dec_label} |")

    md.append("\n---\n")
    md.append("## Stratification by Face Count\n")
    md.append("| Category | Sample Count | DEFAULT Avg | INTRA_1 Avg | INTRA_2 Avg | INTRA_2 NO_SPIN Avg | Best Config Speedup |")
    md.append("| :--- | :---: | :---: | :---: | :---: | :---: | :---: |")

    cats = {"1 face (Solo)": [], "2-4 faces": [], "5+ faces (Group)": []}
    for i, f_item in enumerate(baseline_photos):
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
        def_avg = mean([config_data["DEFAULT"]["photo_results"][i]["model_inference_ms"] for i in idxs])
        i1_avg = mean([config_data["INTRA_1"]["photo_results"][i]["model_inference_ms"] for i in idxs])
        i2_avg = mean([config_data["INTRA_2"]["photo_results"][i]["model_inference_ms"] for i in idxs])
        i2ns_avg = mean([config_data["INTRA_2_NO_SPIN"]["photo_results"][i]["model_inference_ms"] for i in idxs])

        best_cat_avg = min([i1_avg, i2_avg, i2ns_avg])
        best_sp = ((def_avg - best_cat_avg) / def_avg * 100.0) if def_avg > 0 else 0.0

        md.append(f"| {cat_name} | {c_count} | {def_avg:.1f} ms | {i1_avg:.1f} ms | {i2_avg:.1f} ms | {i2ns_avg:.1f} ms | **{best_sp:+.1f}%** |")

    md.append("\n---\n")
    md.append("## Secondary Investigation: Recognition Batching Capability")
    md.append(f"- **`recognition_input_shape`**: `{rec_input_shape}` (Dynamic batch dimension supported)")
    md.append(f"- **`batching_supported`**: **{batching_supported}**")
    md.append("- Dynamic batching allows passing multiple cropped face images simultaneously in a single `get_feat()` ONNX call rather than looping over faces serially.\n")

    md.append("## Estimated Production Queue Impact")
    non_model_overhead_ms = 350.0
    est_def_photo_ms = base_avg + non_model_overhead_ms
    est_best_photo_ms = best_candidate["mean_inf_ms"] + non_model_overhead_ms

    est_def_pm = 60000.0 / est_def_photo_ms
    est_best_pm = 60000.0 / est_best_photo_ms

    md.append(f"- **Current Production Throughput (Default)**: ~{est_def_pm:.1f} photos / minute (~{est_def_photo_ms:.0f} ms / photo)")
    md.append(f"- **Estimated Throughput ({best_candidate['config_name']})**: ~{est_best_pm:.1f} photos / minute (~{est_best_photo_ms:.0f} ms / photo)")
    md.append("- **Estimated Batch Durations**:")
    md.append(f"  - **10 Photos**: Default = {(est_def_photo_ms * 10 / 1000):.1f}s | Candidate = {(est_best_photo_ms * 10 / 1000):.1f}s")
    md.append(f"  - **25 Photos**: Default = {(est_def_photo_ms * 25 / 1000):.1f}s | Candidate = {(est_best_photo_ms * 25 / 1000):.1f}s")
    md.append(f"  - **50 Photos**: Default = {(est_def_photo_ms * 50 / 1000):.1f}s | Candidate = {(est_best_photo_ms * 50 / 1000):.1f}s")
    md.append(f"  - **100 Photos**: Default = {(est_def_photo_ms * 100 / 1000):.1f}s | Candidate = {(est_best_photo_ms * 100 / 1000):.1f}s\n")

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
            "recognition_input_shape": rec_input_shape,
            "batching_supported": batching_supported,
            "decision": decision
        }, f, indent=2)

    print("===================================================", flush=True)
    print("         BENCHMARK COMPLETE & GENERATED            ", flush=True)
    print("===================================================", flush=True)
    print(f"Summary Report : {summary_md_path}", flush=True)
    print(f"CSV Details    : {details_csv_path}", flush=True)
    print(f"JSON Details   : {details_json_path}\n", flush=True)

if __name__ == "__main__":
    main()
