import csv
import json
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
AUDIT_DIR = REPO_ROOT / "experiments" / "face-calibration" / "stage-c" / "results" / "illumination-audit"
METRICS_JSON = AUDIT_DIR / "metrics.json"
ILLUM_CSV = AUDIT_DIR / "reference-illumination.csv"


@pytest.fixture
def illum_metrics():
    if not METRICS_JSON.exists():
        pytest.skip("metrics.json not found")
    with open(METRICS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def illum_rows():
    if not ILLUM_CSV.exists():
        pytest.skip("reference-illumination.csv not found")
    rows = []
    with open(ILLUM_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    return rows


def test_reference_totals_and_scope_split(illum_metrics, illum_rows):
    """Verify totals and in-scope vs stress-case separation."""
    assert illum_metrics["total_references"] == 22
    assert illum_metrics["in_scope_references"] == 21
    assert illum_metrics["stress_references"] == 1
    assert len(illum_rows) == 22

    stress_set = set(r["ref_id"] for r in illum_rows if r["scope_group"] == "STRESS_CASE")
    in_scope_zero = set(r["ref_id"] for r in illum_rows if r["scope_group"] == "ZERO_RECALL")
    in_scope_low = set(r["ref_id"] for r in illum_rows if r["scope_group"] == "LOW_RECALL")
    in_scope_good = set(r["ref_id"] for r in illum_rows if r["scope_group"] == "GOOD")

    assert stress_set == {"P022_R03"}
    assert in_scope_zero == {"P015_R01", "P020_R01"}
    assert in_scope_low == {"P015_R02", "P018_R01", "P022_R01", "P022_R02"}
    assert len(in_scope_good) == 15


def test_illumination_formula_invariants(illum_rows):
    """Verify mathematical formula definitions for illumination metrics."""
    eps = 1e-6
    for r in illum_rows:
        dark40 = float(r["dark_pixel_ratio_40"])
        mean_lum = float(r["mean_luminance"])
        left_mean = float(r["left_mean"])
        right_mean = float(r["right_mean"])
        upper_mean = float(r["upper_mean"])
        lower_mean = float(r["lower_mean"])
        eye_mean = float(r["eye_band_mean"])
        lower_face_mean = float(r["lower_face_mean"])

        # Asymmetry formulas
        expected_lr_asym = round(abs(left_mean - right_mean) / max(mean_lum, eps), 4)
        expected_ul_asym = round(abs(upper_mean - lower_mean) / max(mean_lum, eps), 4)
        expected_eye_deficit = round((lower_face_mean - eye_mean) / max(lower_face_mean, eps), 4)

        assert float(r["left_right_illumination_asymmetry"]) == pytest.approx(expected_lr_asym, abs=1e-3)
        assert float(r["upper_lower_illumination_asymmetry"]) == pytest.approx(expected_ul_asym, abs=1e-3)
        assert float(r["eye_shadow_deficit"]) == pytest.approx(expected_eye_deficit, abs=1e-3)
        assert 0.0 <= dark40 <= 1.0
