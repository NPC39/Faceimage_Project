import sys
import json
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
STAGE_C_DIR = REPO_ROOT / "experiments" / "face-calibration" / "stage-c"
MANIFEST_PATH = STAGE_C_DIR / "manifest.json"
MAPPING_PATH = STAGE_C_DIR / "results" / "face-audit" / "human-face-mapping.json"
BACKEND_DIR = REPO_ROOT / "Backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.face_service import analyze_image


@pytest.fixture
def stage_c_manifest():
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def stage_c_mapping():
    with open(MAPPING_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_1_stage_c_image_range(stage_c_manifest):
    """Test 1: Verify 27 images, C001-C027, E032.jpg-E058.jpg."""
    event_photos = stage_c_manifest["event_photos"]
    assert len(event_photos) == 27, f"Expected 27 photos, got {len(event_photos)}"
    assert event_photos[0]["photo_id"] == "C001"
    assert event_photos[-1]["photo_id"] == "C027"
    assert event_photos[0]["filename"] == "E032.jpg"
    assert event_photos[-1]["filename"] == "E058.jpg"


def test_2_visible_face_total(stage_c_mapping):
    """Test 2: Verify total visible face count equals 145."""
    total_faces = sum(len(faces) for faces in stage_c_mapping.values())
    assert total_faces == 145, f"Expected 145 visible faces, got {total_faces}"


def test_3_participant_gt_total(stage_c_mapping):
    """Test 3: Verify tracked participant GT instances equal 52."""
    participants = [f"P{i:03d}" for i in range(15, 25)]
    total_gt = sum(
        1 for faces in stage_c_mapping.values()
        for identity in faces.values() if identity in participants
    )
    assert total_gt == 52, f"Expected 52 GT instances, got {total_gt}"


def test_4_per_participant_counts(stage_c_mapping):
    """Test 4: Verify exact per-participant GT counts (3,4,8,6,4,4,6,4,4,9)."""
    expected = {
        "P015": 3,
        "P016": 4,
        "P017": 8,
        "P018": 6,
        "P019": 4,
        "P020": 4,
        "P021": 6,
        "P022": 4,
        "P023": 4,
        "P024": 9,
    }
    actual = {p: 0 for p in expected}
    for faces in stage_c_mapping.values():
        for identity in faces.values():
            if identity in actual:
                actual[identity] += 1

    for p, count in expected.items():
        assert actual[p] == count, f"Expected {count} for {p}, got {actual[p]}"


def test_5_face_id_uniqueness(stage_c_mapping):
    """Test 5: Verify 145 unique Detection IDs."""
    all_det_ids = [det_id for faces in stage_c_mapping.values() for det_id in faces.keys()]
    assert len(all_det_ids) == 145
    assert len(set(all_det_ids)) == 145, "Duplicate Detection IDs found!"


def test_6_face_index_continuity(stage_c_mapping):
    """Test 6: Verify each photo contains f0...f(n-1) with no gaps."""
    for photo_id, faces in stage_c_mapping.items():
        n = len(faces)
        expected_keys = [f"{photo_id}_f{i}" for i in range(n)]
        actual_keys = list(faces.keys())
        assert actual_keys == expected_keys, f"Discontinuity in {photo_id}: {actual_keys} vs {expected_keys}"


def test_7_assignment_ground_truth_consistency(stage_c_manifest, stage_c_mapping):
    """Test 7: Verify derived participant presence from face assignments equals manifest GT."""
    for photo in stage_c_manifest["event_photos"]:
        p_id = photo["photo_id"]
        manifest_persons = set(photo["persons_present"])
        mapped_faces = stage_c_mapping.get(p_id, {})
        derived_persons = set(v for v in mapped_faces.values() if v != "OTHER")

        assert derived_persons == manifest_persons, (
            f"Mismatch for {p_id} ({photo['filename']}): "
            f"Derived {derived_persons} != Manifest {manifest_persons}"
        )


def test_8_c015_regression(stage_c_mapping, stage_c_manifest):
    """Test 8: Verify C015 regression requirements."""
    c015_mapping = stage_c_mapping["C015"]
    assert len(c015_mapping) == 2
    assert c015_mapping["C015_f0"] == "P021"
    assert c015_mapping["C015_f1"] == "P017"

    c015_meta = next(p for p in stage_c_manifest["event_photos"] if p["photo_id"] == "C015")
    assert set(c015_meta["persons_present"]) == {"P017", "P021"}


def test_9_c020_regression(stage_c_mapping, stage_c_manifest):
    """Test 9: Verify C020 regression requirements."""
    c020_mapping = stage_c_mapping["C020"]
    assert len(c020_mapping) == 5
    assert c020_mapping["C020_f2"] == "P016"
    assert c020_mapping["C020_f0"] == "OTHER"
    assert c020_mapping["C020_f1"] == "OTHER"
    assert c020_mapping["C020_f3"] == "OTHER"
    assert c020_mapping["C020_f4"] == "OTHER"

    c020_meta = next(p for p in stage_c_manifest["event_photos"] if p["photo_id"] == "C020")
    assert set(c020_meta["persons_present"]) == {"P016"}


def test_10_c023_expanded_assignment(stage_c_mapping):
    """Test 10: Verify C023 expanded assignment across all 20 rows."""
    c023_mapping = stage_c_mapping["C023"]
    assert len(c023_mapping) == 20
    assert c023_mapping["C023_f4"] == "P024"
    assert c023_mapping["C023_f9"] == "P020"
    assert c023_mapping["C023_f13"] == "P017"
    assert c023_mapping["C023_f15"] == "P021"
    assert c023_mapping["C023_f17"] == "P023"

    for i in range(20):
        if i not in [4, 9, 13, 15, 17]:
            assert c023_mapping[f"C023_f{i}"] == "OTHER", f"Expected OTHER at C023_f{i}"


def test_11_exact_p022_photo_set(stage_c_mapping):
    """Test 11: Assert P022 photos == {C002, C009, C010, C012}."""
    p022_photos = {
        photo_id for photo_id, faces in stage_c_mapping.items()
        if "P022" in faces.values()
    }
    assert p022_photos == {"C002", "C009", "C010", "C012"}, f"Got P022 photos: {p022_photos}"


def test_12_exact_p022_face_ids(stage_c_mapping):
    """Test 12: Assert P022 face IDs == {C002_f0, C009_f0, C010_f10, C012_f5}."""
    p022_face_ids = {
        det_id for faces in stage_c_mapping.values()
        for det_id, identity in faces.items() if identity == "P022"
    }
    assert p022_face_ids == {"C002_f0", "C009_f0", "C010_f10", "C012_f5"}, f"Got P022 face IDs: {p022_face_ids}"


def test_13_corrected_critical_face_assignments(stage_c_mapping):
    """Test 13: Assert exact face mapping for critical corrected faces."""
    expected = {
        "C002_f0": "P022",
        "C002_f7": "OTHER",
        "C008_f17": "OTHER",
        "C009_f0": "P022",
        "C010_f10": "P022",
        "C012_f5": "P022",
        "C013_f4": "OTHER",
        "C013_f5": "P015",
    }
    for det_id, expected_identity in expected.items():
        photo_id = det_id.split("_")[0]
        actual_identity = stage_c_mapping[photo_id][det_id]
        assert actual_identity == expected_identity, (
            f"Expected {det_id} == {expected_identity}, got {actual_identity}"
        )


def test_14_exact_per_photo_presence_sets(stage_c_manifest, stage_c_mapping):
    """Test 14: Assert GT YES set == Human Assignment participant set for all 27 photos."""
    for photo in stage_c_manifest["event_photos"]:
        photo_id = photo["photo_id"]
        gt_yes_set = set(photo["persons_present"])
        faces = stage_c_mapping[photo_id]
        human_assignment_set = set(v for v in faces.values() if v != "OTHER")

        missing = gt_yes_set - human_assignment_set
        unexpected = human_assignment_set - gt_yes_set

        assert gt_yes_set == human_assignment_set, (
            f"Mismatch in {photo_id} ({photo['filename']}):\n"
            f"  GT YES set: {gt_yes_set}\n"
            f"  Human Assignment set: {human_assignment_set}\n"
            f"  Missing identities: {missing}\n"
            f"  Unexpected identities: {unexpected}"
        )
