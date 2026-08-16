# Stage D — Face Recognition Validation & Multi-Face Ambiguity Guard Policy

## 1. Executive Summary & Calibration Objectives

Stage D runtime validation evaluated identity recognition accuracy under challenging real-world illumination, pose, and background clutter conditions across 4 participants (**P025**, **P026**, **P027**, **P028**) and 4 reference conditions (**M01 daylight**, **M02 indoor**, **M03 night illuminated**, **M04 appearance variation**).

### Production Recognition Settings:
- **User Reference Images Required**: `1` (single-reference frontal/near-frontal portrait)
- **Feature Extractor**: ArcFace 512D
- **Embedding Normalization**: L2 Normalized
- **Distance Metric**: Cosine Similarity
- **Base Threshold**: `FACE_MATCH_THRESHOLD = 0.40`
- **Multi-Face Ambiguity Guard**: **`ENABLED`** (`AMBIGUITY_MARGIN = 0.002`)

---

## 2. Provenance & Locked Ground Truth

- **Reference Queries**: 16 unique queries across 4 participants (16 distinct SHA-256 hashes verified).
- **Ground Truth Photo Counts**:
  - `P025`: 11 GT photos (44 query × photo opportunities)
  - `P026`: 11 GT photos (44 query × photo opportunities; includes `ph_d0141639357425f3f3009143`)
  - `P027`: 7 GT photos (28 query × photo opportunities)
  - `P028`: 7 GT photos (28 query × photo opportunities; includes `ph_5c2225c6f197c6b314ccccab`)
- **Total Opportunities (Stage D)**: `144`
- **Combined Control Set (Stage C In-Scope + Stage D)**: 37 supported queries, `252` total GT opportunities.

---

## 3. Phase 1 Forensic Audit: Critical RPWF Discovery

In Stage D baseline evaluation, query `P025_M03` (`P025_M03_night_illuminated.jpg`) against photo `ph_5c2225c6f197c6b314ccccab` produced:
- **Target P025 Face `f0` Score**: `0.4278484582901001`
- **Competing OTHER Face `f17` Score**: `0.42943495512008667`
- **Delta (`OTHER - P025`)**: `+0.0015864968299865723`
- **Classification**: **`CONFIRMED_RPWF`** (Right Photo, Wrong Face).

### Mathematical Limitation of Global Threshold Tuning:
Because `OTHER score > TRUE score`, no global threshold adjustment could make target face `f0` outscore `f17`. Raising global threshold to `0.4295` rejected both faces, converting the photo into an `AMBIGUOUS_REJECT` / `FN` while causing **18 valid RPRF match losses** across the benchmark set. Therefore, global threshold changes were **REJECTED**.

---

## 4. Phase 2 Strategy Study & Dual-Accept Guard Selection

Phase 2 evaluated a **Dual-Accept Multi-Face Ambiguity Guard**:
- **Rule**: When `top1 >= 0.40` AND `top2 >= 0.40`, require `top1 - top2 >= M` (where `M = 0.002`). If `margin < 0.002`, reject the photo as `AMBIGUOUS_REJECT`.
- **Finding**: For all 228 valid `RIGHT_PHOTO_RIGHT_FACE` (RPRF) matches in Stage C and Stage D, the minimum margin between `top1` and `top2` was **`0.055944`**.
- **Outcome**: Setting `AMBIGUITY_MARGIN = 0.002` completely eliminated the `P025_M03` RPWF error (`RPWF = 0`, `Identity Errors = 0`) with **`0` collateral loss of valid RPRF matches** across both Stage C and Stage D.

---

## 5. Phase 3 & Phase 4 Final Production Policy & Benchmark Results

### Combined Benchmark Results (Stage C In-Scope + Stage D: 252 GT Opportunities):

| Metric | Baseline (@ 0.40) | Accepted Production Policy (Guard ON @ 0.002) | Delta |
|---|---:|---:|---:|
| **Photo TP** | 229 | 228 | -1 (Intentional ambiguous rejection) |
| **Photo FP** | 0 | 0 | 0 |
| **Photo FN** | 23 | 24 | +1 |
| **RPRF (Right Photo Right Face)** | 228 | 228 | **0 (100% retained)** |
| **RPWF (Right Photo Wrong Face)** | 1 | 0 | **-1 (100% eliminated)** |
| **WPWF (Wrong Photo Wrong Face)** | 0 | 0 | 0 |
| **Observed Identity Errors** | 1 | 0 | **-1** |
| **Identity Precision** | 0.995633 | **1.000000** | **+0.004367** |
| **Identity Recall** | 0.904762 | **0.904762** | **0.000000** |
| **Identity F1** | 0.948025 | **0.950000** | **+0.001975** |

---

## 6. Runtime Decision Policy Algorithm

```text
For each candidate photo in search scope:
1. Compute cosine similarity for all detected faces in the photo.
2. Identify top1 (highest score) and top2 (second highest score if >= 2 faces exist).

Decision:
- If top1 < 0.40: REJECT
- Else if no top2 exists (1 face detected): ACCEPT
- Else if top2 < 0.40: ACCEPT
- Else (top1 >= 0.40 AND top2 >= 0.40):
    margin = top1 - top2
    If margin >= 0.002: ACCEPT (Photo score = top1)
    Else: AMBIGUOUS_REJECT (Omit photo from search results)
```

---

## 7. Known Limitations & Tradeoffs

1. **Identity Safety vs. Retrieval Tradeoff**: The ambiguity guard safely omits photos where background faces and target identity faces score within `0.002` of each other. This converts 1 ambiguous photo (`P025_M03` on `ph_5c2225c6f197c6b314ccccab`) into a non-returned miss (`FN`), prioritizing zero identity errors over returning an ambiguous photo.
2. **Recall under Extreme Illumination/Occlusion**: The guard does not increase low-similarity scores. 6 difficult event face instances in Stage D (e.g. `P026` indoor/night/appearance misses and `P028` daylight/indoor/night misses) remain below `0.40` and are governed by the base threshold.
3. **Single-Reference Constraint**: The single-reference selfie constraint is preserved without requiring multi-photo user uploads or second-stage verifiers.
