# Stage C — Face Recognition Calibration & Operating Point Summary

## 1. Executive Summary

This document consolidates the authoritative findings, operating point selection, and experimental conclusions for **Stage C Face Recognition Calibration** (`buffalo_l` ArcFace ResNet50 embedding model).

The final accepted production configuration for Stage C Recognition Calibration v1 is:

- **User Reference Input**: Exactly **1 reference image** per search request.
- **Supported Reference Assumption**: **Frontal or near-frontal selfie** with clearly visible face and adequate illumination.
- **Embedding Pipeline**: Server-side InsightFace ArcFace 512D float32 embedding with L2 normalization.
- **Similarity Metric**: Cosine similarity ($S = \mathbf{q} \cdot \mathbf{c}$).
- **Production Match Threshold**: `FACE_MATCH_THRESHOLD = 0.40` (Frozen operating baseline).
- **Photo Aggregation**: Maximum similarity score per photo ($\max_{f \in \text{photo}} S(q, f)$).
- **Ranking**: Score descending (tie-broken deterministically by `photoId ASC`).
- **Second-Stage Verifier**: None.
- **Production Quality Gate / Preprocessing**: None.

---

## 2. Dataset & Ground Truth Summary

Stage C calibration and audit evaluated 22 user query reference images against a verified event photo collection:

- **Event Photos**: 27 event photos (`C001`–`C027`, filenames `E032.jpg`–`E058.jpg`).
- **Visible Event Faces**: 145 detected face instances.
- **Tracked Participants**: 10 participants (`P015` through `P024`).
- **Ground Truth Instances**: 52 GT face-image matches across the 10 participants:
  - `P015`: 3 | `P016`: 4 | `P017`: 8 | `P018`: 6 | `P019`: 4
  - `P020`: 4 | `P021`: 6 | `P022`: 4 | `P023`: 4 | `P024`: 9
- **Query References**: 22 reference photos across `P015`–`P024`.
- **Authoritative GT Checkpoint**: Git commit `1e066f2cb574431ba54adbe18e381b44bd77a9d1` (`manifest.json` and `human-face-mapping.json`).

---

## 3. Authoritative Recognition Baselines

### A. All 22 References Baseline (Threshold $\ge 0.4000$)
- **Ground Truth Opportunities**: 112
- **True Positives (TP)**: 91
- **False Positives (FP)**: 1 (`P022_R03 → C013_f4` = 0.4229, Human Assignment: `OTHER`)
- **False Negatives (FN)**: 21
- **Precision**: $91 / 92 = 0.989130$ ($98.91\%$)
- **Recall**: $91 / 112 = 0.812500$ ($81.25\%$)
- **Photo-Level F1**: $0.892157$

### B. In-Scope 21 Supported References Baseline (Threshold $\ge 0.4000$)
*(Excludes out-of-scope stress case `P022_R03`)*
- **Supported References**: 21
- **Ground Truth Opportunities**: 108
- **True Positives (TP)**: 91
- **False Positives (FP)**: 0
- **False Negatives (FN)**: 17
- **Right Photo / Right Face (RPRF)**: 91
- **Right Photo / Wrong Face (RPWF)**: 0
- **Wrong Photo / Wrong Face (WPWF)**: 0
- **Identity Errors (RPWF + WPWF)**: 0
- **Precision**: $1.000000$ ($100.00\%$)
- **Recall**: $91 / 108 = 0.842593$ ($84.26\%$)
- **Identity-Aware F1**: $0.914573$

---

## 4. Threshold & Operating Point Analysis

1. **Frozen Operating Threshold**: `0.4000` is the designated production baseline. It provides high precision ($100\%$ on supported references) with zero observed false positives or identity errors on supported frontal selfies.
2. **Threshold Sweep Insights**:
   - Sweeping threshold down to `0.389` recovers 3 additional SAME matches (`P020_R01 → C019_f3` = 0.3896), but introduces identity risk (`P022_R03 → C002_f7` = 0.3964, `OTHER`).
   - Sweeping threshold up to `0.423` eliminates the single `P022_R03` stress-case FP (0.4229), but drops recall significantly (losing true matches at 0.4059 and 0.4211).
3. **Single-Threshold Score Overlap Proof**:
   - `P022_R02` (SAME): $0.4211$
   - `P022_R03` (OTHER): $0.4229$
   - `P022_R01` (SAME): $0.4246$
   - Because $0.4211 < 0.4229 < 0.4246$, no single global scalar threshold can simultaneously reject the $0.4229$ impostor face while preserving the $0.4211$ true match.

---

## 5. Offline Audits & Experimental Conclusions

| Experiment / Audit Path | Objective | Key Finding | Status / Decision |
| :--- | :--- | :--- | :--- |
| **Score Source of Truth Reconciliation** | Trace historical score typos | Resolved 3 prose typos (`P015_R01 → C017_f5` is 0.3064, `C022_f0` is 0.2012, `P020_R01 → C011_f0` is 0.2220 `OTHER`). | **COMPLETED & LOCKED** |
| **P020 GT Target Repair** | Reconcile exact P020 GT faces | P020 GT faces are exactly 4 (`C003_f13`, `C008_f13`, `C019_f3`, `C023_f9`). `C011_f0` is `OTHER`. | **RECONCILED & LOCKED** |
| **Query Quality Gate Experiment** | Screen risky reference images | Heuristic gates (`conf < 0.75` or `dark_pixel_ratio > 0.25`) warned 3/15 Good references. | **NOT READY FOR PRODUCTION** |
| **Illumination Screening Audit** | Screen low-light references | Darkness metrics do not separate `P015_R01` from successful dark references. | **INCONCLUSIVE / REJECTED** |
| **Photometric Normalization** | Query contrast/gamma preprocessing | Final lossless rerun (PNG transport, max pixel delta = 0) yielded 0 P015 TP and degraded Strong references. | **NOT_SUPPORTED / CLOSED** |
| **Single-Reference Embedding Robustness** | Flip & crop embedding fusion | Single ORIGINAL embedding outperformed all fused variants (flip/crop fusion reduced TP from 91 to 89). | **NOT_SUPPORTED / CLOSED** |

---

## 6. Known Limitations & Future Work Boundary

### Known Limitations
1. **Low-Recall Frontal References**: A small subset of frontal references (e.g. `P015_R01`) exhibit lower cosine similarity scores ($0.3064$) due to facial expression or mild shadow variations that fall below the $0.4000$ threshold.
2. **Out-of-Scope Side Profiles**: Strongly side-angled references (e.g. `P022_R03`) can generate cross-identity false matches above threshold ($0.4229$) against distinct individuals in complex lighting.
3. **Single Global Threshold Limits**: Mathematical score overlap between difficult SAME matches and dark OTHER faces caps global threshold optimization effectiveness.

### Out of Scope / Closed Paths
- Photometric query preprocessing (Gamma, CLAHE, Histogram Equalization) is officially closed for v1.
- Single-image geometric fusion (horizontal flip / crop margin mean fusion) is officially closed for v1.
- Multi-reference upload requirement is explicitly excluded for v1.
- Threshold tuning remains frozen at `0.4000`.

---

## 7. Versioning & Calibration Status

- **Stage C Calibration Status**: `STAGE C RECOGNITION CALIBRATION: PASS WITH KNOWN LIMITATIONS`
- **Operating Baseline**: `FACE_MATCH_THRESHOLD = 0.40`
- **Product Requirement**: 1 reference image (frontal/near-frontal selfie)
