#!/usr/bin/env python3
"""
Experiment Script: Face Detection Benchmark
Usage:
    python experiments/test_face_detection.py <path_to_image>
"""

import sys
import time
import cv2
import insightface


def main():
    if len(sys.argv) < 2:
        print("Usage: python experiments/test_face_detection.py <path_to_image>")
        sys.exit(1)

    image_path = sys.argv[1]
    img = cv2.imread(image_path)
    if img is None:
        print(f"Error: Unable to load image at '{image_path}'")
        sys.exit(1)

    print(f"Loaded image: {image_path} ({img.shape[1]}x{img.shape[0]} px)")

    start_init = time.perf_counter()
    app = insightface.app.FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))
    init_ms = (time.perf_counter() - start_init) * 1000

    start_inf = time.perf_counter()
    faces = app.get(img)
    inf_ms = (time.perf_counter() - start_inf) * 1000

    print(f"\nModel initialization: {init_ms:.2f} ms")
    print(f"Inference latency: {inf_ms:.2f} ms")
    print(f"Total faces detected: {len(faces)}\n")

    for idx, face in enumerate(faces, 1):
        bbox = face.bbox.astype(int)
        score = float(face.det_score)
        print(f"Face {idx}: bbox=[x1={bbox[0]}, y1={bbox[1]}, x2={bbox[2]}, y2={bbox[3]}], confidence={score:.4f}")


if __name__ == "__main__":
    main()
