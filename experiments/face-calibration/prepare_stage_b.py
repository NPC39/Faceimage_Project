#!/usr/bin/env python3
"""
Stage B — Ground Truth & Detection ID Preparation Tool.

Performs:
1. Stage B dataset inspection (E011-E031 as B001-B021, P005_Q01-P014_Q02).
2. Runs production InsightFace face detector on B001-B021 to generate deterministic Detection IDs (B001_D01, B001_D02, etc.).
3. Runs production face detector on 20 query images (P005_Q01 to P014_Q02) to verify query face detection.
4. Generates high-contrast annotated diagnostic overlay images in stage-b/results/face-audit/annotated/.
5. Generates local macOS inspection contact sheet HTML (stage-b/results/face-audit/index.html).
6. Generates Markdown & JSON Ground Truth and Human Face-Mapping fill-in templates.

READ-ONLY DIAGNOSTIC & PREPARATION TOOL.
Does NOT evaluate thresholds, train models, or assign identity labels automatically.
"""

import sys
import os
import json
import logging
from pathlib import Path
from typing import List, Dict, Tuple, Optional, Any
from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = REPO_ROOT / "Backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    from app.core.config import settings
    from app.services.face_service import (
        analyze_image,
        select_primary_face,
        decode_image,
    )
except ImportError as e:
    print(f"Error importing app production modules: {e}")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("prepare_stage_b")


def draw_stage_b_overlays(photo_path: Path, faces: List[Dict[str, Any]], output_path: Path, b_alias: str):
    """Draw thick green bounding boxes and clear D01, D02 labels for Stage B inspection."""
    img = Image.open(photo_path).convert("RGB")
    draw = ImageDraw.Draw(img)

    try:
        font = ImageFont.truetype("arial.ttf", 20)
    except IOError:
        font = ImageFont.load_default()

    for idx, face in enumerate(faces):
        bbox = face["bbox"]
        x1, y1, x2, y2 = bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]
        det_id = f"D{idx+1:02d}"
        conf = face.get("confidence", 0.0)

        # Thick rectangle bounding box
        draw.rectangle([x1, y1, x2, y2], outline="#00FF00", width=4)

        # Tag background & text label
        label_text = f"{det_id} ({conf:.2f})"
        text_bbox = draw.textbbox((x1, max(0, y1 - 24)), label_text, font=font)
        draw.rectangle([text_bbox[0] - 3, text_bbox[1] - 3, text_bbox[2] + 3, text_bbox[3] + 3], fill="#008000")
        draw.text((x1, max(0, y1 - 24)), label_text, fill="#FFFFFF", font=font)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, quality=95)


def generate_contact_sheet_html(event_records: List[Dict[str, Any]], output_html_path: Path):
    """Generate local HTML contact sheet for reviewing Stage B annotated images on macOS."""
    html_lines = [
        "<!DOCTYPE html>",
        "<html>",
        "<head>",
        "  <meta charset='utf-8'>",
        "  <title>Stage B Face Detection Audit Index</title>",
        "  <style>",
        "    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }",
        "    h1 { color: #38bdf8; text-align: center; margin-bottom: 10px; }",
        "    p.subtitle { text-align: center; color: #94a3b8; margin-bottom: 30px; }",
        "    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px; }",
        "    .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; overflow: hidden; padding: 15px; }",
        "    .card h3 { margin: 0 0 10px 0; color: #f1f5f9; display: flex; justify-content: space-between; }",
        "    .card img { width: 100%; height: auto; border-radius: 4px; border: 1px solid #475569; cursor: pointer; }",
        "    .meta { margin-top: 10px; font-size: 14px; color: #cbd5e1; }",
        "    .tag { background: #0284c7; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; }",
        "  </style>",
        "</head>",
        "<body>",
        "  <h1>Stage B — Face Detection Audit Contact Sheet</h1>",
        "  <p class='subtitle'>Click any annotated image to open full size. Deterministic Detection IDs: B001_D01, B001_D02...</p>",
        "  <div class='grid'>"
    ]

    for rec in event_records:
        alias = rec["alias"]
        filename = rec["filename"]
        det_count = rec["detection_count"]
        rel_img_path = f"annotated/{alias}.jpg"

        html_lines.append(f"    <div class='card'>")
        html_lines.append(f"      <h3><span>{alias} ({filename})</span> <span class='tag'>{det_count} faces</span></h3>")
        html_lines.append(f"      <a href='{rel_img_path}' target='_blank'><img src='{rel_img_path}' alt='{alias} Overlay'></a>")
        html_lines.append(f"      <div class='meta'><strong>Detections:</strong> {', '.join([f['det_id'] for f in rec['faces']])}</div>")
        html_lines.append(f"    </div>")

    html_lines.extend([
        "  </div>",
        "</body>",
        "</html>"
    ])

    output_html_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_html_path, "w", encoding="utf-8") as f:
        f.write("\n".join(html_lines))


def run_stage_b_prep() -> Dict[str, Any]:
    dataset_dir = REPO_ROOT / "experiments" / "face-calibration" / "dataset"
    event_dir = dataset_dir / "event"
    queries_dir = dataset_dir / "queries"

    stage_b_dir = REPO_ROOT / "experiments" / "face-calibration" / "stage-b"
    results_dir = stage_b_dir / "results" / "face-audit"
    annotated_dir = results_dir / "annotated"

    logger.info("Inspecting Stage B dataset files...")

    # 1. Stage B Event Photos (E011 to E031)
    event_files = sorted([f for f in event_dir.glob("E*.jpg") if int(f.stem[1:]) >= 11], key=lambda x: int(x.stem[1:]))
    logger.info(f"Found {len(event_files)} Stage B Event photos: E011..E031")

    # Map B001..B021
    event_aliases = {}
    event_records = []
    total_stage_b_detections = 0

    for idx, ef in enumerate(event_files, start=1):
        b_alias = f"B{idx:03d}"
        event_aliases[b_alias] = ef.name

        with open(ef, "rb") as f:
            img_bytes = f.read()

        faces_data = analyze_image(img_bytes, include_embeddings=False)
        total_stage_b_detections += len(faces_data)

        # Draw overlay image
        overlay_path = annotated_dir / f"{b_alias}.jpg"
        draw_stage_b_overlays(ef, faces_data, overlay_path, b_alias)

        faces_meta = []
        for d_idx, face in enumerate(faces_data, start=1):
            det_id = f"{b_alias}_D{d_idx:02d}"
            bbox = face["bbox"]
            faces_meta.append({
                "det_id": det_id,
                "bbox": bbox,
                "confidence": face["confidence"]
            })

        event_records.append({
            "alias": b_alias,
            "filename": ef.name,
            "path": str(ef),
            "detection_count": len(faces_data),
            "faces": faces_meta,
            "overlay_path": str(overlay_path)
        })

    # 2. Stage B Queries (P005_Q01 to P014_Q02)
    expected_queries = []
    for p_num in range(5, 15):
        for q_num in (1, 2):
            expected_queries.append(f"P{p_num:03d}_Q{q_num:02d}")

    query_records = {}
    missing_queries = []

    for q_id in expected_queries:
        q_file = queries_dir / f"{q_id}.jpg"
        if not q_file.exists():
            missing_queries.append(q_id)
            continue

        with open(q_file, "rb") as f:
            q_bytes = f.read()

        q_faces = analyze_image(q_bytes, include_embeddings=False)
        primary = select_primary_face(q_faces)

        query_records[q_id] = {
            "query_id": q_id,
            "filename": q_file.name,
            "detected_face_count": len(q_faces),
            "has_primary_face": primary is not None,
            "primary_face_confidence": primary["confidence"] if primary else None
        }

    # 3. Generate Contact Sheet HTML
    contact_html_path = results_dir / "index.html"
    generate_contact_sheet_html(event_records, contact_html_path)

    # 4. Save Stage B Audit Mapping Template JSON
    mapping_template = {}
    for rec in event_records:
        alias = rec["alias"]
        mapping_template[alias] = {}
        for face in rec["faces"]:
            det_id = face["det_id"]
            mapping_template[alias][det_id] = "?"

    mapping_template_path = results_dir / "human-face-mapping-template.json"
    with open(mapping_template_path, "w", encoding="utf-8") as f:
        json.dump(mapping_template, f, indent=2)

    # 5. Save Stage B Manifest Template JSON
    manifest_template = {
        "dataset": "stage-b",
        "description": "Stage B Face Recognition Calibration Dataset (P005-P014)",
        "event_photos": [
            {
                "photo_id": rec["alias"],
                "filename": rec["filename"],
                "path": f"dataset/event/{rec['filename']}",
                "photo_type": "SOLO / DUO / GROUP (?)",
                "visible_face_count": rec["detection_count"],
                "persons_present": ["?"]
            }
            for rec in event_records
        ],
        "queries": [
            {
                "query_id": q_id,
                "person_id": q_id.split("_")[0],
                "path": f"dataset/queries/{q_id}.jpg"
            }
            for q_id in expected_queries if q_id not in missing_queries
        ]
    }

    manifest_template_path = stage_b_dir / "manifest.template.json"
    with open(manifest_template_path, "w", encoding="utf-8") as f:
        json.dump(manifest_template, f, indent=2)

    prep_summary = {
        "event_photos_found": len(event_files),
        "total_stage_b_detections": total_stage_b_detections,
        "queries_expected": 20,
        "queries_found": len(query_records),
        "missing_queries": missing_queries,
        "event_aliases": event_aliases,
        "event_records": event_records,
        "query_records": query_records,
        "contact_html_path": str(contact_html_path),
        "mapping_template_path": str(mapping_template_path),
        "manifest_template_path": str(manifest_template_path)
    }

    return prep_summary


def main():
    summary = run_stage_b_prep()

    print("\n==================================================")
    print("STAGE B HUMAN LABELING PREPARATION COMPLETE")
    print("==================================================")
    print(f"Stage B Event Photos Found: {summary['event_photos_found']} (B001..B{summary['event_photos_found']:03d})")
    print(f"Total Stage B Detections:   {summary['total_stage_b_detections']}")
    print(f"Queries Found:              {summary['queries_found']} / 20")
    print(f"Contact Sheet HTML:         {summary['contact_html_path']}")
    print(f"Mapping Template JSON:      {summary['mapping_template_path']}")
    print("==================================================\n")


if __name__ == "__main__":
    main()
