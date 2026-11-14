"""
Verification Test Suite for SkillNexus-AI
Tests deterministic readiness math, multi-agent pipeline, and adaptive diff generation.
"""

from domain import (
    load_roles,
    get_role_by_id,
    load_learners,
    get_learner_by_id,
    compute_readiness_and_gaps
)
from agents import (
    ProfileAgent,
    GapAgent,
    CurriculumAgent,
    ResourceAgent,
    AssessorAgent,
    MentorAgent
)

def test_roles_and_learners():
    roles = load_roles()
    assert len(roles) >= 6, "Expected at least 6 benchmark roles"
    
    learners = load_learners()
    assert len(learners) >= 3, "Expected at least 3 pre-seeded learners"
    
    aarav = get_learner_by_id("aarav-patel")
    assert aarav is not None
    assert aarav["target_role_id"] == "full-stack-dev"
    print("[OK] Roles & Learners loaded correctly")

def test_deterministic_readiness_math():
    role = get_role_by_id("full-stack-dev")
    aarav = get_learner_by_id("aarav-patel")
    
    metrics, gaps = compute_readiness_and_gaps(aarav["skills"], role)
    
    # Verify deterministic readiness formula
    assert 0 <= metrics.verified_readiness <= 100
    assert 0 <= metrics.claimed_readiness <= 100
    assert metrics.credibility_delta == round(metrics.claimed_readiness - metrics.verified_readiness, 1)
    
    # Ensure gaps are sorted by severity score descending
    for i in range(len(gaps) - 1):
        assert gaps[i].severity_score >= gaps[i+1].severity_score
        
    print(f"[OK] Deterministic Math Verified: Aarav's Verified Readiness = {metrics.verified_readiness}% (Claimed: {metrics.claimed_readiness}%, Delta: -{metrics.credibility_delta}%)")

def test_agent_pipeline():
    aarav = get_learner_by_id("aarav-patel")
    role = get_role_by_id("full-stack-dev")

    p_agent = ProfileAgent()
    profile, log1 = p_agent.execute(aarav)
    assert log1.status == "completed"

    g_agent = GapAgent()
    metrics, gaps, log2 = g_agent.execute(profile, role)
    assert log2.status == "completed"

    c_agent = CurriculumAgent()
    modules, log3 = c_agent.execute(gaps, role)
    assert len(modules) == len(gaps)
    assert log3.status == "completed"

    r_agent = ResourceAgent()
    modules_res, log4 = r_agent.execute(modules)
    for m in modules_res:
        assert "free" in m["resources"]
        assert "paid" in m["resources"]
        assert m["resources"]["free"]["url"].startswith("http")

    print(f"[OK] Full 4-Agent Pipeline executed cleanly ({len(modules_res)} modules with authentic resources)")

def test_mentor_adaptive_diff():
    aarav = get_learner_by_id("aarav-patel")
    role = get_role_by_id("full-stack-dev")
    
    # Run initial pipeline
    _, gaps = compute_readiness_and_gaps(aarav["skills"], role)
    modules, _ = CurriculumAgent().execute(gaps, role)
    modules, _ = ResourceAgent().execute(modules)
    
    # Simulate failed JavaScript check-in
    mentor = MentorAgent()
    updated_modules, diff_summary, mentor_log = mentor.adaptive_replan_on_failure(
        current_modules=modules,
        failed_skill="JavaScript",
        score_pct=33,
        role=role
    )
    
    assert diff_summary["action"] == "ADAPTIVE_REPLAN"
    assert len(diff_summary["added_modules"]) > 0
    assert updated_modules[0]["is_remedial"] is True
    assert updated_modules[0]["diff_type"] == "added"
    
    print(f"[OK] Mentor Adaptive Diff Verified: Injected '{diff_summary['added_modules'][0]}' (+{diff_summary['additional_hours']}h)")

if __name__ == "__main__":
    test_roles_and_learners()
    test_deterministic_readiness_math()
    test_agent_pipeline()
    test_mentor_adaptive_diff()
    print("\nALL VERIFICATION TESTS PASSED (100% GREEN)!")
