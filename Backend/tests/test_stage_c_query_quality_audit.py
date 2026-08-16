import csv
import json
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
AUDIT_DIR = REPO_ROOT / "experiments" / "face-calibration" / "stage-c" / "results" / "query-quality-audit"
METRICS_JSON = AUDIT_DIR / "metrics.json"
REF_QUALITY_CSV = AUDIT_DIR / "reference-quality.csv"


@pytest.fixture
def quality_metrics():
    if not METRICS_JSON.exists():
        pytest.skip("metrics.json not found")
    with open(METRICS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def ref_quality():
    if not REF_QUALITY_CSV.exists():
        pytest.skip("reference-quality.csv not found")
    rows = []
    with open(REF_QUALITY_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    return rows


def test_reference_count_is_22(quality_metrics, ref_quality):
    """Verify exactly 22 Stage C query references were audited."""
    assert quality_metrics["total_references"] == 22
    assert len(ref_quality) == 22


def test_critical_reference_outcomes_locked(ref_quality):
    """Verify outcome labels and recall for critical references."""
    p015_r01 = next(r for r in ref_quality if r["ref_id"] == "P015_R01")
    assert float(p015_r01["id_recall"]) == 0.0
    assert p015_r01["outcome_label"] == "ZERO_RECALL"

    p020_r01 = next(r for r in ref_quality if r["ref_id"] == "P020_R01")
    assert float(p020_r01["id_recall"]) == 0.0
    assert p020_r01["outcome_label"] == "ZERO_RECALL"

    p022_r03 = next(r for r in ref_quality if r["ref_id"] == "P022_R03")
    assert int(p022_r03["id_errors"]) > 0
    assert p022_r03["outcome_label"] == "IDENTITY_ERROR"


def test_ratio_calculations(ref_quality):
    """Verify face_area_ratio calculation formula."""
    for r in ref_quality:
        face_area = int(r["face_area"])
        img_area = int(r["img_area"])
        expected_ratio = round(face_area / img_area, 6)
        assert float(r["face_area_ratio"]) == pytest.approx(expected_ratio, abs=1e-5)
