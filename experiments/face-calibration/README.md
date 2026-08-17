# Face Recognition Calibration & Evaluation Tool (Pilot v1)

Development-only diagnostic and evaluation tool for analyzing face recognition performance on the **Pilot Calibration Dataset v1**.

---

## 🎯 Purpose

This tool evaluates the face matching quality of the production InsightFace (`buffalo_l`) engine without changing production code, database schema, or production configuration thresholds.

It calculates classification metrics (TP, FN, FP, TN, Precision, Recall, F1), product-level photo retrieval metrics, ranking diagnostics, score distributions, and threshold sweeps.

---

## 🔒 Privacy & Biometric Data Rules

1. **Strictly Anonymous Identities**: Uses anonymous labels (`P001`, `P002`, `P003`, `P004`). Never use real names, student IDs, or personal metadata.
2. **Git-Ignored Local Data**: All real calibration face images (`dataset/`), local manifests (`manifest.json`), and raw evaluation outputs (`results/`) are strictly git-ignored.
3. **No Embeddings Persisted**: 512-dimensional embedding vectors remain **strictly in memory** during evaluation and are **never written** to logs, CSVs, JSON reports, databases, or committed to Git.
4. **No Production Database Writes**: Evaluates images directly from local files without touching production database tables (`DetectedFace`, `EventPhoto`, etc.).
5. **No Production Storage Writes**: Evaluates images directly in memory without generating disk derivatives or storing face crops.

---

## 📂 Directory Layout

```text
experiments/face-calibration/
├── README.md                # Tool documentation and diagnostic guide
├── evaluate.py              # CLI evaluator script
├── manifest.example.json    # Example manifest template for Pilot v1
├── dataset/                 # [Git-ignored] Local test images (queries/ & event/)
├── results/                 # [Git-ignored] Output evaluation reports & CSVs
└── manifest.json            # [Git-ignored] Active local dataset manifest
```

---

## 📊 Pilot Calibration Dataset v1 Specifications

* **Event Photos**: 10 total (`E001`–`E010`)
  * **SOLO**: 7 photos
  * **GROUP**: 3 photos
* **Identities**: 4 anonymous identities (`P001`, `P002`, `P003`, `P004`)
* **Queries**: 8 total (2 per identity)
  * `P001_Q01`, `P001_Q02`
  * `P002_Q01`, `P002_Q02`
  * `P003_Q01` (side-facing), `P003_Q02` (front selfie)
  * `P004_Q01` (night/low-light), `P004_Q02` (front-facing)
* **Expected Pairs**:
  * **Positive Pairs (Ground Truth SAME)**: 26 pairs
  * **Negative Pairs (Ground Truth DIFFERENT)**: 54 pairs
  * **Total Decisions**: 80 pairs (8 queries × 10 Event photos)

---

## 🚀 How to Run

### Step 1: Prepare Local Images & Manifest

1. Copy `manifest.example.json` to `manifest.json`:
   ```bash
   cp experiments/face-calibration/manifest.example.json experiments/face-calibration/manifest.json
   ```
2. Place your local test images under `experiments/face-calibration/dataset/`:
   - `dataset/queries/P001_Q01.jpg`, etc.
   - `dataset/event/E001.jpg`, etc.

### Step 2: Run Evaluation

From the project root:

```bash
cd Backend
../Backend/.venv/bin/python ../experiments/face-calibration/evaluate.py --manifest ../experiments/face-calibration/manifest.json
```

Or using python module execution from root:

```bash
python -m experiments.face-calibration.evaluate --manifest experiments/face-calibration/manifest.json
```

### CLI Arguments

* `--manifest PATH`: Path to local manifest file (default: `experiments/face-calibration/manifest.json`).
* `--output-dir PATH`: Directory for output reports (default: `experiments/face-calibration/results/`).
* `--current-threshold-only`: Evaluate only the production threshold without sweeping.
* `--threshold-sweep`: Run offline threshold sweep (default: True).
* `--verbose`: Print detailed debug logs during evaluation.

---

## 📐 Metric Definitions & Interpretation

* **True Positive (TP)**: Correctly matched SAME-person pair (similarity $\ge$ threshold).
* **False Negative (FN)**: Missed SAME-person pair (similarity < threshold).
* **False Positive (FP)**: Incorrectly matched DIFFERENT-person pair (similarity $\ge$ threshold).
* **True Negative (TN)**: Correctly rejected DIFFERENT-person pair (similarity < threshold).
* **Recall (TPR)**: $\text{TP} / (\text{TP} + \text{FN})$ — Proportion of ground-truth positive pairs retrieved.
* **Precision**: $\text{TP} / (\text{TP} + \text{FP})$ — Proportion of returned matches that are correct.
* **F1 Score**: $2 \times \frac{\text{Precision} \times \text{Recall}}{\text{Precision} + \text{Recall}}$.
* **Classification Accuracy**: $(\text{TP} + \text{TN}) / 80$.
* **Pilot Photo-Retrieval Recall**: Correct positive photo retrievals / 26 expected positive pairs.
* **Cosine Cutoff Notice**: Similarity score is cosine similarity in $[-1.0, 1.0]$, NOT a probability percentage.

---

## ⚠️ Limitations & Future Methodology

1. **Provisional Results**: Pilot v1 (4 identities, 8 queries, 10 photos) is small and used strictly for baseline measurement and bug diagnosis. Any recommended threshold is **PROVISIONAL**.
2. **Production Safety**: The production configuration (`FACE_MATCH_THRESHOLD = 0.60`) is **NOT modified** by this tool.
3. **Future Split**: For future scale-up, calibration datasets (used for threshold selection) must be separated from held-out test datasets.
