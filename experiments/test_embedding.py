#!/usr/bin/env python3
"""
Experiment Script: Face Embedding Extraction Benchmark
Usage:
    python experiments/test_embedding.py <path_to_image>
"""

import sys
import time
import cv2
import numpy as np
import insightface


def l2_normalize(vec: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vec)
    if norm == 0:
        return vec
    return vec / norm


def main():
    if len(sys.argv) < 2:
        print("Usage: python experiments/test_embedding.py <path_to_image>")
        sys.exit(1)

    image_path = sys.argv[1]
    img = cv2.imread(image_path)
    if img is None:
        print(f"Error: Unable to load image at '{image_path}'")
        sys.exit(1)

    print(f"Loaded image: {image_path} ({img.shape[1]}x{img.shape[0]} px)")

    app = insightface.app.FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))

    start_inf = time.perf_counter()
    faces = app.get(img)
    inf_ms = (time.perf_counter() - start_inf) * 1000

    print(f"\nInference latency: {inf_ms:.2f} ms")
    print(f"Total faces detected: {len(faces)}\n")

    for idx, face in enumerate(faces, 1):
        bbox = face.bbox.astype(int)
        raw_emb = face.embedding
        norm_emb = l2_normalize(raw_emb)
        print(f"Face {idx}: bbox=[{bbox[0]}, {bbox[1]}, {bbox[2]}, {bbox[3]}], confidence={float(face.det_score):.4f}")
        print(f"  Embedding dimension: {len(norm_emb)}")
        print(f"  L2 Norm before: {np.linalg.norm(raw_emb):.4f}, after: {np.linalg.norm(norm_emb):.4f}")
        print(f"  First 5 values: {norm_emb[:5].round(4).tolist()}\n")


if __name__ == "__main__":
    main()
