import pytest

def evaluate_photo_ambiguity(
    face_scores: list[float],
    match_threshold: float = 0.40,
    ambiguity_guard_enabled: bool = False,
    ambiguity_margin: float = 0.002
):
    if not face_scores:
        return {"accept": False, "top1": -float("inf"), "top2": None, "margin": None, "reason": "BELOW_THRESHOLD"}
    
    sorted_scores = sorted(face_scores, reverse=True)
    top1 = sorted_scores[0]
    top2 = sorted_scores[1] if len(sorted_scores) >= 2 else None
    
    if top1 < match_threshold:
        return {"accept": False, "top1": top1, "top2": top2, "margin": None, "reason": "BELOW_THRESHOLD"}
    
    if top2 is None or top2 < match_threshold:
        return {"accept": True, "top1": top1, "top2": top2, "margin": None, "reason": "SINGLE_FACE_ACCEPTED"}
    
    margin = top1 - top2
    
    if ambiguity_guard_enabled and margin < ambiguity_margin:
        return {"accept": False, "top1": top1, "top2": top2, "margin": margin, "reason": "AMBIGUOUS_REJECT"}
    
    return {"accept": True, "top1": top1, "top2": top2, "margin": margin, "reason": "DUAL_ACCEPT_MARGIN_PASS"}


def test_case_1_single_accepted_top2_far():
    """Case 1: top1=0.50, top2=0.30 -> ACCEPT."""
    res = evaluate_photo_ambiguity([0.50, 0.30], 0.40, ambiguity_guard_enabled=True, ambiguity_margin=0.002)
    assert res["accept"] is True
    assert res["reason"] == "SINGLE_FACE_ACCEPTED"


def test_case_2_dual_accept_wide_margin():
    """Case 2: top1=0.50, top2=0.45, margin=0.05 -> ACCEPT."""
    res = evaluate_photo_ambiguity([0.50, 0.45], 0.40, ambiguity_guard_enabled=True, ambiguity_margin=0.002)
    assert res["accept"] is True
    assert res["reason"] == "DUAL_ACCEPT_MARGIN_PASS"
    assert abs(res["margin"] - 0.05) < 1e-9


def test_case_3_p025_m03_critical_ambiguous_reject():
    """Case 3: top1=0.42943495512008667, top2=0.4278484582901001, margin=0.001586... -> AMBIGUOUS_REJECT."""
    top1 = 0.42943495512008667
    top2 = 0.4278484582901001
    res = evaluate_photo_ambiguity([top1, top2], 0.40, ambiguity_guard_enabled=True, ambiguity_margin=0.002)
    assert res["accept"] is False
    assert res["reason"] == "AMBIGUOUS_REJECT"
    assert res["margin"] < 0.002


def test_case_4_ambiguous_reject_narrow_margin():
    """Case 4: top1=0.402, top2=0.401, margin=0.001 -> AMBIGUOUS_REJECT."""
    res = evaluate_photo_ambiguity([0.402, 0.401], 0.40, ambiguity_guard_enabled=True, ambiguity_margin=0.002)
    assert res["accept"] is False
    assert res["reason"] == "AMBIGUOUS_REJECT"


def test_case_5_top2_below_threshold():
    """Case 5: top1=0.402, top2=0.399 -> ACCEPT (top2 < 0.40)."""
    res = evaluate_photo_ambiguity([0.402, 0.399], 0.40, ambiguity_guard_enabled=True, ambiguity_margin=0.002)
    assert res["accept"] is True
    assert res["reason"] == "SINGLE_FACE_ACCEPTED"


def test_case_6_exact_margin_boundary_pass():
    """Case 6: top1=0.402, top2=0.400, margin=0.002 -> ACCEPT (margin >= 0.002)."""
    res = evaluate_photo_ambiguity([0.402, 0.400], 0.40, ambiguity_guard_enabled=True, ambiguity_margin=0.002)
    assert res["accept"] is True
    assert res["reason"] == "DUAL_ACCEPT_MARGIN_PASS"
    assert abs(res["margin"] - 0.002) < 1e-9


def test_case_7_top1_below_threshold():
    """Case 7: top1=0.3999 -> REJECT."""
    res = evaluate_photo_ambiguity([0.3999], 0.40, ambiguity_guard_enabled=True, ambiguity_margin=0.002)
    assert res["accept"] is False
    assert res["reason"] == "BELOW_THRESHOLD"


def test_guard_off_baseline_parity():
    """Test Guard OFF: Case 3 passes when guard is OFF."""
    top1 = 0.42943495512008667
    top2 = 0.4278484582901001
    res = evaluate_photo_ambiguity([top1, top2], 0.40, ambiguity_guard_enabled=False, ambiguity_margin=0.002)
    assert res["accept"] is True
    assert res["reason"] == "DUAL_ACCEPT_MARGIN_PASS"
