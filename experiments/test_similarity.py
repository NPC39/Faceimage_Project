#!/usr/bin/env python3
"""
Experiment Script: Face Cosine Similarity Benchmark
Usage:
    python experiments/test_similarity.py <path_to_image_a> <path_to_image_b>
"""

import sys
import time
import cv2
import numpy as np
import insightface


def l2_normalize(vec: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vec)
    if norm == 0 or np.isnan(norm):
        return vec
    return vec / norm


def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    a = l2_normalize(vec_a)
    b = l2_normalize(vec_b)
    sim = float(np.dot(a, b))
    return max(-1.0, min(1.0, sim))


def select_primary_face(faces):
    if not faces:
        return None
    return max(faces, key=lambda f: float((f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])))


def main():
    if len(sys.argv) < 3:
        print("Usage: python experiments/test_similarity.py <path_to_image_a> <path_to_image_b>")
        sys.exit(1)

    path_a, path_b = sys.argv[1], sys.argv[2]
    img_a = cv2.imread(path_a)
    img_b = cv2.imread(path_b)

    if img_a is None:
        print(f"Error: Unable to load image A at '{path_a}'")
        sys.exit(1)
    if img_b is None:
        print(f"Error: Unable to load image B at '{path_b}'")
        sys.exit(1)

    print(f"Loaded Image A: {path_a} ({img_a.shape[1]}x{img_a.shape[0]} px)")
    print(f"Loaded Image B: {path_b} ({img_b.shape[1]}x{img_b.shape[0]} px)")

    app = insightface.app.FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))

    start_time = time.perf_counter()
    faces_a = app.get(img_a)
    faces_b = app.get(img_b)
    elapsed_ms = (time.perf_counter() - start_time) * 1000

    print(f"\nInference time: {elapsed_ms:.2f} ms")
    print(f"Image A faces detected: {len(faces_a)}")
    print(f"Image B faces detected: {len(faces_b)}")

    primary_a = select_primary_face(faces_a)
    primary_b = select_primary_face(faces_b)

    if primary_a is None or primary_b is None:
        print("\nSimilarity score: N/A (Face not detected in one or both images)")
        sys.exit(0)

    bbox_a = primary_a.bbox.astype(int)
    bbox_b = primary_b.bbox.astype(int)
    print(f"Selected Primary Face A: bbox=[{bbox_a[0]}, {bbox_a[1]}, {bbox_a[2]}, {bbox_a[3]}], score={primary_a.det_score:.4f}")
    print(f"Selected Primary Face B: bbox=[{bbox_b[0]}, {bbox_b[1]}, {bbox_b[2]}, {bbox_b[3]}], score={primary_b.det_score:.4f}")

    similarity = cosine_similarity(primary_a.embedding, primary_b.embedding)
    print(f"\nCosine Similarity Score: {similarity:.4f}")


if __name__ == "__main__":
    main()
