import csv
import json
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
AUDIT_DIR = REPO_ROOT / "experiments" / "face-calibration" / "stage-c" / "results" / "identity-audit"
METRICS_JSON = AUDIT_DIR / "metrics.json"
SWEEP_CSV = AUDIT_DIR / "identity-threshold-sweep.csv"
RPWF_CSV = AUDIT_DIR / "right-photo-wrong-face.csv"


@pytest.fixture
def identity_metrics():
    if not METRICS_JSON.exists():
        pytest.skip("metrics.json not found")
    with open(METRICS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def identity_sweep():
    if not SWEEP_CSV.exists():
        pytest.skip("identity-threshold-sweep.csv not found")
    rows = []
    with open(SWEEP_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    return rows


def test_baseline_0400_identity_classification(identity_metrics):
    """Verify at 0.400: RPRF=91, RPWF=0, WPWF=1."""
    base = identity_metrics["baseline_0400"]
    assert base["rprf"] == 91
    assert base["rpwf"] == 0
    assert base["wpwf"] == 1
    assert round(base["identity_precision"], 4) == 0.9891
    assert round(base["identity_recall"], 4) == 0.8125


def test_0389_rpwf_classification():
    """Verify P022_R03 -> C002_f7 is RIGHT_PHOTO_WRONG_FACE at threshold 0.389."""
    if not RPWF_CSV.exists():
        pytest.skip("right-photo-wrong-face.csv not found")
    with open(RPWF_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rpwf_rows = list(reader)

    rpwf_0389 = [r for r in rpwf_rows if float(r["threshold"]) == 0.389]
    assert len(rpwf_0389) == 1
    match = rpwf_0389[0]
    assert match["query"] == "P022"
    assert match["ref_id"] == "P022_R03"
    assert match["photo"] == "C002"
    assert match["winning_face"] == "C002_f7"
    assert match["winning_assignment"] == "OTHER"
    assert match["classification"] == "RIGHT_PHOTO_WRONG_FACE"


def test_p022_c013_wrong_photo_wrong_face(identity_sweep):
    """Verify P022_R03 -> C013_f4 is WRONG_PHOTO_WRONG_FACE at threshold 0.400."""
    row_0400 = next(r for r in identity_sweep if float(r["threshold"]) == 0.400)
    assert int(row_0400["wpwf"]) == 1


def test_wprf_is_always_zero(identity_sweep):
    """Verify WRONG_PHOTO_RIGHT_FACE is always 0 (GT consistency check)."""
    for r in identity_sweep:
        assert int(r["wprf"]) == 0, f"Found wprf != 0 at threshold {r['threshold']}"
